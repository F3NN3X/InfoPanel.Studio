import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { builtinItems, configItems } from "@/lib/my-library/config-items";
import { deleteConfigItems, isSavedInConfig, pickedAfterClick, planDelete } from "@/components/library/multi-delete";

const NONE = { toggle: false, range: false };
const hash = (c: string) => c.repeat(64);

const file = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  kind: "image",
  name: id,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  files: [`${hash(id[0])}.png`],
  meta: {},
  copies: [],
  ...over,
});

describe("pickedAfterClick", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("a plain click outside Select mode picks nothing", () => {
    expect(pickedAfterClick(["a", "b"], "a", order, "c", NONE, false)).toEqual([]);
  });

  it("Ctrl toggles a card, starting from the card selected on its own", () => {
    expect(pickedAfterClick([], "a", order, "c", { toggle: true, range: false }, false)).toEqual(["a", "c"]);
    expect(pickedAfterClick(["a", "c"], "c", order, "c", { toggle: true, range: false }, false)).toEqual(["a"]);
  });

  it("Shift takes the range from the selected card, either way round", () => {
    expect(pickedAfterClick([], "b", order, "d", { toggle: false, range: true }, false)).toEqual(["b", "c", "d"]);
    expect(pickedAfterClick([], "d", order, "b", { toggle: false, range: true }, false)).toEqual(["b", "c", "d"]);
  });

  it("Shift with nothing selected, or a card that isn't shown, just ticks the card", () => {
    expect(pickedAfterClick([], null, order, "c", { toggle: false, range: true }, false)).toEqual(["c"]);
    expect(pickedAfterClick([], "zz", order, "c", { toggle: false, range: true }, false)).toEqual(["zz", "c"]);
  });

  it("Select mode ticks and unticks on a plain click", () => {
    expect(pickedAfterClick([], null, order, "b", NONE, true)).toEqual(["b"]);
    expect(pickedAfterClick(["b"], "b", order, "b", NONE, true)).toEqual([]);
  });
});

describe("planDelete", () => {
  it("never deletes a built-in, and says so", () => {
    const builtin = builtinItems()[0];
    const plan = planDelete([builtin, file("a")], new Set());
    expect(plan.remove.map((i) => i.id)).toEqual(["a"]);
    expect(plan.kept).toEqual([{ item: builtin, why: "built-in" }]);
  });

  it("keeps an image, video or SVG whose file the config names", () => {
    const used = file("a");
    const unused = file("b");
    const video = file("c", { kind: "video", files: [`${hash("c")}.mp4`] });
    const plan = planDelete([used, unused, video], new Set([hash("a"), hash("c")]));
    expect(plan.remove.map((i) => i.id)).toEqual(["b"]);
    expect(plan.kept.map((k) => [k.item.id, k.why])).toEqual([
      ["a", "used"],
      ["c", "used"],
    ]);
  });

  it("deletes everything else picked: saved config items and items of other kinds", () => {
    const [saved] = configItems({ panelPresets: [], stylePresets: [{ id: "s1", name: "Mine", settings: {} }], appearancePresets: [] });
    const gauge = file("g", { kind: "gauge", files: [], copies: [{ profileId: "p" }] });
    const plan = planDelete([saved, gauge], new Set());
    expect(plan.remove).toHaveLength(2);
    expect(plan.kept).toEqual([]);
  });

  it("an empty pick comes to nothing", () => {
    expect(planDelete([], new Set())).toEqual({ remove: [], kept: [] });
  });
});

describe("deleteConfigItems", () => {
  it("deletes saved Themes, Styles and panels in one edit and leaves everything else", () => {
    const base = defaultConfig();
    const config = {
      ...base,
      panelPresets: [{ id: "p1", name: "P" }, { id: "p2", name: "P2" }] as never,
      stylePresets: [{ id: "s1", name: "S", settings: {} }],
      appearancePresets: [{ id: "t1", name: "T", description: "", theme: "ocean" as const, radius: 0.5, style: {} }, { id: "t2", name: "T2", description: "", theme: "ocean" as const, radius: 0.5, style: {} }],
    };
    const items = configItems(config).filter((i) => isSavedInConfig(i));
    const pick = items.filter((i) => ["P", "S", "T"].includes(i.name));
    const next = deleteConfigItems(config, pick);
    expect(next.panelPresets?.map((p) => p.id)).toEqual(["p2"]);
    expect(next.stylePresets).toBeUndefined();
    expect(next.appearancePresets?.map((p) => p.id)).toEqual(["t2"]);
    expect(next.profiles).toBe(config.profiles);
  });

  it("ignores a built-in handed to it", () => {
    const config = defaultConfig();
    const builtin = configItems(config).find((i) => i.id.startsWith("builtin-"))!;
    expect(deleteConfigItems(config, [builtin])).toEqual(config);
  });
});
