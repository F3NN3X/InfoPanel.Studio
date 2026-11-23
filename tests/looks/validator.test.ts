// The pack validator (P12a, src/looks/pack-validate.ts): the twelve built-in packs pass with no error, and each rule fails a
// pack built to break it, by its rule id. Bad packs are Field Kit (cream card, fonts, SVG assets, CSS) with one thing changed.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACK_IDS, type Pack } from "@/looks/pack";
import { packIssues } from "@/looks/pack-load";
import { FILE_COUNT_MAX, FILE_MAX_BYTES, PACK_CEILING_BYTES, type PackFile, type PackSource, validatePack } from "@/looks/pack-validate";
import budgets from "../../tools/perf/budgets.json";
import { readPackDir } from "../../tools/validate-pack.mjs";

// biome-ignore lint/suspicious/noExplicitAny: the fixtures edit parsed JSON of any shape.
type Json = any;
const dir = (id: string) => `src/looks/packs/${id}`;
const builtin = (id: string): PackSource => readPackDir(dir(id), /\.tsx?$/);
const BASE = builtin("field-kit");
const enc = (s: string) => new TextEncoder().encode(s);
const file = (path: string, content: string): PackFile => ({ path, size: content.length, bytes: enc(content) });
/** A file of `n` bytes that starts like a PNG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngFile = (path: string, n: number): PackFile => ({ path, size: n, bytes: Uint8Array.from({ length: n }, (_, k) => PNG_SIGNATURE[k] ?? 0) });

/** Field Kit with changes: `pack` and `look` are merged over the JSON, `files` are added or replace by path. */
function bad(change: { pack?: Record<string, unknown>; look?: (look: Json) => void; css?: string; icons?: unknown; files?: PackFile[]; drop?: string[] }): PackSource {
  const look = structuredClone(BASE.look) as Json;
  change.look?.(look);
  const added = new Set((change.files ?? []).map((f) => f.path));
  return {
    pack: { ...(BASE.pack as object), ...change.pack },
    look,
    css: change.css ?? BASE.css,
    icons: change.icons ?? BASE.icons,
    files: [...BASE.files.filter((f) => !added.has(f.path) && !change.drop?.includes(f.path)), ...(change.files ?? [])],
  };
}
/** The error rules of a pack read as one of ours (its CSS is read too); `userRules` reads it as a user pack. */
const rules = (src: PackSource) => validatePack(src, { source: "builtin" }).filter((i) => i.severity === "error").map((i) => i.rule);
const userRules = (src: PackSource) => validatePack(src).filter((i) => i.severity === "error").map((i) => i.rule);
const stage = (layers: unknown[], rest: object = {}) => ({ stage: { ...(BASE.pack as Json).stage, layers, ...rest } });

describe("the built-in packs", () => {
  it.each([...PACK_IDS])("%s passes with no error and no warning", (id) => {
    expect(validatePack(builtin(id), { source: "builtin" })).toEqual([]);
  });

  it("the size cap is the packs block's ceiling in budgets.json", () => {
    expect(PACK_CEILING_BYTES).toBe(budgets.packs.packCeilingBytes);
  });

  // the server refuses at import what the validator refuses (Phase 4): the two sets of caps never drift apart
  it("the size caps are the server's, constant for constant", () => {
    const rust = readFileSync("src-tauri/crates/ips-server/src/packs.rs", "utf8");
    const rs = (name: string) => Number(new RegExp(`pub const ${name}: [a-z0-9]+ = ([0-9_]+);`).exec(rust)?.[1].replaceAll("_", ""));
    expect({ PACK_CEILING_BYTES, FILE_MAX_BYTES, FILE_COUNT_MAX }).toEqual({ PACK_CEILING_BYTES: rs("PACK_CEILING_BYTES"), FILE_MAX_BYTES: rs("FILE_MAX_BYTES"), FILE_COUNT_MAX: rs("FILE_COUNT_MAX") });
  });
});

