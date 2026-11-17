import { describe, expect, it } from "vitest";
import { commandsIn, configCommands, distinctCommands } from "@/lib/action-commands";
import type { MonitorProfile } from "@/lib/layout";

// The commands a profile names (pinned layer P7), found for the import's review: a key, a folder's key, a widget's or a rail
// item's touch, a rail action.

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
