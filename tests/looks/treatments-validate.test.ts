// The component treatments' format (Cyberspec v2, lane K): the T3 treatment tokens, the frame's outside and surface parts and the stage's
// grid and chrome, each accepted inside its range and refused outside it, and the slab ink held to 4.5:1 on every tone a slab can take.
// Bad packs are Field Kit (a light pack: a cream card, a dark bronze accent) with one thing changed, as in validator.test.ts.
import { describe, expect, it } from "vitest";
import { packIssues } from "@/looks/pack-load";
import { type PackSource, validatePack } from "@/looks/pack-validate";
import { slabTones } from "@/looks/treatments";
import { TEST_PACK } from "./__fixtures__/test-pack";
import { readPackDir } from "../../tools/validate-pack.mjs";

// biome-ignore lint/suspicious/noExplicitAny: the fixtures edit parsed JSON of any shape.
type Json = any;
const BASE: PackSource = readPackDir("src/looks/packs/field-kit", /\.tsx?$/);
function pack(change: { pack?: Record<string, unknown>; t3?: Record<string, string | number>; look?: (look: Json) => void }): PackSource {
  const look = structuredClone(BASE.look) as Json;
  Object.assign(look.t3, change.t3);
  change.look?.(look);
  return { ...BASE, pack: { ...(BASE.pack as object), ...change.pack }, look };
}
const errors = (src: PackSource) => validatePack(src, { source: "builtin" }).filter((i) => i.severity === "error");
const rules = (src: PackSource) => errors(src).map((i) => i.rule);
/** Field Kit's dark cream: an ink that reads on its bronze accent and its warn and crit colours. */
const CREAM = "#EFE8D8";