describe("bad packs, one per rule", () => {
  it("a remote URL in the CSS", () => {
    expect(rules(bad({ css: '[data-part="card"] { background-image: url(https://x.test/a.png); }' }))).toContain("remote-url");
    expect(rules(bad({ css: '[data-part="card"] { background-image: url("//x.test/a.png"); }' }))).toContain("remote-url");
  });

  it("a remote page layer image or font file", () => {
    expect(rules(bad({ pack: stage([{ image: "https://x.test/a.svg" }]) }))).toContain("remote-url");
  });

  it("JavaScript and data: URLs", () => {
    expect(rules(bad({ css: '[data-part="card"] { background-image: url("javascript:alert(1)"); }' }))).toContain("script-url");
    expect(rules(bad({ css: '[data-part="card"] { background-image: url(javascript:alert); }' }))).toContain("script-url");
    expect(rules(bad({ pack: stage([{ image: "javascript:alert(1)" }]) }))).toContain("script-url");
    expect(rules(bad({ css: '[data-part="card"] { background-image: url("data:image/png;base64,AAAA"); }' }))).toContain("data-url");
  });

  it("@import", () => {
    expect(rules(bad({ css: '@import url("a.css"); [data-part="chip"] { color: #EFE8D8; }' }))).toContain("import");
  });

  it("layout CSS: display, size, position", () => {
    for (const decl of ["display: none", "width: 10px", "position: fixed", "margin: 0", "content: 'x'"]) expect(rules(bad({ css: `[data-part="card"] { ${decl}; }` })), decl).toContain("paint-only");
  });

  it("a missing asset, and an asset list that does not match the files", () => {
    expect(rules(bad({ pack: stage([{ image: "nope.svg" }]) }))).toContain("asset-missing");
    expect(rules(bad({ pack: { assets: [{ file: "ghost.svg", bytes: 1 }] } }))).toContain("asset-listed");
    const hazard = BASE.files.find((f) => f.path === "assets/hazard.svg")!;
    expect(rules(bad({ pack: { assets: [{ file: "hazard.svg", bytes: hazard.size + 1 }] } }))).toContain("asset-listed");
  });

  it("an asset list that names every file passes; a file it leaves out is refused", () => {
    const listed = BASE.files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ file: f.path.slice(7), bytes: f.size }));
    expect(rules(bad({ pack: { assets: listed } }))).toEqual([]);
    expect(rules(bad({ pack: { assets: listed.slice(1) } }))).toContain("asset-listed");
  });

  it("a file that is not part of a pack, an unreferenced asset (a warning)", () => {
    expect(rules(bad({ files: [file("run.exe", "MZ")] }))).toContain("asset-extra");
    expect(rules(bad({ files: [file("assets/run.exe", "MZ")] }))).toContain("asset-type");
    const unused = validatePack(bad({ files: [file("assets/spare.png", "x")] }), { source: "builtin" });
    expect(unused.filter((i) => i.severity === "warn").map((i) => i.rule)).toEqual(["asset-unused"]);
  });

  it("an SVG that carries script or a reference outside itself", () => {
    for (const svg of ['<svg onload="alert(1)"/>', "<svg><script>1</script></svg>", '<svg><image href="https://x.test/a.png"/></svg>', '<svg><rect style="fill:url(https://x.test/a)"/></svg>']) {
      expect(rules(bad({ files: [file("assets/hazard.svg", svg)] })), svg).toContain("svg-unsafe");
    }
    expect(rules(bad({ files: [file("assets/hazard.svg", '<svg><linearGradient id="g"/><rect fill="url(#g)"/></svg>')] }))).toEqual([]);
  });

  it("text under 4.5:1 on the card, per material the pack declares", () => {
    expect(rules(bad({ look: (l) => (l.t1.light.muted.value = "#E0D9C8") }))).toContain("contrast");
    // a second material with a darker card the dark ink fails on
    expect(rules(bad({ look: (l) => (l.t2.materials.night = { kind: "solid", tone: "dark", export: "#2A2D33" }) }))).toContain("contrast");
  });

  it("a gradient numeral stop under 3:1, or a colour name no one can check", () => {
    expect(rules(bad({ look: (l) => (l.t3["num-fill"] = "linear-gradient(90deg, #EFE8D0, #EFE8D8)") }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t3["num-fill"] = "linear-gradient(90deg, white, #1A1C21)") }))).toContain("contrast");
  });

  it("a pack may write Classic's focus-outline none, and still not an unreadable ring colour", () => {
    expect(mine((l) => (l.t3["focus-outline"] = "none"))).toEqual([]);
    expect(mine((l) => (l.t3["focus-outline"] = "#EFE8D8"))).toContain("contrast");
  });

  it("a chrome surface that is not an opaque literal (L93)", () => {
    expect(rules(bad({ look: (l) => (l.t1.light.surface.value = "rgba(239, 232, 216, 0.5)") }))).toContain("chrome-surface");
    expect(rules(bad({ look: (l) => (l.t1.light.surface.value = "#EFE8D8CC") }))).toContain("chrome-surface");
  });

  it("an opaque #rgb surface with a translucent text colour is judged on the colour it lays over, not refused (M1)", () => {
    const withShortSurface = (l: Json) => {
      l.t1.light.surface.value = "#FFF";
      l.t1.light.fg.value = "rgba(0, 0, 0, 0.9)";
    };
    expect(rules(bad({ look: withShortSurface }))).not.toContain("contrast");
  });

  it("static-safe on bright static art (L74), and not on dark or non-static-safe packs", () => {
    expect(rules(bad({ pack: { burnIn: "static-safe", ...stage([{ fill: "#101010" }]) } }))).toEqual([]);
    // Field Kit's hazard strip is bright static art: the brightest stop counts, never the mean of the colours
    expect(rules(bad({ pack: { burnIn: "static-safe" } }))).toContain("burn-in");
    expect(rules(bad({ pack: { burnIn: "static-safe", ...stage([{ fill: "#F4F1EC" }]) } }))).toContain("burn-in");
    expect(rules(bad({ pack: { burnIn: "static-safe", ...stage([{ fill: "linear-gradient(#FFFFFF, #EEEEEE)", opacity: 0.9 }]) } }))).toContain("burn-in");
    expect(rules(bad({ pack: { burnIn: "needs-dim", ...stage([{ fill: "#F4F1EC" }]) } }))).toEqual([]);
    expect(rules(bad({ pack: { burnIn: "static-safe", ...stage([{ fill: "#F4F1EC", opacity: 0.2 }]) } }))).toEqual([]);
  });

  it("an ornament over 10 px unless it bleeds on purpose", () => {
    expect(rules(bad({ pack: { ornament: { size: 11 } } }))).toContain("ornament");
    expect(rules(bad({ pack: { ornament: { size: 10 } } }))).toEqual([]);
    expect(rules(bad({ pack: { ornament: { size: 24, bleed: true } } }))).toEqual([]);
  });

  it("a chamfer over 20 px, or one with no cut", () => {
    expect(rules(bad({ pack: { edge: { kind: "chamfer", cut: 21 } } }))).toContain("chamfer");
    expect(rules(bad({ pack: { edge: { kind: "chamfer" } } }))).toContain("chamfer");
    expect(rules(bad({ pack: { edge: { kind: "chamfer", cut: 20 } } }))).toEqual([]);
  });

  it("a frame: each corner style passes; a size, stroke or corner list out of range is refused", () => {
    for (const corners of ["square", "cut", "bracket", "notch"]) expect(rules(bad({ pack: { frame: { corners, size: 12, which: ["tl", "br"], stroke: 1 } } }))).toEqual([]);
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 20, stroke: 2 } } }))).toEqual([]);
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 21 } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: -1 } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8, stroke: 3 } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "round", size: 8 } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8, which: [] } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8, which: ["top"] } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8, which: ["tl", "tl"] } } }))).toContain("frame");
  });

  it("a frame's spine, tab, double line and kind per corner pass; one past the caps or off the vocabulary is refused", () => {
    const ok = { corners: "square", size: 18, byCorner: { tl: "cut", br: "notch" }, spine: { edge: "left", width: 5 }, tab: { at: "tl", width: 56, height: 5 }, double: true, stroke: 1 };
    expect(rules(bad({ pack: { frame: ok } }))).toEqual([]);
    expect(rules(bad({ pack: { frame: { ...ok, spine: { edge: "left", width: 7 } } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { ...ok, spine: { edge: "middle", width: 5 } } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { ...ok, tab: { at: "tl", width: 65, height: 5 } } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { ...ok, tab: { at: "tl", width: 56, height: 9 } } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { ...ok, byCorner: { tl: "round" } } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { ...ok, double: "yes" } } }))).toContain("schema");
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8, colour: "#f00" } } }))).toContain("schema");
  });

  it("a pack that sets both edge and frame is refused; an edge alone still passes, a distressed one with a warning", () => {
    expect(rules(bad({ pack: { frame: { corners: "cut", size: 8 }, edge: { kind: "chamfer", cut: 8 } } }))).toContain("frame");
    expect(rules(bad({ pack: { edge: { kind: "none" } } }))).toEqual([]);
    const warned = validatePack(bad({ pack: { edge: { kind: "distressed" } } }), { source: "builtin" });
    expect(warned.filter((i) => i.severity === "error")).toEqual([]);
    expect(warned.map((i) => i.message).join()).toContain("draws nothing");
  });

  it("ornaments: up to four of the four kinds at the six places pass; five, an unknown kind or place, or both ornament and ornaments are refused", () => {
    const o = (kind: string, at: string, extra: object = {}) => ({ kind, at, ...extra });
    const four = [o("micro-print", "bl", { text: "SYS.07 // NODE-A", minSizeClass: "md" }), o("ticks", "top"), o("reticle", "tr"), o("label", "bottom", { text: "A" })];
    expect(rules(bad({ pack: { ornaments: four } }))).toEqual([]);
    expect(rules(bad({ pack: { ornaments: [...four, o("ticks", "tl")] } }))).toContain("ornament");
    expect(rules(bad({ pack: { ornaments: [o("stripes", "tl")] } }))).toContain("schema");
    expect(rules(bad({ pack: { ornaments: [o("ticks", "centre")] } }))).toContain("schema");
    expect(rules(bad({ pack: { ornaments: [o("ticks", "tl")], ornament: { size: 8 } } }))).toContain("ornament");
  });

  it("ornament text: required for micro-print and label, refused on ticks and reticle, 1 to 64 printable characters, no markup", () => {
    const one = (o: object) => rules(bad({ pack: { ornaments: [o] } }));
    expect(one({ kind: "label", at: "tl", text: "x".repeat(64) })).toEqual([]);
    expect(one({ kind: "label", at: "tl", text: "x".repeat(65) })).toContain("ornament");
    expect(one({ kind: "label", at: "tl", text: "" })).toContain("schema");
    expect(one({ kind: "label", at: "tl" })).toContain("ornament");
    expect(one({ kind: "micro-print", at: "tl" })).toContain("ornament");
    expect(one({ kind: "ticks", at: "top", text: "no" })).toContain("ornament");
    expect(one({ kind: "reticle", at: "tr", text: "no" })).toContain("ornament");
    expect(one({ kind: "label", at: "tl", text: "<b>x</b>" })).toContain("injection");
    expect(one({ kind: "label", at: "tl", text: "a url(x.png) b" })).toContain("injection");
    expect(one({ kind: "label", at: "tl", text: "a > b" })).toContain("ornament");
    expect(one({ kind: "label", at: "tl", text: "line\nbreak" })).toContain("ornament");
    expect(one({ kind: "label", at: "tl", text: "a‮b" })).toContain("ornament");
  });

  it("the flashing kinds: each must declare cost animated, a rate above 0 up to 3, and a rate only on them", () => {
    const fx = (e: object) => validatePack(bad({ pack: stage((BASE.pack as Json).stage.layers, { effects: [e] }) }), { source: "builtin" }).filter((i) => i.severity === "error").map((i) => i.rule);
    for (const kind of ["glitch", "flicker", "rgb-split", "interference"]) {
      expect(fx({ kind, cost: "animated", rate: 3 }), kind).not.toContain("fx-rate");
      expect(fx({ kind, cost: "animated" }), kind).not.toContain("fx-cost");
      expect(fx({ kind, cost: "composited" }), kind).toContain("fx-cost");
    }
    expect(fx({ kind: "glitch", cost: "animated", rate: 3.5 })).toContain("fx-rate");
    expect(fx({ kind: "glitch", cost: "animated", rate: 0 })).toContain("fx-rate");
    expect(fx({ kind: "glitch", cost: "animated", rate: -1 })).toContain("fx-rate");
    expect(fx({ kind: "vignette", cost: "static", rate: 1 })).toContain("fx-rate");
    expect(fx({ kind: "glitch", cost: "animated", calm: "static" })).not.toContain("schema");
    expect(fx({ kind: "glitch", cost: "animated", calm: "dim" })).toContain("schema");
  });

  it("at most two animated effects: two pass, three are refused", () => {
    const fx = (n: number) => validatePack(bad({ pack: stage((BASE.pack as Json).stage.layers, { effects: ["grain", "scanlines", "glitch"].slice(0, n).map((kind) => ({ kind, cost: "animated" })) }) }), { source: "builtin" }).filter((i) => i.severity === "error").map((i) => i.rule);
    expect(fx(2)).not.toContain("fx-animated");
    expect(fx(3)).toContain("fx-animated");
  });

  it("oklch() tokens: read in a Look and checked at 4.5:1 as the clamped hex; refused where the app writes no hex", () => {
    expect(rules(bad({ look: (l) => (l.t1.light.accent.value = "oklch(0.45 0.15 30)") }))).toEqual([]);
    expect(rules(bad({ look: (l) => (l.t1.light.muted.value = "oklch(0.9 0.02 90)") }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t1.light.surface.value = "oklch(0.95 0.02 90)") }))).toContain("chrome-surface");
    expect(rules(bad({ look: (l) => (l.t1.light.ok.value = "oklch(0.5 0.1)") }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t3 = { ...l.t3, "num-color": "oklch(0.4 0.1 30)" }) }))).toContain("t3");
    expect(rules(bad({ css: "[data-part='num'] { color: oklch(0.2 0.1 30); }" }))).toContain("hidden-text");
  });

  it("!important, on a fill or anywhere", () => {
    expect(rules(bad({ css: '[data-part="num"] { color: #1A1C21 !important; }' }))).toContain("no-important");
    expect(rules(bad({ css: '[data-part="card"] { background-color: #EFE8D8 ! important; }' }))).toContain("no-important");
  });

  it("card rotation and any other transform", () => {
    for (const decl of ["transform: rotate(3deg)", "rotate: 2deg", "transform: skewX(4deg)", "scale: 1.1", "translate: 4px"]) expect(rules(bad({ css: `[data-part="card"] { ${decl}; }` })), decl).toContain("no-rotation");
    expect(rules(bad({ css: "@keyframes pack-spin { to { transform: rotate(1turn); } }" }))).toContain("no-rotation");
  });

  it("an icon key outside the fixed list, and path data that is not path data", () => {
    const glyph = { viewBox: "0 0 24 24", d: "M0 0L24 24" };
    expect(rules(bad({ icons: { memory: glyph } }))).toEqual([]);
    expect(rules(bad({ icons: { "not-an-icon": glyph } }))).toContain("icon-key");
    expect(rules(bad({ icons: { memory: { viewBox: "0 0 24 24", d: "<script>" } } }))).toContain("icons");
  });

  it("a pack over the size cap", () => {
    expect(rules(bad({ files: [pngFile("assets/big.png", PACK_CEILING_BYTES / 2), pngFile("assets/big2.png", PACK_CEILING_BYTES / 2)], pack: stage([{ image: "big.png" }]) }))).toContain("size");
  });

  it("the layer budget and effects", () => {
    const layer = { fill: "#101010" };
    expect(rules(bad({ pack: stage([layer, layer, layer, layer]) }))).toContain("layers");
    expect(rules(bad({ pack: stage([layer], { effects: [{ kind: "glow", cost: "static", px: 4 }] }) }))).toContain("effects");
    expect(rules(bad({ pack: stage([layer], { effects: [{ kind: "blur", cost: "filter" }, { kind: "glow", cost: "filter" }, { kind: "vignette", cost: "mask" }, { kind: "grain", cost: "mask" }, { kind: "scanlines", cost: "mask" }] }) }))).toContain("effects");
  });

  it("an overlay stronger than the cap", () => {
    expect(rules(bad({ pack: stage([{ fill: "#101010" }], { effects: [{ kind: "vignette", cost: "static", opacity: 0.9 }] }) }))).toContain("overlay-alpha");
    const blur = (px: number) => validatePack(bad({ pack: stage([{ fill: "#101010" }], { effects: [{ kind: "blur", cost: "filter", px }] }) }), { source: "builtin" }).filter((i) => i.rule === "effects");
    expect(blur(40)).toEqual([expect.objectContaining({ severity: "warn", message: "blur px 40 is drawn at 24, the stage's cap" })]);
    expect(blur(24)).toEqual([]);
    expect(rules(bad({ pack: stage([{ fill: "#101010" }], { effects: [{ kind: "vignette", cost: "static", opacity: 0.4 }] }) }))).toEqual([]);
  });

  it("text that is transparent or the colour of its card (L68, L71)", () => {
    for (const css of ['[data-part="num"] { -webkit-text-fill-color: transparent; }', '[data-part="num"] { color: transparent; }', '[data-part="num"] { color: rgba(0, 0, 0, 0); }', '[data-part="num"] { color: #0000; }', '[data-part="num"] { color: #EFE8D8; }', '[data-part="num"] { color: #efe8d9; }']) {
      expect(rules(bad({ css })), css).toContain("hidden-text");
    }
    expect(rules(bad({ css: '[data-part="num"] { color: #1A1C21; }' }))).toEqual([]);
  });

  it("a gauge painted away: fill and stroke none, or transparent", () => {
    for (const css of ['[data-part="ring"] { stroke: none; }', '[data-part="bar"] { fill: transparent; }', '[data-part="meter"] * { fill: none; }', "svg path { stroke: rgba(0, 0, 0, 0.1); }"]) expect(rules(bad({ css })), css).toContain("hidden-gauge");
  });

  it("opacity: under the floor, compounding down a * selector, or multiplying across rules", () => {
    expect(rules(bad({ css: '[data-part="card"] { opacity: 0.2; }' }))).toContain("hides-content");
    expect(rules(bad({ css: '[data-part="card"] * { opacity: 0.9; }' }))).toEqual(expect.arrayContaining(["universal", "opacity-compound"]));
    expect(rules(bad({ css: '[data-part="card"] { opacity: 0.7; } [data-part="num"] { opacity: 0.7; }' }))).toContain("opacity-compound");
    expect(rules(bad({ css: '[data-part="card"] { filter: opacity(0.1); }' }))).toContain("hides-content");
  });

  it("a * rule that paints more than text", () => {
    for (const decl of ["background-color: #000000", "box-shadow: 0 0 4px #000000", "filter: blur(2px)", "mix-blend-mode: multiply"]) expect(rules(bad({ css: `[data-part="card"] * { ${decl}; }` })), decl).toContain("universal");
    expect(rules(bad({ css: '[data-part="card"] * { font-family: pack-field-kit; color: #1A1C21; }' }))).toEqual([]);
  });

  it("selectors that reach the page, and an at-rule that is not paint", () => {
    expect(rules(bad({ css: "body { color: #1A1C21; }" }))).toContain("selector");
    expect(rules(bad({ css: ":root { color: #1A1C21; }" }))).toContain("selector");
    expect(rules(bad({ css: "@page { margin: 0; }" }))).toContain("paint-only");
  });

  it("fonts: not woff2, wrong signature, no licence file, not OFL, an @font-face outside the pack's names", () => {
    const fonts = (BASE.pack as Json).fonts as Json[];
    expect(rules(bad({ pack: { fonts: [{ ...fonts[0], file: "barlow.ttf" }] } }))).toEqual(expect.arrayContaining(["font-type"]));
    expect(rules(bad({ files: [{ path: "assets/barlow-condensed-600.woff2", size: 4, bytes: enc("OTTO") }] }))).toContain("font-type");
    expect(rules(bad({ drop: ["OFL.txt"] }))).toContain("font-licence");
    expect(rules(bad({ files: [file("OFL.txt", "All rights reserved.")] }))).toContain("font-licence");
    expect(rules(bad({ pack: { fonts: [{ ...fonts[0], licence: "proprietary" }, fonts[1]] } }))).toContain("font-licence");
    expect(rules(bad({ css: "@font-face { font-family: Arial; src: url(barlow-condensed-600.woff2); }" }))).toContain("font-face");
  });

  it("schema, a Look that is not the pack's, modes that differ", () => {
    expect(rules(bad({ pack: { id: "Field Kit" } }))).toContain("schema");
    expect(rules(bad({ pack: { burnIn: "sometimes" } }))).toContain("schema");
    expect(rules(bad({ pack: { surprise: 1 } }))).toContain("schema");
    expect(rules(bad({ look: (l) => (l.id = "other") }))).toContain("id");
    expect(rules(bad({ pack: { modes: ["dark"] } }))).toContain("modes");
    expect(rules({ ...BASE, look: undefined })).toContain("schema");
  });
});

