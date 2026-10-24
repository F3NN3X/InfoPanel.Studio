import { describe, expect, it } from "vitest";
import { defaultPalette, normalizeInk, normalizePalette, resolveInk, SLOTS } from "@/lib/infopanel/elements/palette.ts";
import { normalizeElement } from "@/lib/infopanel/elements/spec.ts";

const red = { color: "#FFFF0000" };

describe("normalizeElement", () => {
  it.each([
    ["not an object", 5, null],
    ["an unknown type", { type: "blob" }, null],
    ["a ring without a fill", { type: "ring", fill: [] }, null],
    ["a card with only unreadable colours", { type: "card", fill: [{ color: "red" }] }, null],
    ["an icon with a name that is not an icon id", { type: "icon", name: "<svg>", color: red }, null],
  ])("refuses %s", (_label, raw, want) => {
    expect(normalizeElement(raw)).toBe(want);
  });

  it("keeps a ring in range, with at most three stops and only known fields", () => {
    const ring = normalizeElement({ type: "ring", fill: [red, red, red, red], thickness: 9999, sweep: 0, ticks: 2.4, extra: 1, track: { color: "#123" } });
    expect(ring).toMatchObject({ type: "ring", thickness: 512, sweep: 1, ticks: 2, track: { color: "#FF112233" } });
    expect(ring && "fill" in ring && ring.fill).toHaveLength(3);
    expect(ring).not.toHaveProperty("extra");
  });

  it("reads a card's optional stroke, shadow and glow, and nothing when they are null", () => {
    expect(normalizeElement({ type: "card", fill: [red], stroke: null, shadow: null, glow: null })).toMatchObject({ stroke: null, shadow: null, glow: null, pad: 0 });
    expect(normalizeElement({ type: "card", fill: [red], stroke: red, shadow: { blur: 200 }, glow: { blur: 0, color: red } })).toMatchObject({
      stroke: red, shadow: { blur: 64, dx: 0, dy: 4 }, glow: { blur: 1, color: red },
    });
  });

  it("drops a wrong slot but keeps the colour", () => {
    expect(normalizeInk({ color: "#FF00FF00", slot: "nope" })).toEqual({ color: "#FF00FF00" });
    expect(normalizeInk({ color: "#FF00FF00", slot: "warn" })).toEqual({ color: "#FF00FF00", slot: "warn" });
    expect(normalizeInk({ slot: "warn" })).toBeNull();
  });
});

describe("the palette", () => {
  const profile = { BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF" };
  const def = defaultPalette(profile);

  it("starts from the profile: accent 1 is the styled defaults' accent, track and card as before", () => {
    expect(def).toMatchObject({ accent1: "#FF3B82F6", text: "#FFFFFFFF", track: "#FF2C2C2E", card: "#FF1B1B1D" });
    expect(Object.keys(def)).toEqual([...SLOTS]);
  });

  it("reads a stored palette slot by slot, a wrong slot taking the default", () => {
    expect(normalizePalette({ accent1: "#f00", warn: "nope", extra: "#FFFFFFFF" }, def)).toEqual({ ...def, accent1: "#FFFF0000" });
  });

  it("resolves an ink from its slot and leaves a fixed one", () => {
    expect(resolveInk({ color: "#FF000000", slot: "crit" }, def)).toEqual({ color: def.crit, slot: "crit" });
    expect(resolveInk(red, def)).toBe(red);
  });
});