describe("the treatment tokens", () => {
  it("accept their words and ranges", () => {
    const t3 = { "slab-header": "state", "slab-chip": "accent", "slab-tab": "warn", "slab-row": "current", "slab-card": "none", "slab-ink": CREAM, "slab-texture": "scanlines", "slab-notch": 8, "readout-scale": 2.5, "readout-decimals": 0.5, "readout-bar": "rule", "meter-style": "cells", "meter-empty": "#D3C9B3", "meter-peak": "hold", "ring-style": "hex", "graph-grid": "dashed", "graph-lead": "square", "graph-bars": "striped", "row-style": "ruled", "slab-current": "warn", "share-style": "gapped", "avatar-shape": "hex" };
    expect(errors(pack({ t3 }))).toEqual([]);
  });

  it.each([
    ["slab-header", "solid"],
    ["slab-chip", "current"],
    ["slab-texture", "hatch"],
    ["readout-bar", 1],
    ["graph-grid", "dotted"],
    ["row-style", "banded"],
    ["slab-current", "current"],
    ["share-style", "stacked"],
    ["avatar-shape", "circle"],
    ["slab-notch", 13],
    ["readout-scale", 5],
    ["readout-scale", 0.5],
    ["readout-decimals", 0.2],
    ["meter-empty", "teal; x"],
  ])("refuse %s %s", (name, value) => {
    expect(rules(pack({ t3: { [name]: value } }))).toContain("t3");
  });

  it("hold the slab ink to 4.5:1 on each tone a slab can take, with its scan lines", () => {
    // the dark default ink on Field Kit's bronze accent and its warn and crit colours
    expect(errors(pack({ t3: { "slab-chip": "accent" } })).map((i) => i.message).join("\n")).toMatch(/slab-ink #0b0b12 is .*:1 on the accent slab/i);
    expect(rules(pack({ t3: { "slab-chip": "accent", "slab-ink": CREAM } }))).toEqual([]);
    // an info slab is read on `slab-info`: a pale cyan under cream ink is refused
    expect(rules(pack({ t3: { "slab-chip": "info", "slab-ink": CREAM } }))).toContain("contrast");
    expect(rules(pack({ t3: { "slab-chip": "info", "slab-ink": CREAM, "slab-info": "#1F4E79" } }))).toEqual([]);
    // the scan lines are drawn away from the ink (light under a dark ink), so they add to its contrast; a mid-grey ink on a lighter slab gets dark
    // lines that bring the slab toward it, and is read on a line too
    const white = (l: Json) => (l.t1.light.accent.value = "#FFFFFF");
    const slabInk = (src: PackSource) => errors(src).filter((i) => i.message.includes("slab-ink")).map((i) => i.message);
    expect(slabInk(pack({ t3: { "slab-chip": "accent", "slab-ink": "#767676" }, look: white })).filter((m) => m.includes("accent slab"))).toEqual([]);
    expect(slabInk(pack({ t3: { "slab-chip": "accent", "slab-ink": "#767676", "slab-texture": "scanlines" }, look: white })).some((m) => /accent slab #ffffff \(with its scan lines\)/i.test(m))).toBe(true);
    expect(rules(pack({ t3: { "slab-chip": "accent", "slab-ink": CREAM, "slab-texture": "scanlines" } }))).toEqual([]);
  });

  it("read the slab tones a variant recolours too", () => {
    const variant = { id: "pale", name: "Pale", values: { accent: "#F4E9C8" } };
    const src = pack({ t3: { "slab-tab": "accent", "slab-ink": CREAM }, look: (l) => (l.variants = [variant]) });
    expect(errors(src).map((i) => i.message).join("\n")).toMatch(/variant pale t3 slab-ink/);
  });

  it("name the tones a Look's slabs take: warn and crit for any slab, each constant tone, the accent for the current row", () => {
    expect(slabTones({})).toEqual([]);
    expect(slabTones({ "slab-header": "none" })).toEqual([]);
    expect(slabTones({ "slab-header": "state" })).toEqual(["warn", "crit"]);
    expect(slabTones({ "slab-chip": "info", "slab-row": "current" })).toEqual(["accent", "info", "warn", "crit"]);
    expect(slabTones({ "slab-chip": "teal" })).toEqual([]);
  });
});

describe("the frame's new parts", () => {
  const ok = { corners: "cut", size: 20, byCorner: { tr: "cut", bl: "cut" }, band: { edge: "left", width: 28 }, tint: 0.06, tone: "state", grid: { size: 22, alpha: 0.2 }, rule: true, glow: { radius: 10, alpha: 0.35 }, caption: { text: "MB-RX // REV 3", at: "tl" }, tab: { at: "tl", width: 56, height: 5, out: true } };

  it("accept each inside its range", () => {
    expect(errors(pack({ pack: { frame: ok } }))).toEqual([]);
  });

  it.each([
    ["band", { edge: "left", width: 29 }],
    ["band", { edge: "top", width: 8 }],
    ["tint", 0.3],
    ["tint", 0.01],
    ["tone", "always"],
    ["grid", { size: 8 }],
    ["grid", { size: 22, alpha: 0.9 }],
    ["glow", { radius: 17 }],
    ["glow", { radius: 8, alpha: 0.8 }],
    ["caption", { text: "" }],
    ["caption", { text: "X", at: "bottom" }],
    ["tab", { at: "tl", width: 56, height: 5, out: "yes" }],
  ])("refuse %s %j", (key, value) => {
    expect(rules(pack({ pack: { frame: { ...ok, [key]: value } } }))).toContain("schema");
  });

  it("refuse a caption with markup or control characters, or over 64 characters, and a band on the spine's edge", () => {
    for (const text of ["<b>x</b>", "a\u0007b", "x".repeat(65)]) expect(rules(pack({ pack: { frame: { ...ok, caption: { text } } } })), text).toContain("frame");
    expect(rules(pack({ pack: { frame: { ...ok, spine: { edge: "left", width: 4 } } } }))).toContain("frame");
    expect(rules(pack({ pack: { frame: { ...ok, spine: { edge: "right", width: 4 } } } }))).toEqual([]);
  });
});

describe("the stage's grid and chrome", () => {
  const withStage = (rest: object) => ({ stage: { ...(BASE.pack as Json).stage, ...rest } });
  const chrome = { cut: 48, alpha: 0.55, tab: { width: 250, height: 32, text: "CYBERSPEC // DECK" }, reticles: true, minSizeClass: "md" as const };

  it("accept each inside its range, in the validator and the loader", () => {
    expect(errors(pack({ pack: withStage({ grid: { size: 22, alpha: 0.18 }, chrome }) }))).toEqual([]);
    expect(packIssues({ ...TEST_PACK, stage: { layers: [], grid: { size: 22 }, chrome } })).toEqual([]);
  });

  it.each([
    [{ grid: { size: 11 } }, "stage"],
    [{ grid: { size: 22, alpha: 0.6 } }, "stage"],
    [{ grid: { alpha: 0.2 } }, "schema"],
    [{ chrome: { cut: 65 } }, "stage"],
    [{ chrome: { alpha: 0.1 } }, "stage"],
    [{ chrome: { tab: { width: 330, height: 20 } } }, "stage"],
    [{ chrome: { tab: { width: 200, height: 41 } } }, "stage"],
    [{ chrome: { tab: { width: 200, height: 20, text: "<i>x</i>" } } }, "stage"],
    [{ chrome: { tab: { width: 200, height: 20, text: "x".repeat(33) } } }, "stage"],
    [{ chrome: { frame: true } }, "schema"],
  ])("refuse %j", (rest, rule) => {
    expect(rules(pack({ pack: withStage(rest) }))).toContain(rule);
  });

  it("the loader refuses a built pack whose chrome is out of range, whole", () => {
    expect(packIssues({ ...TEST_PACK, stage: { layers: [], chrome: { cut: 99 } } })).toEqual([expect.stringMatching(/^stage chrome cut 99/)]);
  });
});

describe("the treatments fixture", () => {
  it("a user pack wearing every treatment at once validates clean", () => {
    const src: PackSource = readPackDir("tests/fixtures/packs/treatments", /\.tsx?$/);
    expect(validatePack(src, { source: "user" }).filter((i) => i.severity === "error")).toEqual([]);
  });
});