describe("path traversal in an asset path", () => {
  const paths = ["../secret.png", "%2e%2e/secret.png", "%252e%252e/secret.png", "..\\secret.png", "/etc/passwd", "C:/Windows/a.png", "a%00.png", "a%zz.png"];

  it.each(paths)("a page layer image %j is refused as a path", (image) => {
    expect(rules(bad({ pack: stage([{ image }]) }))).toContain("path");
  });

  it.each(paths)("a font file %j is refused as a path", (name) => {
    const fonts = (BASE.pack as Json).fonts as Json[];
    expect(rules(bad({ pack: { fonts: [{ ...fonts[0], file: name }] } }))).toContain("path");
  });

  it.each(["../x.png", "%2e%2e/x.png", "a\\b.png", "C:/x.png"])("a CSS url %j", (url) => {
    expect(rules(bad({ css: `[data-part="card"] { background-image: url("${url}"); }` }))).toContain("path");
  });

  it("a file in the folder whose own path escapes it", () => {
    expect(rules(bad({ files: [file("assets/../../x.png", "x")] }))).toContain("path");
    expect(rules(bad({ files: [file("assets\\x.png", "x")] }))).toContain("path");
  });
});

describe("bypass tries from the P8a and P9a rounds", () => {
  it("escapes that spell url( or @import are refused whatever they spell", () => {
    expect(rules(bad({ css: String.raw`[data-part="card"] { background: u\72l(https://x.test/a.png); }` }))).toContain("css-syntax");
    expect(rules(bad({ css: String.raw`@\69mport "a.css";` }))).toContain("css-syntax");
    expect(rules(bad({ css: String.raw`[data-part="card"] { background: url("htt\70s://x.test/a.png"); }` }))).toContain("remote-url");
  });

  it("case does not hide a scheme or an at-rule", () => {
    expect(rules(bad({ css: '@IMPORT "a.css";' }))).toContain("import");
    expect(rules(bad({ css: '[data-part="card"] { background: URL(HTTPS://X.TEST/a.png); }' }))).toContain("remote-url");
    expect(rules(bad({ css: '[data-part="card"] { background: url("JaVaScRiPt:alert(1)"); }' }))).toContain("script-url");
    expect(rules(bad({ pack: stage([{ image: " HTTP://x.test/a.svg" }]) }))).toContain("remote-url");
  });

  it("a comment hides nothing and is not read as code", () => {
    expect(rules(bad({ css: '/* @import url(https://x.test/a.css) */ [data-part="chip"] { color: #EFE8D8; background-color: #1A1C21; }' }))).toEqual([]);
    expect(rules(bad({ css: '[data-part="card"] { background: url(/**/https://x.test/a.png); }' }))).toContain("path");
    expect(rules(bad({ css: '[data-part="card"] { background: url(https://x.test/a.png /* ) */ ); }' }))).toContain("css-syntax");
  });

  it("image-set(), src() and a var() inside a URL function are read as URLs", () => {
    expect(rules(bad({ css: '[data-part="card"] { background-image: image-set("https://x.test/a.png" 1x); }' }))).toContain("remote-url");
    expect(rules(bad({ css: '[data-part="card"] { background-image: url(var(--x)); }' }))).toContain("css-syntax");
  });

  it("@font-face with a remote src or a unicode-range does not get past the URL and name rules", () => {
    const face = (src: string, family = "pack-field-kit") => `@font-face { font-family: ${family}; src: ${src}; unicode-range: U+0000-10FFFF; }`;
    expect(rules(bad({ css: face("url(https://x.test/f.woff2)") }))).toContain("remote-url");
    expect(rules(bad({ css: face("url(//x.test/f.woff2)", "Arial") }))).toEqual(expect.arrayContaining(["remote-url", "font-face"]));
    expect(rules(bad({ css: face("url(barlow-condensed-600.woff2)") }))).toEqual([]);
  });

  it("unicode-range and property tricks do not turn a layout property into paint", () => {
    expect(rules(bad({ css: '[data-part="card"] { DISPLAY: none; }' }))).toContain("paint-only");
    expect(rules(bad({ css: '[data-part="card"] { --pack-x: 1; width: 1px; }' }))).toContain("paint-only");
    expect(rules(bad({ css: String.raw`[data-part="card"] { dis\70lay: none; }` }))).toContain("css-syntax");
  });
});

// ---- review and fix round 1 (P12a): the probe inputs of the review, one case per finding ----------------------------------

