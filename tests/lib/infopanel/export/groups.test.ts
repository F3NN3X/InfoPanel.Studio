import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { FRESH, infopanelExport } from "@/lib/infopanel/export/write.ts";
import { fullProfile, nestedGroups } from "./kind-cases.ts";

describe("a profile with nested groups made by the editor", () => {
  it("exports and parses back identically, groups, order and positions included", async () => {
    const items = nestedGroups();
    // Outer { a, Inner { d, b, c } }, e: two levels deep, no child offset by its group.
    const [outer, e] = items;
    expect([outer.Name, e.Name]).toEqual(["Outer", "e"]);
    expect(outer.kind === "Group" && outer.DisplayItems.map((i) => i.Name)).toEqual(["a", "Inner"]);
    const inner = outer.kind === "Group" ? outer.DisplayItems[1] : undefined;
    expect(inner?.kind === "Group" && inner.DisplayItems.map((i) => [i.Name, i.X, i.Y])).toEqual([["d", 30, 35], ["b", 10, 15], ["c", 20, 25]]);

    const back = await loadExport(entriesFromZip(infopanelExport(fullProfile(), items, [])));
    expect(back.items).toEqual(items);
    expect(back.profile).toEqual({ ...fullProfile(), ...FRESH });
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
  });
});
