import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIONS_RUN_URL, changeActions, commandsIn, configCommands, distinctCommands, resultNote, runCommand } from "@/lib/action-runner";
import type { MonitorProfile } from "@/lib/layout";

// The action runner's client (pinned layer P7): every command a profile names is found for the import's review (a key, a
// folder's key, a widget's or a rail item's touch, a rail action), and the server's answers come back as what the kiosk says.

afterEach(() => {
  vi.unstubAllGlobals();
});

const run = (command: string, confirm?: boolean) => ({ op: "run" as const, command, ...(confirm ? { confirm } : {}) });

const PROFILE = {
  id: "p",
  name: "Desk",
  pages: [
    {
      id: "main",
      name: "Main",
      placements: [
        { id: "k", module: "Keys", name: "Launch", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, keys: [{ id: "a", name: "Notes", touch: { tap: run("notepad.exe") } }, { id: "f", name: "Apps", keys: [{ id: "c", name: "Calc", touch: { doubleTap: run("calc.exe", true) } }] }] },
        { id: "w", module: "Clock", colStart: 3, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, touch: { hold: run("notepad.exe"), tap: { op: "page", to: "next" } } },
      ],
    },
  ],
  pinned: {
    items: [
      {
        id: "rail",
        edge: "left",
        mode: "room",
        thickness: 84,
        show: "all",
        visible: true,
        placement: { id: "r", module: "PageRail" },
        rail: [
          { id: "s", group: "actions", name: "Lock", target: { kind: "action", action: run("rundll32.exe user32.dll,LockWorkStation") } },
          { id: "t", group: "pages", target: { kind: "page", pageId: "main" }, touch: { hold: run("explorer.exe") } },
        ],
      },
    ],
  },
} as unknown as MonitorProfile;

describe("the commands a profile names", () => {
  it("are found on keys, folders, widgets and the rail, each with where", () => {
    expect(commandsIn(PROFILE)).toEqual([
      { command: "notepad.exe", profile: "Desk", where: "Main › Launch › Notes, tap" },
      { command: "calc.exe", profile: "Desk", where: "Main › Launch › Calc, double tap" },
      { command: "notepad.exe", profile: "Desk", where: "Main › Clock, hold" },
      { command: "rundll32.exe user32.dll,LockWorkStation", profile: "Desk", where: "Pinned › Lock" },
      { command: "explorer.exe", profile: "Desk", where: "Pinned › Rail item, hold" },
    ]);
    expect(distinctCommands(configCommands({ profiles: [PROFILE, { ...PROFILE, name: "Copy" }] }))).toEqual(["notepad.exe", "calc.exe", "rundll32.exe user32.dll,LockWorkStation", "explorer.exe"]);
    expect(commandsIn({ ...PROFILE, pinned: undefined, pages: [] })).toEqual([]);
  });
});

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("a run", () => {
  it("posts the command with the control header, and reads a dry run as what would start", async () => {
    const fetch = answer(200, { ran: false, dry: true, program: "notepad.exe", args: ["a b.txt"] });
    vi.stubGlobal("fetch", fetch);
    const r = await runCommand('notepad.exe "a b.txt"', true);
    expect(fetch).toHaveBeenCalledWith(ACTIONS_RUN_URL, expect.objectContaining({ method: "POST", body: JSON.stringify({ command: 'notepad.exe "a b.txt"', dry: true }) }));
    const init = (fetch.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Dashboard-Control": "1" });
    expect(r).toEqual({ ran: false, dry: true, program: "notepad.exe", args: ["a b.txt"] });
    expect(resultNote(r)).toBe('Test mode: would run notepad.exe "a b.txt"');
  });

  it("says why one did not run, and nothing for one that started", async () => {
    vi.stubGlobal("fetch", answer(403, { error: "Running commands is off.", reason: "off" }));
    const off = await runCommand("calc.exe");
    expect(off).toEqual({ ran: false, refused: "off", error: "Running commands is off." });
    expect(resultNote(off)).toBe("Running commands is off.");
    vi.stubGlobal("fetch", answer(400, "a quote is not closed"));
    expect(await runCommand('a "b')).toEqual({ ran: false, refused: "command", error: "a quote is not closed" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect((await runCommand("calc.exe")).refused).toBe("network");
    vi.stubGlobal("fetch", answer(200, { ran: true, dry: false, program: "calc.exe", args: [] }));
    expect(resultNote(await runCommand("calc.exe"))).toBeNull();
  });

  it("gives an approval's refusal back as words", async () => {
    vi.stubGlobal("fetch", answer(403, { error: "Commands are approved on the PC running InfoPanel Studio only.", reason: "remote" }));
    expect(await changeActions({ approve: ["calc.exe"] })).toEqual({ error: "Commands are approved on the PC running InfoPanel Studio only." });
    vi.stubGlobal("fetch", answer(200, { runner: true, obsStream: false, testMode: false, approved: ["calc.exe"] }));
    expect(await changeActions({ approve: ["calc.exe"] })).toEqual({ runner: true, obsStream: false, testMode: false, approved: ["calc.exe"] });
  });
});