/** The pack as a user would hand it over: its own id and font families (a built-in's are refused), no pack.css, every asset listed. */
function userPack(change: Parameters<typeof bad>[0] = {}): PackSource {
  const fonts = (BASE.pack as Json).fonts.map((f: Json) => ({ ...f, family: f.family.replace("pack-", "pack-mine-") }));
  const src = bad({ ...change, pack: { id: "mine", fonts, ...change.pack }, look: (l) => { l.id = "mine"; for (const k of Object.keys(l.fonts)) l.fonts[k] = l.fonts[k].replace("pack-", "pack-mine-"); change.look?.(l); } });
  const files = src.files.filter((f) => f.path !== "pack.css");
  const assets = files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ file: f.path.slice(7), bytes: f.size }));
  return { ...src, css: undefined, files, pack: { ...(src.pack as object), assets } };
}
const WHITE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#FFFFFF"/></svg>';
/** JSON text with one extra first key, parsed back (so the key is an own property, as a hostile file gives it). */
const withKey = (o: unknown, key: string) => JSON.parse(JSON.stringify(o).replace(/^\{/, `{${JSON.stringify(key)}:{"x":1},`));

describe("a user pack carries no pack.css (the controller decision)", () => {
  it("pack.css is refused as user-css, as text or as a file; the built-in reading keeps it", () => {
    expect(userRules(bad({}))).toContain("user-css");
    expect(userRules({ ...userPack(), css: "" })).toContain("user-css");
    expect(userRules({ ...userPack(), files: [...userPack().files, file("pack.css", "")] })).toContain("user-css");
    expect(rules(bad({}))).toEqual([]);
  });

  it("Field Kit's own files (SVGs, fonts, licence, icons) pass as a user pack once the CSS is left out", () => {
    expect(validatePack(userPack())).toEqual([]);
  });
});

describe("a user pack's CSS names its own files, exactly as the route serves them (decision Q3)", () => {
  const masked = (url: string) => ({ ...userPack(), css: `[data-part="card"]::after { content: ""; mask-image: url(${url}); }` });
  it("a file of the pack passes, and counts as used", () => {
    expect(validatePack(masked("assets/hazard.svg")).filter((i) => i.file === "assets/hazard.svg")).toEqual([]);
    expect(userRules(masked("assets/hazard.svg"))).toEqual([]);
  });
  it("a path the route would not find is refused: no assets/ step, or no such file", () => {
    expect(userRules(masked("hazard.svg"))).toContain("asset-missing");
    expect(userRules(masked("assets/gone.svg"))).toContain("asset-missing");
  });
});

describe("H1: hidden text, whatever the spelling", () => {
  const num = (decl: string) => `[data-part="num"] { ${decl}; }`;
  it.each(["color: white", "-webkit-text-fill-color: white", "color: hsl(0 0% 100%)", "color: var(--w-surface)", "color: transparent"])("%s", (decl) => {
    expect(rules(bad({ css: num(decl) }))).toContain("hidden-text");
  });

  it("an animation that ends on transparent or unreadable text, fill or paint", () => {
    expect(rules(bad({ css: `@keyframes pack-h { to { color: transparent; } } ${num("animation: pack-h 2s forwards")}` }))).toContain("hidden-text");
    expect(rules(bad({ css: `@keyframes pack-h { to { fill: none; } } ${num("animation: pack-h 2s forwards")}` }))).toContain("hidden-gauge");
    expect(rules(bad({ css: `@keyframes pack-h { to { background: #1A1C21; } } ${num("animation: pack-h 2s forwards")}` }))).toContain("hidden-text");
  });

  it("a readable colour in any spelling still passes", () => {
    expect(rules(bad({ css: num("color: hsl(220 15% 12%)") }))).toEqual([]);
  });
});

describe("H2: a selector that matches everything", () => {
  it.each(["div", "span, p, svg, [class]", ":not(.zzz)", ":scope", "[data-part]"])("%s may not repaint", (selector) => {
    expect(rules(bad({ css: `${selector} { background: #1A1C21; }` }))).toContain("universal");
    expect(rules(bad({ css: `${selector} { background: #FFFFFF; }` }))).toContain("universal");
  });

  it("a named part painted the colour of the text is hidden text; one that keeps its own text colour is not", () => {
    expect(rules(bad({ css: '[data-part="card"] { background: #1A1C21; }' }))).toContain("hidden-text");
    expect(rules(bad({ css: '[data-part="chip"] { background: #1A1C21; color: #EFE8D8; }' }))).toEqual([]);
  });
});

describe("H3: gauges and text painted away on any selector", () => {
  it.each([".gauge { fill: none }", ".x { stroke: none }", ".x { fill: transparent }", "text { fill: rgba(0, 0, 0, 0.01) }", ".ring { fill: #EFE8D8 }"])("%s", (css) => {
    expect(rules(bad({ css }))).toContain("hidden-gauge");
  });

  it("a hairline stroke", () => {
    expect(rules(bad({ css: ".x { stroke-width: 0.0001 }" }))).toContain("hides-content");
    expect(rules(bad({ css: ".x { stroke-width: 0.5 }" }))).toEqual([]);
  });
});

describe("H4: sizes come from the bytes", () => {
  const big = Uint8Array.from({ length: 900_000 }, (_, k) => PNG_SIGNATURE[k] ?? 0);
  it("a claimed size under the bytes, a negative size, NaN", () => {
    expect(userRules(userPack({ files: [{ path: "assets/big.png", size: 1, bytes: big }] }))).toEqual(expect.arrayContaining(["size"]));
    expect(userRules(userPack({ files: [{ path: "assets/n.png", size: -999_999_999, bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }] }))).toContain("size");
    expect(userRules(userPack({ files: [{ path: "assets/n.png", size: Number.NaN, bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }] }))).toContain("size");
  });

  it("a file with no bytes is an error, not a skipped check", () => {
    const woff = BASE.files.find((f) => f.path.endsWith(".woff2"))!;
    expect(userRules(userPack({ files: [{ path: woff.path, size: woff.size }] }))).toContain("content-unread");
    expect(userRules(userPack({ files: [{ path: "OFL.txt", size: 10 }] }))).toContain("content-unread");
  });

  it("a file over the per-file cap, too many files, and the exact total cap", () => {
    expect(rules(bad({ files: [pngFile("assets/a.png", FILE_MAX_BYTES + 1)] }))).toContain("size");
    expect(rules(bad({ files: Array.from({ length: FILE_COUNT_MAX + 1 }, (_, k) => file(`extra${k}.md`, "")) }))).toContain("size");
    const used = BASE.files.reduce((n, f) => n + f.size, 0);
    // n bytes over as few files as the per-file cap allows, so only the total can be what trips
    const fits = (n: number) => {
      const k = Math.ceil(n / FILE_MAX_BYTES);
      return rules(bad({ files: Array.from({ length: k }, (_, i) => pngFile(`assets/fill${i}.png`, Math.floor(n / k) + (i < n % k ? 1 : 0))) })).includes("size");
    };
    expect(fits(PACK_CEILING_BYTES - used)).toBe(false);
    expect(fits(PACK_CEILING_BYTES - used + 1)).toBe(true);
  });
});

describe("M1: SVG allow-list", () => {
  const svg = (markup: string) => userRules(userPack({ files: [file("assets/hazard.svg", markup)] }));
  it.each([
    "<svg/onload=alert(1)>",
    "<svg><rect/onclick=1 /></svg>",
    '<svg xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>',
    "<svg><image href=https://e.test/x.png /></svg>",
    '<svg><rect style="fill:\\75 rl(https://e.test/x)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://e.test/x">]><svg><rect/></svg>',
    '<svg><set attributeName="href" to="https://e.test"/></svg>',
    '<svg><meta http-equiv="refresh" content="0;url=https://e.test"/></svg>',
    "<svg><SCRIPT>alert(1)</SCRIPT></svg>",
    '<svg><a href="javascript:alert(1)"/></svg>',
    '<svg><rect fill="&#117;rl(https://e.test)"/></svg>',
    '<svg xmlns="http://www.w3.org/1999/xhtml"/>',
  ])("%s", (markup) => {
    expect(svg(markup)).toContain("svg-unsafe");
  });

  it("an uppercase extension is scanned too, and a raster that is really an SVG is refused", () => {
    const bad1 = userPack({ files: [file("assets/x.SVG", "<svg><script>1</script></svg>")] });
    expect(userRules(bad1)).toContain("svg-unsafe");
    expect(userRules(userPack({ files: [file("assets/hex.png", WHITE_SVG)] }))).toContain("image-type");
  });

  it("an SVG of allowed elements, with ids inside the file, passes", () => {
    expect(svg(WHITE_SVG)).toEqual([]);
    expect(svg('<svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient><rect fill="url(#g)"/></svg>')).toEqual([]);
  });
});

describe("M2: the licence file", () => {
  it("only the named licence files count, and the text must be the OFL with a copyright line", () => {
    for (const name of ["OFL.html", "LICENSE.exe", "Licence.js"]) expect(userRules(userPack({ files: [file(name, "SIL OPEN FONT LICENSE Version 1.1 Copyright")] })), name).toContain("asset-extra");
    expect(userRules(userPack({ files: [file("OFL.txt", "MIT. not the SIL OPEN FONT LICENSE")] }))).toContain("font-licence");
    expect(userRules(userPack({ files: [file("OFL.txt", "SIL OPEN FONT LICENSE Version 1.1, without a holder")] }))).toContain("font-licence");
  });
});

describe("M3: burn-in reads colours it can read, and stacks", () => {
  const safe = (layers: unknown[], files: PackFile[] = []) => userRules(userPack({ pack: { burnIn: "static-safe", ...stage(layers) }, files }));
  it.each(["white", "hsl(0 0% 100%)", "linear-gradient(#fff, #000, #000, #000)"])("a bright or unreadable fill %s is not static-safe", (fill) => {
    expect(safe([{ fill }])).toContain("burn-in");
  });

  it("three layers under the per-layer limit add up", () => {
    expect(safe([{ fill: "#FFFFFF", opacity: 0.35 }, { fill: "#FFFFFF", opacity: 0.35 }, { fill: "#FFFFFF", opacity: 0.35 }])).toContain("burn-in");
    expect(safe([{ fill: "#FFFFFF", opacity: 0.35 }])).toEqual([]);
  });

  it("a white SVG layer by any spelling of its path, an SVG with a colour name, a raster", () => {
    for (const image of ["hex.svg", "./hex.svg", "assets/hex.svg", "hex.svg?x"]) expect(safe([{ image }], [file("assets/hex.svg", WHITE_SVG)]), image).toContain("burn-in");
    expect(safe([{ image: "hex.svg" }], [file("assets/hex.svg", WHITE_SVG.replace("#FFFFFF", "white"))])).toContain("burn-in");
    expect(safe([{ image: "hex.png" }], [pngFile("assets/hex.png", 8)])).toContain("burn-in");
    expect(safe([{ image: "hex.svg" }], [file("assets/hex.svg", WHITE_SVG.replace("#FFFFFF", "#101010"))])).toEqual([]);
  });

  it("Paper cannot claim static-safe", () => {
    const paper = builtin("paper");
    expect(validatePack({ ...paper, pack: { ...(paper.pack as object), burnIn: "static-safe" } }, { source: "builtin" }).map((i) => i.rule)).toContain("burn-in");
  });
});

describe("M4: keys that name the prototype chain, and JSON that is too deep or too long", () => {
  it.each(["__proto__", "constructor", "prototype"])("%s in pack.json, look.json and look.json's t1", (key) => {
    expect(rules({ ...BASE, pack: withKey(BASE.pack, key) })).toContain("json-shape");
    expect(rules({ ...BASE, look: withKey(BASE.look, key) })).toContain("json-shape");
    const look = structuredClone(BASE.look) as Json;
    look.t1.light = withKey(look.t1.light, key);
    expect(rules({ ...BASE, look })).toContain("json-shape");
  });

  it("an inherited name is not a property the schema allows", () => {
    expect(rules(bad({ pack: { toString: 5 } }))).toContain("schema");
  });

  it("depth, and a long string", () => {
    let deep: unknown = 1;
    for (let k = 0; k < 40; k++) deep = { a: deep };
    expect(rules(bad({ look: (l) => (l.ext = deep) }))).toContain("json-shape");
    expect(rules(bad({ look: (l) => (l.ext = { a: "x".repeat(9000) }) }))).toContain("json-shape");
  });
});

describe("M5: every string of a Look is read", () => {
  it.each([
    ["t1 info", (l: Json) => (l.t1.light.info.value = "url(https://evil.test/p.png)")],
    ["t1 border", (l: Json) => (l.t1.light.border.value = "red; } html { display: none")],
    ["radius", (l: Json) => (l.radius = "red; } html { display: none")],
    ["a material border", (l: Json) => (l.t2.materials["look-field-kit"].border = "1px solid url(https://evil.test/p.png)")],
    ["a tone", (l: Json) => (l.t2.tones = { evil: { x: "expression(alert(1))" } })],
    ["ext", (l: Json) => (l.ext = { x: "javascript:alert(1)" })],
    ["t0", (l: Json) => (l.t0 = { x: "red; }" })],
    ["a nested key named name, in a material", (l: Json) => (l.t2.materials["look-field-kit"].name = "url(https://x)")],
    ["a nested key named source, in a tone", (l: Json) => (l.t2.tones = { evil: { source: "javascript:alert(1)" } })],
    ["a nested usage, in ext", (l: Json) => (l.ext = { usage: "@import x", description: "url(https://x)" })],
  ])("%s", (_, change) => {
    expect(rules(bad({ look: change }))).toEqual(expect.arrayContaining([expect.stringMatching(/^(injection|colour)$/)]));
  });

  it("material, tone and token keys are plain names", () => {
    expect(rules(bad({ look: (l) => (l.t2.materials["Bad Name; x"] = { kind: "solid", export: "#EFE8D8" }) }))).toContain("schema");
    expect(rules(bad({ look: (l) => (l.t2.tones = { "x y": { "a;b": "#fff" } }) }))).toContain("schema");
  });

  it("a colour name or var() as a T1 value, and a radius over 64 px", () => {
    expect(rules(bad({ look: (l) => (l.t1.light.accent.value = "red") }))).toEqual(expect.arrayContaining(["contrast"]));
    expect(rules(bad({ look: (l) => (l.t1.light["focus-ring"].value = "var(--x)") }))).toContain("colour");
    expect(rules(bad({ look: (l) => (l.radius = "9rem") }))).toContain("colour");
  });

  it("a Look with variants validates, and a variant that is malformed or has a bad value is refused", () => {
    const night = { id: "night", name: "Night", values: { accent: "#8899ff", surface: "matte-dark", surfaceOpacity: "80", blur: "12", radius: "8", padding: "4", gap: "4" } };
    expect(rules(bad({ look: (l) => (l.variants = [night, { id: "dusk", name: "Dusk", values: { accent: "#ff9966" } }]) }))).toEqual([]);
    expect(rules(bad({ look: (l) => (l.variants = [{ ...night, values: { accent: "red" } }]) }))).toContain("variant");
    expect(rules(bad({ look: (l) => (l.variants = [{ ...night, values: { radius: "999" } }]) }))).toContain("variant");
    expect(rules(bad({ look: (l) => (l.variants = [{ ...night, values: { colour: "#fff" } }]) }))).toContain("variant");
    expect(rules(bad({ look: (l) => (l.variants = [{ id: "night", values: {} }]) }))).toContain("schema");
  });

  it("a variant may set the text, secondary text, status and line colours, and derive them from its accent", () => {
    const set = (values: Json) => bad({ look: (l) => (l.variants = [{ id: "ice", name: "Ice", values }]) });
    // Field Kit's card is cream, so the colours that read on it are dark
    expect(rules(set({ accent: "#8a3b12", textColor: "#1a1a1a", mutedColor: "#4a4a4a", ok: "#1a6b3a", borderColor: "#8a3b12", glowColor: "#8a3b12" }))).toEqual([]);
    expect(rules(set({ accent: "#8a3b12", textColor: { from: "accent", l: 0.25, c: 0.03 }, mutedColor: { from: "accent", l: 0.4, cMul: 0.5 }, borderColor: { from: "accent", alpha: 0.5 } }))).toEqual([]);
    // an alpha on a text role, a derive of the accent, a bad field or range, a colour that is not one
    expect(rules(set({ textColor: "#ffffff80" }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent", l: 0.9, alpha: 0.5 } }))).toContain("variant");
    expect(rules(set({ accent: { from: "accent", l: 0.9 } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "fg", l: 0.9 } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent" } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent", l: 1.2 } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent", l: 0.9, lMin: 0.5 } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent", c: 0.1, cMul: 1 } }))).toContain("variant");
    expect(rules(set({ textColor: { from: "accent", hue: 20 } }))).toContain("variant");
    expect(rules(set({ textColor: "red" }))).toContain("variant");
    expect(rules(set({ radius: { from: "accent", l: 0.9 } }))).toContain("variant");
  });

  it("the contrast checks run per variant: a variant whose own text colour fails on the card is refused", () => {
    const set = (values: Json) => bad({ look: (l) => (l.variants = [{ id: "dim", name: "Dim", values }]) });
    expect(rules(set({ textColor: "#e0e0e0" }))).toContain("contrast");
    expect(rules(set({ mutedColor: "#d8d8d8" }))).toContain("contrast");
    // derived: the accent at a lightness too close to the card's reads too low; the accent itself is read too
    expect(rules(set({ accent: "#8a3b12", textColor: { from: "accent", l: 0.9 } }))).toContain("contrast");
    expect(rules(set({ accent: "#f0f0f0", textColor: "#1a1a1a" }))).toContain("contrast");
    // an accent swap alone is what variants always were: not held to a ratio it was never checked for
    expect(rules(set({ accent: "#f0f0f0" }))).toEqual([]);
  });

  it("a derive from an accent that cannot be read is refused", () => {
    const set = (values: Json) => bad({ look: (l) => (l.variants = [{ id: "x", name: "X", values }]) });
    expect(rules(set({ accent: "{nope}", textColor: { from: "accent", l: 0.25 } }))).toContain("variant");
  });
});

describe("M6: a material colour the check cannot read, and the token path (T3)", () => {
  it("a dark card read through hsl(), a var(), a see-through glass", () => {
    expect(rules(bad({ look: (l) => (l.t2.materials.night = { kind: "solid", fill: "hsl(250 40% 15%)" }) }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t2.materials.night = { kind: "solid", fill: "var(--w-fg)" }) }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t2.materials.night = { kind: "glass", fill: "rgba(255, 255, 255, 0.1)" }) }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t2.materials.night = { kind: "gradient", fill: "#EFE8D8", "fill-2": "#101010" }) }))).toContain("contrast");
  });

  it("a T3 colour that is not a colour, a name that does not exist, a value that is not plain", () => {
    expect(rules(bad({ look: (l) => (l.t3["series-1"] = "red") }))).toContain("t3");
    expect(rules(bad({ look: (l) => (l.t3["series-1"] = "#EFE8D8") }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t3["status-ok"] = "#EFE8D8") }))).toContain("contrast");
    expect(rules(bad({ look: (l) => (l.t3.evil = "x") }))).toContain("t3");
    expect(rules(bad({ look: (l) => (l.t3["graph-style"] = "area; x") }))).toEqual(expect.arrayContaining(["injection"]));
    expect(rules(bad({ look: (l) => (l.t3["border-fill"] = "url(https://e.test/x)") }))).toContain("injection");
  });

  it("glow, blur, line widths and motion are clamped", () => {
    expect(rules(bad({ look: (l) => (l.t2.materials["look-field-kit"].blur = "9999px") }))).toContain("blur");
    expect(rules(bad({ look: (l) => (l.t3["ring-width"] = 9999) }))).toContain("t3");
    expect(rules(bad({ look: (l) => (l.t3["motion-fast"] = "99999ms") }))).toContain("t3");
    expect(rules(bad({ look: (l) => (l.t3["ring-width"] = 12) }))).toEqual([]);
  });
});

