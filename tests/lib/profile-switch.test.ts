import { describe, expect, it } from "vitest";
import type { MonitorProfile } from "@/lib/layout";
import { exeKey, parseExeList, pickerRows, ruleMatches } from "@/lib/profile-switch";

const profile = (id: string, width: number, pages: number, exe?: string[]): MonitorProfile =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), width, height: 600, pages: Array.from({ length: pages }, (_, i) => ({ id: `${id}${i}`, name: "P", placements: [] })), ...(exe ? { autoSwitch: { exe } } : {}) }) as unknown as MonitorProfile;

const ALL = [
  profile("main", 1024, 5),
  profile("coding", 1024, 1, ["Code.exe", "WindowsTerminal.exe"]),
  profile("bar", 1920, 2, ["Code.exe"]),
  profile("other", 1024, 1, ["code"]),
];

describe("profile auto-switch rules", () => {
  it("compare program names as the server does: file name, any case, .exe optional", () => {
    expect(exeKey("C:\\Program Files\\Microsoft VS Code\\Code.EXE")).toBe("code");
    expect(exeKey(" obs64 ")).toBe("obs64");
    expect(ruleMatches(ALL[1], "code.exe")).toBe(true);
    expect(ruleMatches(ALL[3], "Code.exe")).toBe(true);
    expect(ruleMatches(ALL[1], undefined)).toBe(false);
    expect(ruleMatches(ALL[0], "Code.exe")).toBe(false);
  });

  it("list the profiles of the shown one's size, with the default, the rules and the first match", () => {
    expect(pickerRows(ALL, "main", "main", "Code.exe")).toEqual([
      { id: "main", name: "Main", index: 0, detail: "Default · 5 pages", current: true, matches: false },
      { id: "coding", name: "Coding", index: 1, detail: "Auto: Code.exe, WindowsTerminal.exe", current: false, matches: true },
      { id: "other", name: "Other", index: 3, detail: "Auto: code", current: false, matches: false },
    ]);
    // the shown profile is never marked as a match, and an unknown one lists nothing
    expect(pickerRows(ALL, "coding", "main", "Code.exe").some((r) => r.matches)).toBe(false);
    expect(pickerRows(ALL, "gone", "main")).toEqual([]);
    expect(pickerRows([profile("solo", 800, 1)], "solo", "x").map((r) => r.detail)).toEqual(["1 page"]);
  });

  it("read typed program names: commas or lines, trimmed, each once", () => {
    expect(parseExeList(" Code.exe, obs64\nCode.exe ,, ")).toEqual(["Code.exe", "obs64"]);
    expect(parseExeList("  ")).toEqual([]);
  });
});
