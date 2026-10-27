// The keyboard on a screen page's selected parts (Edit v3 SPEC §14, acceptance 16, 26): each key one set of ops, so one
// undo step; locked parts aren't moved or deleted.
import { describe, expect, it } from "vitest";
import { ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { partKeyOps, type PartKey } from "@/lib/page-model/keys";
import { applyPlacements, readPlacements } from "@/lib/page-model/placements-adapter";

const item = (id: string, x: number, extra: Partial<Placement> = {}): Placement => ({
  id, module: ITEM_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true,
  item: { kind: "Text", Name: id, X: x, Y: 10, unknown: {} }, px: { x, y: 10, w: 40, h: 20 }, ...extra,
});
const profile: MonitorProfile = { id: "s", name: "S", width: 800, height: 500, cols: 8, rows: 5, fit: "fill", gap: 0, padding: 0, pages: [] };
// Bottom first: a, b, c (c on top), b locked.
const page: ProfilePage = { id: "p", name: "P", placements: [item("a", 10), item("b", 60, { locked: true }), item("c", 110)] };
const key = (k: string, mods: Partial<PartKey> = {}): PartKey => ({ key: k, ctrl: false, shift: false, alt: false, ...mods });
let n = 0;
const newId = (prefix: string) => `${prefix}-${++n}`;

/** The page after a key on the selected ids, and what the key said. */
function press(ids: string[], k: PartKey, on: ProfilePage = page) {
  const r = partKeyOps(readPlacements(profile, on), ids, k, newId);
  return { r, page: r && "ops" in r ? applyPlacements(profile, on, r.ops) : on };
}
const order = (p: ProfilePage) => p.placements.map((x) => x.id);

describe("part keys", () => {
  it("Ctrl+] brings forward, Ctrl+[ sends backward, with Shift to the front and the back", () => {
    expect(order(press(["a"], key("]", { ctrl: true, code: "BracketRight" })).page)).toEqual(["b", "a", "c"]);
    expect(order(press(["c"], key("[", { ctrl: true, code: "BracketLeft" })).page)).toEqual(["a", "c", "b"]);
    expect(order(press(["a"], key("}", { ctrl: true, shift: true, code: "BracketRight" })).page)).toEqual(["b", "c", "a"]);
    expect(order(press(["c"], key("{", { ctrl: true, shift: true, code: "BracketLeft" })).page)).toEqual(["c", "a", "b"]);
    expect(press(["c"], key("]", { ctrl: true, code: "BracketRight" })).r).toEqual({ ops: [] });
  });

  it("Del deletes the unlocked parts and clears the selection; Esc clears it", () => {
    const { r, page: next } = press(["a", "b"], key("Delete"));
    expect(order(next)).toEqual(["b", "c"]);
    expect(r).toMatchObject({ select: [] });
    expect(press(["a"], key("Escape")).r).toEqual({ clear: true });
  });

  it("Ctrl+L locks (unlocks when all are locked), Ctrl+H hides", () => {
    expect(press(["a", "b"], key("l", { ctrl: true })).page.placements.filter((p) => p.locked).map((p) => p.id)).toEqual(["a", "b"]);
    expect(press(["b"], key("l", { ctrl: true })).page.placements.some((p) => p.locked)).toBe(false);
    expect(press(["a"], key("h", { ctrl: true })).page.placements[0].visible).toBe(false);
  });

  it("Ctrl+G groups the selection, Ctrl+Shift+G ungroups the group the part is in", () => {
    const grouped = press(["a", "c"], key("g", { ctrl: true })).page;
    expect(grouped.groups).toEqual([{ id: expect.stringMatching(/^group-/), name: "Group 1" }]);
    expect(grouped.placements.filter((p) => p.groupId).map((p) => p.id)).toEqual(["a", "c"]);
    const ungrouped = press(["a"], key("G", { ctrl: true, shift: true }), grouped).page;
    expect(ungrouped.groups).toBeUndefined();
    expect(ungrouped.placements.some((p) => p.groupId)).toBe(false);
  });

  it("Ctrl+D duplicates on top, a placed-freely copy 10 px down and right, and selects the copy", () => {
    const { r, page: next } = press(["a"], key("d", { ctrl: true }));
    expect(next.placements).toHaveLength(4);
    const copy = next.placements.at(-1)!;
    expect(r).toMatchObject({ select: [copy.id] });
    expect(copy).toMatchObject({ module: ITEM_ID, px: { x: 20, y: 20, w: 40, h: 20 }, item: { Name: "a", X: 20, Y: 20 } });
  });

  it("arrows nudge the unlocked parts as one coalesced step; a key it doesn't know does nothing", () => {
    const { r, page: next } = press(["a", "b"], key("ArrowLeft", { alt: true }));
    expect(r).toMatchObject({ merge: "part-keys" });
    expect(next.placements.map((p) => p.px!.x)).toEqual([9, 60, 110]);
    expect(press(["a"], key("q")).r).toBeNull();
  });
});