describe("M7: the validator refuses what the loader refuses", () => {
  /** Field Kit's pack.json and Look as the loader's own `Pack` (the loader reads built packs, so the code-only fields are left out). */
  const asPack = (src: PackSource) => ({ ...(src.pack as object), assets: undefined, look: src.look, css: src.css }) as unknown as Pack;
  const cases: [string, PackSource][] = [
    ["an empty layer image", bad({ pack: stage([{ image: "" }]) })],
    ["a parent path", bad({ pack: stage([{ image: "../x.png" }]) })],
    ["a remote layer image", bad({ pack: stage([{ image: "https://x.test/a.png" }]) })],
    ["four layers", bad({ pack: stage([{ fill: "#101010" }, { fill: "#101010" }, { fill: "#101010" }, { fill: "#101010" }]) })],
    ["a layer opacity over 1", bad({ pack: stage([{ fill: "#101010", opacity: 2 }]) })],
    ["a bad fill", bad({ pack: stage([{ fill: "url(https://x.test/a.png)" }]) })],
    ["a glow below its cost class", bad({ pack: stage([{ fill: "#101010" }], { effects: [{ kind: "glow", cost: "static", px: 4 }] }) })],
    ["a remote CSS url", bad({ css: '[data-part="card"] { background-image: url(https://x.test/a.png); }' })],
    ["@import", bad({ css: '@import url("a.css");' })],
    ["display: none", bad({ css: '[data-part="card"] { display: none; }' })],
    ["a transparent numeral fill", bad({ look: (l) => (l.t3["num-fill"] = "linear-gradient(90deg, #EFE8D0, #EFE8D8)") })],
  ];
  it("the base pack passes both", () => {
    expect(packIssues(asPack(bad({})))).toEqual([]);
    expect(rules(bad({}))).toEqual([]);
  });

  it.each(cases)("%s", (_, src) => {
    expect(packIssues(asPack(src)).length).toBeGreaterThan(0);
    expect(rules(src).length).toBeGreaterThan(0);
  });
});

