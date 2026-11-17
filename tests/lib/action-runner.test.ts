import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIONS_RUN_URL, changeActions, resultNote, runCommand } from "@/lib/action-runner";

// The action runner's client (pinned layer P7): the server's answers come back as what the kiosk says.

afterEach(() => {
  vi.unstubAllGlobals();
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
