import { describe, expect, it } from "vitest";
import { selectedRow } from "@/components/infopanel/remap-panel";
import type { RemapRow } from "@/lib/infopanel/remap/remap";

const row = (id: string, paths: string[]) => ({ group: { id, paths }, match: null, state: "unresolved" }) as unknown as RemapRow;

describe("the Remap panel's selected row", () => {
  it("stays on the group a choice renamed, found by its first item", () => {
    const rows = [row("libre:/a|A", ["0"]), row("hwinfo:-1/1/0/2|Fps", ["1", "2.0"])];
    expect(selectedRow(rows, { id: "hwinfo:-1/1/0/2|Fps", path: "1" })).toBe(rows[1]);
    // The choice rebound items 1 and 2.0: their group has a new id.
    expect(selectedRow(rows, { id: "libre:/b|B", path: "2.0" })).toBe(rows[1]);
    expect(selectedRow(rows, { id: "gone", path: "9" })).toBeUndefined();
    expect(selectedRow(rows, null)).toBeUndefined();
  });
});