describe("M8: caps on paint", () => {
  it.each([
    ["box-shadow: 0 0 0 4000px #000000", "paint-cap"],
    ["box-shadow: inset 0 0 0 4000px #FFFFFF", "paint-cap"],
    ["filter: drop-shadow(0 0 9999px #000000)", "hides-content"],
    ["background-size: 99999px", "paint-cap"],
    ["mix-blend-mode: difference", "paint-cap"],
    ["animation: pack-a 0.001s infinite", "paint-cap"],
  ])("%s", (decl, rule) => {
    expect(rules(bad({ css: `@keyframes pack-a { to { color: #111111; } } [data-part="num"] { ${decl}; }` }))).toContain(rule);
  });

  it("backdrop blur on every div, and a budget on filters", () => {
    expect(rules(bad({ css: "div { backdrop-filter: blur(30px); }" }))).toContain("universal");
    const five = Array.from({ length: 5 }, (_, k) => `[data-part="p${k}"] { backdrop-filter: blur(4px); }`).join(" ");
    expect(rules(bad({ css: five }))).toContain("paint-cap");
  });

  it("a shadow and a slow loop within the caps pass", () => {
    expect(rules(bad({ css: '[data-part="num"] { box-shadow: 0 0 12px 2px rgba(0, 0, 0, 0.3); text-shadow: 0 0 6px rgba(139, 227, 122, 0.35); }' }))).toEqual([]);
  });
});

describe("M9: deep nesting is an issue, never a crash", () => {
  it("20,000 open at-rules and 5,000 closed ones", () => {
    const open = "@media screen{".repeat(20_000);
    const closed = `${"@supports (a:b){".repeat(5000)}${"}".repeat(5000)}`;
    for (const css of [open, closed]) {
      expect(() => validatePack(bad({ css }), { source: "builtin" })).not.toThrow();
      expect(rules(bad({ css }))).toContain("css-syntax");
    }
  });
});

describe("the LOWs the round fixed", () => {
  it("L-a: an edge cut over the cap on any kind", () => {
    expect(rules(bad({ pack: { edge: { kind: "distressed", cut: 99 } } }))).toContain("chamfer");
  });

  it("L-b: a user pack with assets must list them", () => {
    const { assets: _listed, ...unlisted } = userPack().pack as Json;
    expect(userRules({ ...userPack(), pack: unlisted })).toContain("asset-listed");
  });

  it("L-c: duplicate and case-colliding paths, long paths, device names, hidden files, folders in assets/", () => {
    const hex = file("assets/hex.svg", WHITE_SVG);
    expect(userRules(userPack({ files: [hex, file("assets/HEX.svg", WHITE_SVG)] }))).toContain("path");
    for (const path of [`assets/${"a".repeat(200)}.png`, "assets/CON.png", "assets/.hidden.png", "assets/sub/dir/x.png"]) expect(userRules(userPack({ files: [pngFile(path, 8)] })), path).toContain("path");
  });
});

// ---- review and fix round 2 (P12a): the probe inputs of the review, one case per finding ---------------------------------------
// The principle: in user mode the contrast and visibility checks run on the resolved paint the kiosk draws, and fail closed.

/** A user pack (Field Kit's files, its own id) with its Look and pack.json changed. */
const mine = (look: (l: Json) => void = () => {}, pack: Record<string, unknown> = {}, rest: { icons?: unknown; files?: PackFile[] } = {}) => userRules(userPack({ look, pack, ...rest }));
const CARD = "#EFE8D8";
/** Field Kit's page is dark; a card that lets the page through is only checked against a light one, so these Looks lay the page cream. */
const creamPage = (l: Json) => (l.t1.light.bg.value = CARD);
const translucent = (alpha: number) => (l: Json) => {
  creamPage(l);
  l.t2.materials["look-field-kit"] = { kind: "solid", tone: "light", export: CARD, fill: CARD, "fill-alpha": alpha };
};

describe("N-H1: an alias is read down to the colour it ends at", () => {
  it("a text token aliased to a T3 colour that hides it", () => {
    expect(mine((l) => { l.t3["accent-ink"] = CARD; l.t3["label-color"] = "{accent-ink}"; })).toContain("contrast");
    expect(mine((l) => { l.t3.idle = CARD; l.t3["status-ok"] = "{idle}"; })).toContain("contrast");
    expect(mine((l) => { l.t3.idle = "{mute}"; l.t3.mute = CARD; l.t3["series-1"] = "{idle}"; })).toContain("contrast");
  });

  it("a loop, an unset token, a shell name, a token set to nothing are errors", () => {
    for (const set of [
      (l: Json) => { l.t3["series-1"] = "{series-2}"; l.t3["series-2"] = "{series-1}"; },
      (l: Json) => (l.t3["status-ok"] = "{nope}"),
      (l: Json) => (l.t3["status-ok"] = "{faint}"),
      (l: Json) => (l.t3["status-ok"] = "{mat.fill}"),
      (l: Json) => (l.t3["status-ok"] = "{track}"),
      (l: Json) => { l.t3["series-3"] = ""; l.t3["status-ok"] = "{series-3}"; },
    ]) expect(mine(set), set.toString()).toContain("contrast");
  });

  it("an alias that ends in a readable colour passes", () => {
    expect(mine((l) => { l.t3.idle = "#146C34"; l.t3["status-ok"] = "{idle}"; l.t3["series-1"] = "{status-ok}"; l.t3["label-color"] = "{accent}"; })).toEqual([]);
  });
});

describe("N-H2: the header's fill is the title's colour, the border's fill is the card's edge", () => {
  it.each(["transparent", "#00000000", "#EFE8D800", "rgba(0, 0, 0, 0)", "linear-gradient(transparent, transparent)", "currentColor", "black", "#EFE8D8", "linear-gradient(90deg, #1A1C21, #EFE8D8)", "var(--w-surface)"])("header-fill %s", (fill) => {
    expect(mine((l) => (l.t3["header-fill"] = fill))).toContain("contrast");
  });

  it("a readable header fill passes, over the card by its alpha", () => {
    expect(mine((l) => (l.t3["header-fill"] = "#1A1C21"))).toEqual([]);
    expect(mine((l) => (l.t3["header-fill"] = "linear-gradient(90deg, #1A1C21, var(--w-fg))"))).toEqual([]);
    expect(mine((l) => (l.t3["header-fill"] = "rgba(26, 28, 33, 0.3)"))).toContain("contrast");
  });

  it("a border-fill the colour of a card is a note, not a refusal: it is decoration", () => {
    const notes = (fill: string) => validatePack(bad({ look: (l) => (l.t3["border-fill"] = fill) })).filter((i) => i.rule === "t3" && i.severity === "warn");
    expect(notes("#EFE8D8").map((i) => i.message).join()).toContain("the border is not seen");
    expect(notes("linear-gradient(90deg, #EFE8D8, #000000)")).toEqual([]);
    expect(mine((l) => (l.t3["border-fill"] = "#EFE8D8"))).toEqual([]);
  });

  it.each(["transparent", "#00000000", "linear-gradient(transparent, transparent)", "rgba(0, 0, 0, 0)", "currentColor"])("border-fill %s", (fill) => {
    expect(mine((l) => (l.t3["border-fill"] = fill))).toContain("t3");
  });

  it("a gradient border passes", () => {
    expect(mine((l) => (l.t3["border-fill"] = "linear-gradient(135deg, #8A6D1D, #F5D77A)"))).toEqual([]);
  });
});

