// Undo in words (E3): named from two snapshots, with nothing stored.
import { describe, expect, it } from "vitest";
import { describeChange, stepSentence, valueWords } from "@/components/studio/editor/undo-describe";
import type { DashboardConfig, Placement } from "@/lib/layout";
import type { ModuleSetting } from "@/modules/types";

const zone = (over: Partial<Placement> = {}) => ({ id: "z1", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true, settings: {}, ...over }) as Placement;
const config = (placements: Placement[], name = "Desk", page = "Main") =>
  ({ profiles: [{ id: "s", name, pages: [{ id: "p", name: page, placements }] }] }) as unknown as DashboardConfig;

describe("describeChange", () => {
  it("names a change to the pinned layer", () => {
    const a = config([zone()]);
    const pinned = { items: [{ id: "rail", edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: "r", module: "PageRail" } }] };
    const b = { ...a, profiles: [{ ...a.profiles[0], pinned }] } as unknown as DashboardConfig;
    expect(describeChange(a, b)?.text).toBe("Edit the pinned layer");
  });

  it("is nothing for no step, or one that is not a screen's", () => {
    const a = config([zone()]);
    expect(describeChange(a, a)).toBeNull();
    expect(describeChange(a, { ...a, alerts: [] } as unknown as DashboardConfig)).toBeNull();
  });

  it("names a part's move, resize, hide, add and delete", () => {
    const a = config([zone()]);
    const after = (over: Partial<Placement>) => describeChange(a, config([zone(over)]))?.text;
    expect(after({ colStart: 3 })).toMatch(/^Move /);
    expect(after({ colSpan: 3 })).toMatch(/^Resize /);
    expect(after({ visible: false })).toMatch(/^Hide /);
    expect(describeChange(a, config([zone(), zone({ id: "z2" })]))?.text).toMatch(/^Add /);
    expect(describeChange(a, config([]))).toMatchObject({ text: expect.stringMatching(/^Delete /), target: { zoneId: "z1" } });
  });

  it("counts what a step changed when there is no one name for it", () => {
    const a = config([zone(), zone({ id: "z2" })]);
    expect(describeChange(a, config([zone({ colStart: 3 }), zone({ id: "z2", colStart: 5 })]))?.text).toBe("2 widgets");
    expect(describeChange(config([zone()]), config([zone({ settings: { a: 1, b: 2 } })]))?.text).toBe("2 settings");
  });

  it("names a rename, of a page or a screen", () => {
    expect(describeChange(config([], "Desk", "Main"), config([], "Desk", "Stats"))?.text).toBe("Rename page to Stats");
    expect(describeChange(config([], "Desk"), config([], "Rig"))?.text).toBe("Rename screen to Rig");
  });
});

describe("valueWords", () => {
  const def = { key: "k", label: "K", options: [{ value: "vram", label: "VRAM" }] } as unknown as ModuleSetting;

  it("words a value as the inspector does, and gives up on a long one", () => {
    expect(valueWords(def, "vram")).toBe("VRAM");
    expect(valueWords(def, true)).toBe("On");
    expect(valueWords(def, 4)).toBe("4");
    expect(valueWords(def, undefined)).toBe("default");
    expect(valueWords(def, "x".repeat(25))).toBeNull();
  });
});

describe("stepSentence", () => {
  it("reads as the toast does", () => {
    expect(stepSentence("Undid", { text: "Outer ring → VRAM", on: "GPU Rings" })).toBe("Undid Outer ring → VRAM on GPU Rings");
    expect(stepSentence("Redid", null)).toBe("Redid the last change");
  });
});
