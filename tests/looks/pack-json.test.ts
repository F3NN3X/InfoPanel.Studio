import { describe, expect, it } from "vitest";
import { effectIssues } from "@/looks/effects";
import { FX_KINDS, packDecor } from "@/looks/pack-json";

describe("packDecor", () => {
  it("reads an old chamfer edge as a cut frame on every corner with no stroke", () => {
    expect(packDecor({ edge: { kind: "chamfer", cut: 12 } }).frame).toEqual({ corners: "cut", size: 12, which: ["tl", "tr", "br", "bl"], stroke: 0 });
  });

  it("draws no frame for an edge the app never drew", () => {
    expect(packDecor({ edge: { kind: "distressed" } }).frame).toBeUndefined();
    expect(packDecor({ edge: { kind: "none" } }).frame).toBeUndefined();
  });

  it("prefers frame and keeps the old ornament as the slot's declared size", () => {
    const frame = { corners: "bracket" as const, size: 8 };
    const out = packDecor({ frame, ornaments: [{ kind: "ticks", at: "top" }], ornament: { size: 6 } });
    expect(out).toEqual({ frame, ornaments: [{ kind: "ticks", at: "top" }], slot: { size: 6 } });
  });

  it("gives an empty ornament list when the pack names none", () => {
    expect(packDecor({}).ornaments).toEqual([]);
  });
});

describe("the flashing kinds", () => {
  it.each(FX_KINDS)("refuses %s unless it declares cost animated", (kind) => {
    expect(effectIssues([{ kind, cost: "static" }])).toContain(`effect 0: ${kind} is animated: cost animated`);
  });
});