describe("N-H3: the card is read over the stage layers and the page", () => {
  it("a translucent card over a dark layer hides dark text; without the layer it passes", () => {
    const dark = stage([{ fill: "#000000" }]);
    expect(mine(translucent(0.01), dark)).toContain("contrast");
    expect(mine(translucent(0.5), dark)).toContain("contrast");
    expect(mine(translucent(0.01), stage([{ fill: "#FFFFFF" }]))).toEqual([]);
    expect(mine(translucent(0.01), stage([]))).toEqual([]);
  });

  it("the darkest stop of a gradient and the darkest paint of an SVG count", () => {
    expect(mine(translucent(0.2), stage([{ fill: "linear-gradient(#FFFFFF, #000000)" }]))).toContain("contrast");
    expect(mine(translucent(0.2), stage([{ image: "hex.svg" }]), { files: [file("assets/hex.svg", WHITE_SVG)] })).toContain("contrast");
  });

  it("a layer with a see-through stop lets what is under it count", () => {
    expect(mine(translucent(0.2), stage([{ fill: "linear-gradient(transparent, #000000)" }]))).toContain("contrast");
  });

  it("a raster under a card under 0.85 opaque is refused, a nearly opaque card passes", () => {
    const raster = [pngFile("assets/r.png", 8)];
    expect(mine(translucent(0.5), stage([{ image: "r.png" }]), { files: raster })).toContain("contrast");
    expect(mine(translucent(0.99), stage([{ image: "r.png" }]), { files: raster })).toEqual([]);
  });
});

describe("N-M1: motion times are one number with ms or s, 50 to 2000 ms", () => {
  it.each(["1e9ms", "1e3s", "9e9s", "+9999s", "-5s", "0.0001s", "0.001s", "1ms", "0ms", "0s", "300ms 1e9ms", "2001ms", "2.1s", "calc(1s)", "infinite"])("motion-base %s", (v) => {
    expect(mine((l) => (l.t3["motion-base"] = v))).toContain("t3");
  });

  it("a number alone, and the other two names", () => {
    expect(mine((l) => (l.t3["motion-base"] = 300))).toContain("t3");
    expect(mine((l) => (l.t3["motion-data"] = "1e9ms"))).toContain("t3");
    expect(mine((l) => (l.t3["motion-fast"] = "-1s"))).toContain("t3");
  });

  it("the bounds themselves pass", () => {
    for (const v of ["50ms", "2000ms", "2s", "0.3s", "150ms"]) expect(mine((l) => (l.t3["motion-base"] = v)), v).toEqual([]);
  });
});

describe("N-M2: a font's family, weight and style are plain", () => {
  const font = (change: Json) => ({ fonts: [{ ...(BASE.pack as Json).fonts[0], family: "pack-mine", ...change }] });
  it.each([
    [{ family: "pack-x;}body{display:none" }],
    [{ family: "pack-Upper" }],
    [{ family: "pack-" }],
    [{ family: "pack-a b" }],
    [{ weight: "400;}body{display:none" }],
    [{ weight: "950" }],
    [{ weight: "450" }],
    [{ weight: "1000" }],
    [{ weight: "100 900 400" }],
    [{ style: "oblique" }],
    [{ onload: "x" }],
  ])("%j", (change) => {
    expect(mine(undefined, font(change))).toContain("schema");
  });

  it("a number, a range, a word and italic pass", () => {
    // the Look names the one family this pack brings
    const own = (l: Json) => { for (const k of Object.keys(l.fonts)) l.fonts[k] = "pack-mine"; };
    for (const weight of ["400", "100 900", "normal", "bold"]) expect(mine(own, font({ weight })), weight).toEqual([]);
    expect(mine(own, font({ style: "italic" }))).toEqual([]);
  });
});

describe("N-M3: an icon is a viewBox and a path, and nothing else", () => {
  const icon = (glyph: Json) => mine(undefined, {}, { icons: { bolt: { viewBox: "0 0 24 24", d: "M0 0h3v3z", ...glyph } } });
  it.each([
    [{ onload: "alert(1)" }],
    [{ href: "https://x.test" }],
    [{ viewBox: "0 0 0 0" }],
    [{ viewBox: "0 0 999 999" }],
    [{ viewBox: "0 0 -5 10" }],
    [{ viewBox: "0 0 24" }],
    [{ viewBox: "0 0 1e3 24" }],
    [{ d: "M1e999 0L1 1" }],
    [{ d: "M0 0L99999 1" }],
  ])("%j", (glyph) => {
    expect(icon(glyph)).toContain("icons");
  });

  it("a glyph of any sane box passes", () => {
    expect(icon({})).toEqual([]);
    expect(icon({ viewBox: "0 0 512 512", d: "M0 0L512 512" })).toEqual([]);
    expect(icon({ viewBox: "-12 -12 24 24", d: "M-5.5 0L1e1 2" })).toEqual([]);
  });
});

describe("N-M4: a user pack does not take a built-in's name", () => {
  it.each(["classic", "paper", "field-kit", "black-and-gold", "default", "tui"])("the id %s", (id) => {
    expect(mine((l) => (l.id = id), { id })).toContain("provenance");
  });

  it("every font family of a built-in pack", () => {
    const families = [...PACK_IDS].flatMap((id) => (builtin(id).pack as Json).fonts.map((f: Json) => f.family as string));
    expect(families.length).toBeGreaterThan(15);
    for (const family of families) expect(mine(undefined, { fonts: [{ ...(BASE.pack as Json).fonts[0], family }] }), family).toContain("provenance");
  });

  it("a built-in is read as one of ours: its own id and families are not an issue", () => {
    expect(validatePack(builtin("paper"), { source: "builtin" }).map((i) => i.rule)).not.toContain("provenance");
  });
});

describe("the resource-loading functions, in a Look and in an SVG", () => {
  const FUNCTIONS = ["url(https://x.test/a)", "image-set(\"a.png\" 1x)", "-webkit-image-set(a.png 1x)", "IMAGE(a.png)", "cross-fade(a, b, 50%)", "src(a.woff2)", "element(#a)", "paint(x)", "env(safe-area-inset-top)", "attr(x)", "URL (x)"];
  it.each(FUNCTIONS)("a Look's T3 value %s", (fn) => {
    expect(mine((l) => (l.t3["graph-style"] = fn))).toContain("injection");
    expect(rules(bad({ look: (l) => (l.t1.light.info.value = fn) }))).toContain("injection");
  });

  it.each(FUNCTIONS)("an SVG attribute %s", (fn) => {
    expect(userRules(userPack({ files: [file("assets/hazard.svg", `<svg><rect fill='${fn}'/></svg>`)] }))).toContain("svg-unsafe");
  });

  it("an id inside the file is the one URL an SVG may name", () => {
    expect(userRules(userPack({ files: [file("assets/hazard.svg", '<svg><linearGradient id="g"/><rect fill="url(#g)" style="stroke:url( #g );fill-opacity:.5"/></svg>')] }))).toEqual([]);
    expect(userRules(userPack({ files: [file("assets/hazard.svg", '<svg><rect fill="url(#g) url(x.png)"/></svg>')] }))).toContain("svg-unsafe");
  });

  it("the style attribute is an allow-list of properties, with colour, number and id values", () => {
    const style = (value: string) => userRules(userPack({ files: [file("assets/hazard.svg", `<svg><rect style="${value}"/></svg>`)] }));
    for (const ok of ["fill:#fff", "fill:#102030;stroke:rgb(1, 2, 3);stroke-width:2", "opacity:.4;fill:none", "stop-color:hsl(10 20% 30%)"]) expect(style(ok), ok).toEqual([]);
    for (const bad1 of ["background:#fff", "fill:red", "fill:'x'", "fill:#fff;behavior:x", "mask-image:url(#a)", "fill:var(--x)", "fill:calc(1)", "filter:blur(9px)", "font-family:x"]) expect(style(bad1), bad1).toContain("svg-unsafe");
  });
});

describe("the PNG signature is all eight bytes", () => {
  it("a png that starts like one and holds markup is refused", () => {
    const fake = { path: "assets/p.png", size: 20, bytes: enc("\u0089PNG<svg onload=1></svg>") };
    expect(userRules(userPack({ files: [{ ...fake, size: fake.bytes.length }] }))).toContain("image-type");
    expect(userRules(userPack({ files: [pngFile("assets/p.png", 8)] }))).not.toContain("image-type");
  });
});

// ---- P12b: the gate gaps of review round 3 (L97, L98), failing first ---------------------------------------------------------

describe("H-1: a card with a blur is held at its fallback alpha too (the blur may be off)", () => {
  const glass = (fallback: number | undefined, fillAlpha = 0.95, page = "#22252B") => (l: Json) => {
    // the page under the card is the dark scene unless a case lays it cream: the fallback is what shows where the blur is off
    l.t1.light.bg.value = page;
    l.t2.materials["look-field-kit"] = { kind: "glass", tone: "light", export: CARD, fill: CARD, "fill-alpha": fillAlpha, blur: "20px", ...(fallback === undefined ? null : { "blur-fallback-alpha": fallback }) };
  };

  it("a near-transparent fallback over a dark page is refused, by the contrast and by the floor", () => {
    expect(mine(glass(0.01))).toEqual(expect.arrayContaining(["contrast", "blur-fallback"]));
    expect(mine(glass(0.5))).toContain("blur-fallback");
  });

  it("an opaque fallback passes; 0.9 is the floor (and a 0.9 card over a dark stage is read at 0.9)", () => {
    expect(mine(glass(1, 1))).toEqual([]);
    expect(mine(glass(0.9, 1))).not.toContain("blur-fallback");
    expect(mine(glass(0.9, 1))).toContain("contrast");
  });

  it("a glass fill with no blur named is read as one with a blur", () => {
    expect(mine((l) => { glass(0.01, 1, CARD)(l); delete l.t2.materials["look-field-kit"].blur; })).toContain("blur-fallback");
  });
});

describe("M-1: a material's tone is the side of its card (the shell's faint text and track follow it)", () => {
  const tone = (t: string | undefined) => (l: Json) => {
    const material = l.t2.materials["look-field-kit"];
    if (t === undefined) delete material.tone;
    else material.tone = t;
  };

  it.each(["dark", undefined, "theme", "auto"])("a light card with tone %s", (t) => {
    expect(mine(tone(t))).toContain("tone");
  });

  it("a dark card with tone light is refused, the right tone passes", () => {
    const darkCard = (t: string) => (l: Json) => { l.t2.materials["look-field-kit"] = { kind: "solid", tone: t, export: "#050505", fill: "#050505" }; l.t1.light.surface.value = "#050505"; l.t1.light.fg.value = "#F5F5F4"; l.t1.light["fg-2"].value = "#F5F5F4"; l.t1.light.muted.value = "#A3A3A3"; };
    expect(mine((l) => { darkCard("light")(l); })).toContain("tone");
  });

  it("the shell's tone colours are the ones theme.ts sets", async () => {
    const { TEXT_VARS } = await import("@/widgets/core/theme");
    const { SHELL_TONES } = await import("@/looks/pack-validate");
    expect(TEXT_VARS.dark["--w-faint"]).toBe(SHELL_TONES.dark.faint);
    expect(TEXT_VARS.light["--w-faint"]).toBe(SHELL_TONES.light.faint);
    expect(TEXT_VARS.dark["--w-track"]).toBe(`rgba(255,255,255,.07)`);
    expect(TEXT_VARS.light["--w-track"]).toBe(`rgba(24,24,27,.1)`);
    expect(SHELL_TONES.dark.trackAlpha).toBe(0.07);
    expect(SHELL_TONES.light.trackAlpha).toBe(0.1);
  });
});

describe("M-2: info and accent-on are read against the card and the accent", () => {
  it("info that is the card's colour", () => {
    expect(mine((l) => (l.t1.light.info.value = CARD))).toContain("contrast");
    expect(mine((l) => (l.t1.light.info.value = "#1A1C21"))).toEqual([]);
  });

  it("accent-on that is the accent's colour, or too close to it", () => {
    expect(mine((l) => (l.t1.light["accent-on"].value = l.t1.light.accent.value))).toContain("contrast");
    expect(mine((l) => (l.t1.light["accent-on"].value = "#22252B"))).toContain("contrast");
    expect(mine((l) => (l.t1.light["accent-on"].value = "#FFFFFF"))).toEqual([]);
  });
});

describe("M-3: a width, a stroke, a count or a weight is never nothing", () => {
  it.each([
    ["ring-width", 0], ["ring-width", "0px"], ["series-stroke", 0], ["series-stroke", 9], ["icon-stroke", 0], ["threshold-width", 0.1], ["range-height", 0],
    ["meter-segments", 0], ["meter-segments", 1], ["meter-segments", 1000], ["meter-segments", 2.5],
    ["num-weight", 0], ["num-weight", -1], ["num-weight", "9999"], ["hero-weight", 50], ["num-weight", "heavy"],
    ["num-tracking", "-9999999"], ["num-tracking", "5em"], ["num-tracking", "-1em"],
    ["series-fill-alpha", "1 > 1 > 1 > 1"], ["series-fill-alpha", "1 > 1"], ["series-fill-alpha", "2 > 1 > 0"],
  ])("%s %j", (name, value) => {
    expect(mine((l) => (l.t3[name as string] = value))).toContain("t3");
  });

  it.each([
    ["ring-width", 0.5], ["ring-width", "6px"], ["series-stroke", 4], ["icon-stroke", 2], ["ring-gap", 0], ["meter-gap", 0], ["meter-segments", 24],
    ["num-weight", 200], ["hero-weight", "bold"], ["num-weight", "700"], ["num-tracking", "normal"], ["num-tracking", "-0.04em"], ["series-fill-alpha", "0.32 > 0.06 > 0"],
  ])("%s %j passes", (name, value) => {
    expect(mine((l) => (l.t3[name as string] = value))).toEqual([]);
  });
});

describe("L98: the built-in font families come from the pack.json files (generated into pack-fonts.ts)", () => {
  it("the generated list is every family of every built-in pack, nothing else", async () => {
    const { PACK_FONT_FAMILIES } = await import("@/looks/pack-fonts");
    const families = [...new Set([...PACK_IDS].flatMap((id) => (builtin(id).pack as Json).fonts.map((f: Json) => f.family as string)))].sort();
    expect([...PACK_FONT_FAMILIES]).toEqual(families);
  });
});

describe("a copy of each built-in pack passes as a user pack", () => {
  it.each([...PACK_IDS])("%s", (id) => {
    const src = builtin(id);
    const pack = src.pack as Json;
    const look = structuredClone(src.look) as Json;
    look.id = `my-${id}`;
    for (const k of ["body", "mono", "display"]) if (look.fonts[k]) look.fonts[k] = look.fonts[k].replace("pack-", "pack-my-");
    const files = src.files.filter((f) => f.path !== "pack.css");
    const assets = files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ file: f.path.slice(7), bytes: f.size }));
    const mineSrc: PackSource = { pack: { ...pack, id: `my-${id}`, fonts: pack.fonts.map((f: Json) => ({ ...f, family: f.family.replace("pack-", "pack-my-") })), assets }, look, icons: src.icons, files };
    expect(validatePack(mineSrc).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("L98: the cheap LOWs of review round 3", () => {
  it("L-1: a {faint} alias is refused with the reason, not a bare error", () => {
    const m = validatePack(userPack({ look: (l) => (l.t3["label-color"] = "{faint}") })).map((i) => i.message).join(" ");
    expect(m).toContain("follow the material's tone");
  });

  it("L-2: a tag is not scanned as code: paint (oil) is a tag", () => {
    expect(mine(undefined, { tags: ["paint (oil)", "image (photo)"] })).toEqual([]);
    expect(mine((l) => (l.t3["graph-style"] = "paint (oil)"))).toContain("injection");
  });

  it("L-4: a band header's fill is held to 4.5:1, a title fill to 3:1", () => {
    // 3.6:1 ink on the cream card: enough for a title, not for the small text of a band
    const fill = (style: string) => (l: Json) => { l.t3["header-style"] = style; l.t3["header-fill"] = "#76726A"; };
    expect(mine(fill("label-bar"))).toContain("contrast");
    expect(mine(fill("tab-label"))).toContain("contrast");
    expect(mine(fill("bracket-line"))).toEqual([]);
  });

  it("L-5: a font weight range written backwards", () => {
    const font = (weight: string) => ({ fonts: [{ ...(BASE.pack as Json).fonts[0], family: "pack-mine-a", weight }] });
    expect(mine(undefined, font("900 100"))).toContain("font-weight");
    expect(mine(undefined, font("100 900"))).not.toContain("font-weight");
  });

  it("L-6: a Look names only a pack- family its own pack brings", () => {
    expect(mine((l) => (l.fonts.body = "pack-classy"))).toContain("font-family");
    expect(mine((l) => (l.fonts.body = "pack-nonexistent"))).toContain("font-family");
    expect(mine((l) => (l.fonts.body = "sans"))).not.toContain("font-family");
  });
});

describe("L98 L-8: T1 text is read as drawn, rgb() and an alpha over the card", () => {
  const fg = (value: string) => (l: Json) => (l.t1.light.fg.value = value);
  it("accepts a text with an alpha that still holds 4.5:1 once laid over the card, and an rgb() text", () => {
    expect(mine(fg("#1A1C21F2"))).toEqual([]);
    expect(mine(fg("rgb(26, 28, 33)"))).toEqual([]);
    expect(mine(fg("rgba(26, 28, 33, 0.95)"))).toEqual([]);
  });
  it("refuses an alpha that lets the text fade into the card, by the flattened colour", () => {
    expect(mine(fg("#1A1C2166"))).toContain("contrast");
    expect(mine(fg("rgba(26, 28, 33, 0.3)"))).toContain("contrast");
  });
  it("still refuses a colour it cannot read", () => {
    expect(mine(fg("color-mix(in srgb, #202020, #000)"))).toContain("contrast");
  });
});

describe("a pack's script (G4 as changed 2026-11-23)", () => {
  const FX = "fx.onFrame(function () { fx.draw([]); });";
  // Field Kit lists no assets; a pack that lists one lists them all
  const assets = BASE.files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ file: f.path.slice(7), bytes: f.size }));
  const scripted = (opts: { content?: string; bytes?: Uint8Array; list?: boolean; file?: string; drop?: boolean } = {}): PackSource => {
    const name = opts.file ?? "fx.js";
    const f: PackFile = opts.bytes ? { path: `assets/${name}`, size: opts.bytes.length, bytes: opts.bytes } : file(`assets/${name}`, opts.content ?? FX);
    return bad({ pack: { script: { file: name }, assets: opts.list === false ? assets : [...assets, { file: name, bytes: f.size }] }, files: opts.drop ? [] : [f] });
  };
  /** The rules a script can break, read as a user pack (`script` where it is) and as one of ours. */
  const scriptRules = (src: PackSource, script: "files" | "route" = "files") =>
    validatePack(src, { script }).filter((i) => i.severity === "error" && ["script", "asset-type", "asset-listed", "schema"].includes(i.rule)).map((i) => i.rule);

  it("passes one listed .js asset the script key names, and an old pack without the key is read as before", () => {
    expect(scriptRules(scripted())).toEqual([]);
    expect(rules(scripted())).toEqual(rules(BASE));
    expect(rules(BASE)).toEqual([]);
  });

  it("refuses a .js the key does not name, an unlisted script, a missing one, one over 64 KB and one that is not UTF-8", () => {
    expect(scriptRules(bad({ files: [file("assets/other.js", FX)] }))).toContain("asset-type");
    expect(scriptRules(scripted({ list: false }))).toContain("script");
    expect(scriptRules(scripted({ drop: true }))).toContain("script");
    expect(scriptRules(scripted({ content: "x".repeat(65_537) }))).toContain("script");
    expect(scriptRules(scripted({ bytes: Uint8Array.from([0xff, 0xfe, 0x00]) }))).toContain("script");
  });

  it("refuses a script name that is not a plain .js file name", () => {
    for (const name of ["../fx.js", "fx.mjs", "FX.js", "fx.js?x", "a/fx.js"]) expect(scriptRules(scripted({ file: name })), name).toContain("schema");
  });

  it("reads a pack from the route without the script's bytes: the server keeps them", () => {
    expect(scriptRules(scripted({ drop: true }), "route")).toEqual([]);
  });
});
