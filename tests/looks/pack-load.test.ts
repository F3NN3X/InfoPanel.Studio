import { describe, expect, it } from "vitest";
import { effectIssues } from "@/looks/effects";
import { PACK_IDS, type Pack } from "@/looks/pack";
import { BUILTIN, loadPack, packIssues, registerPack, unregisterPack } from "@/looks/pack-load";
import { badPack, TEST_PACK } from "./__fixtures__/test-pack";

const from = (pack: Pack) => ({ [pack.id]: async () => ({ default: pack }) });

describe("the pack loader (G4)", () => {
  it("loads a pack that passes every check", async () => {
    expect(packIssues(TEST_PACK)).toEqual([]);
    expect(await loadPack("test-pack", from(TEST_PACK))).toEqual({ ...TEST_PACK, Stage: expect.any(Function), stage: { ...TEST_PACK.stage, accent: expect.any(String) }, chrome: { fill: expect.any(String), ink: expect.any(String), edge: expect.any(String), muted: expect.any(String), accent: expect.any(String), panel: { vars: expect.any(Object), badge: expect.any(Object), legible: expect.any(Function) }, page: expect.any(Object), tones: { info: expect.any(Object), warning: expect.any(Object), critical: expect.any(Object) } } });
  });

  it.each([
    ["a remote url in the CSS", { css: ".a { background: url(https://evil.example/x.png) }" }],
    ["an @import in the CSS", { css: '@import "other.css";' }],
    ["an escaped url( in the CSS", { css: String.raw`.a { background: u\72l(//evil.example/x.png) }` }],
    ["a remote asset path", { assets: ["https://evil.example/x.woff2"] }],
    ["an asset path that climbs out of the folder", { assets: ["../../x.png"] }],
    ["a root asset path", { assets: ["/etc/passwd"] }],
    ["a stage image that leaves the folder", { stage: { layers: [{ image: "..%2fx.png" }] } }],
    ["a stage image with a quote", { stage: { layers: [{ image: 'a".png' }] } }],
    ["a stage fill that is an image", { stage: { layers: [{ fill: "url(https://evil.example/x.png)" }] } }],
    ["four stage layers", { stage: { layers: [{}, {}, {}, {}] } }],
    ["a rule that hides the page", { css: "body { display: none }" }],
    ["a rule that moves a card", { css: ".card { position: absolute }" }],
    ["a rule that scales everything", { css: "* { transform: scale(2) }" }],
    ["a size", { css: "[data-part=card] { width: 10px }" }],
    ["font-size", { css: "[data-part=card] { font-size: 40px }" }],
    ["!important", { css: "[data-part=card] { color: red !important }" }],
    ["a selector on :root", { css: ":root { color: red }" }],
    ["a selector on html", { css: "html .a { color: red }" }],
    ["a selector on :host", { css: ":host { color: red }" }],
    ["content outside a pseudo-element", { css: ".a { content: 'x' }" }],
    ["a rule that closes the scope", { css: ".a { color: red } } body { display: none } .b { color: red" }],
    ["an @layer or @scope of its own", { css: "@layer other { .a { color: red } }" }],
    ["a nested rule", { css: ".a { color: red; .b { display: none } }" }],
    ["a remote base", { base: "https://evil.example/" }],
    ["a protocol-relative base", { base: "//evil.example/" }],
    ["a base that climbs out", { base: "../../x/" }],
    ["a base without a closing slash", { base: "/packs/x" }],
    ["an id that is not a slug", { id: 'a"]{}' }],
    ["a Look id that is not the pack id", { look: { ...TEST_PACK.look, id: "other" } }],
    ["no supported modes", { look: { ...TEST_PACK.look, modes: {} as never } }],
  ] as [string, Partial<Pack>][])("refuses a pack with %s", async (_, patch) => {
    const pack = badPack(patch);
    expect(packIssues(pack).length).toBeGreaterThan(0);
    expect(await loadPack("test-pack", from(pack))).toBeUndefined();
  });

  it("takes paint properties, --pack-* custom properties, its own keyframes and font faces, and @media, scoped to the pack", () => {
    const css = [
      "[data-part=card] { background: linear-gradient(#000, #111); border-color: red; box-shadow: 0 0 4px red; --pack-glow: #f0f; font-family: pack-body; filter: saturate(1.2) }",
      ".a::before { background: red }",
      "@keyframes pack-pulse { from { opacity: 0.6 } 50% { opacity: 1 } to { opacity: 0.6 } }",
      "@font-face { font-family: pack-body; src: url(fonts/body.woff2) }",
      "@media (min-width: 600px) { .b { backdrop-filter: blur(12px); animation: pack-pulse 2s infinite } }",
    ].join(" ");
    expect(packIssues(badPack({ css }))).toEqual([]);
  });

  it("refuses an unknown id, an inherited key and a module that is another pack", async () => {
    expect(await loadPack("nope", from(TEST_PACK))).toBeUndefined();
    expect(await loadPack("constructor", from(TEST_PACK))).toBeUndefined();
    expect(await loadPack("other", from(TEST_PACK) as never)).toBeUndefined();
    expect(await loadPack("test-pack", { "test-pack": async () => ({ default: { ...TEST_PACK, id: "other" } }) })).toBeUndefined();
  });

  it("keeps a gradient numeral at 3:1 on the Look's surface, in every mode it supports", () => {
    const withFill = (fill: string): Pack => ({ ...TEST_PACK, look: { ...TEST_PACK.look, t3: { ...TEST_PACK.look.t3, "num-fill": fill } } });
    expect(packIssues(withFill("linear-gradient(#ffffff, #f4f4f5)"))).toEqual([]);
    // dark surface #18181b: a near-black stop is unreadable
    expect(packIssues(withFill("linear-gradient(#ffffff, #202024)")).join()).toMatch(/under 3:1/);
    expect(packIssues(withFill("linear-gradient(oklch(80% 0.1 30), #ffffff)")).join()).toMatch(/cannot be checked/);
    // the light surface (#f4f4f5) makes the same white stop unreadable once the Look supports light
    const both = { ...TEST_PACK, look: { ...TEST_PACK.look, modes: { supported: ["dark", "light"] as ("dark" | "light")[] } } };
    expect(packIssues(both).join()).toMatch(/#ffffff is 1\.\d+:1 on the surface in light/);
    expect(packIssues(withFill("url(https://evil.example/x.png)")).join()).toMatch(/not a gradient/);
  });

  it("holds a gradient ring and spark to the same 3:1 on the surface as the numerals", () => {
    const withInk = (name: string, fill: string): Pack => ({ ...TEST_PACK, look: { ...TEST_PACK.look, t3: { ...TEST_PACK.look.t3, [name]: fill } } });
    for (const name of ["ring-fill", "spark-fill"]) {
      expect(packIssues(withInk(name, "linear-gradient(#ffffff, #f4f4f5)")), name).toEqual([]);
      expect(packIssues(withInk(name, "linear-gradient(#ffffff, #202024)")).join(), name).toMatch(new RegExp(`${name} stop #202024 .* under 3:1`));
      expect(packIssues(withInk(name, "url(https://evil.example/x.png)")).join(), name).toMatch(/not a gradient/);
    }
  });

  it("registers a source and its id, and the shipped id list matches the built-in sources", async () => {
    expect(Object.keys(BUILTIN).filter((id) => id !== "test-pack").sort()).toEqual([...PACK_IDS].filter((id) => id !== "test-pack").sort());
    try {
      registerPack("test-pack", async () => ({ default: TEST_PACK }));
      expect(PACK_IDS.has("test-pack")).toBe(true);
      expect((await loadPack("test-pack"))?.id).toBe("test-pack");
    } finally {
      unregisterPack("test-pack");
    }
  });
});

describe("the pack loader (P9b parts)", () => {
  const template = { id: "test-pack-hero", name: "Hero", blurb: "", fits: ["standard"], size: { width: 1920, height: 1080 }, look: { style: { lookId: "test-pack" } }, layouts: { standard: { cols: 1, rows: 1, pages: [[{ module: "Clock", at: [1, 1, 1, 1] }]] } } };

  it("accepts effects, burn-in, a status bar edge, connectors, an icon set and templates", () => {
    const pack = badPack({
      stage: { layers: [{ fill: "#000", minSizeClass: "md" }], overlayMinSizeClass: "sm", effects: [{ kind: "grain", cost: "static" }] },
      burnIn: "needs-shift",
      statusBar: { edge: "bottom" },
      connectors: { style: "elbow", dot: true },
      templates: [template] as never,
    });
    expect(packIssues(pack)).toEqual([]);
  });

  it.each([
    ["a glow that claims to be static", { stage: { layers: [], effects: [{ kind: "glow", cost: "static" }] } }],
    ["an unknown burn-in", { burnIn: "never" }],
    ["an unknown edge", { statusBar: { edge: "left" } }],
    ["an unknown connector style", { connectors: { style: "curve" } }],
    ["a bad layer size class", { stage: { layers: [{ minSizeClass: "huge" }] } }],
    ["an icon off the list", { slots: { icons: { "not-an-icon": { viewBox: "0 0 24 24", d: "M0 0" } } } }],
    ["markup in an icon path", { slots: { icons: { memory: { viewBox: "0 0 24 24", d: "<svg/>" } } } }],
    ["a template of another pack's Look", { templates: [{ ...template, look: { style: { lookId: "classic" } } }] }],
    ["a template id without the pack's prefix", { templates: [{ ...template, id: "hero" }] }],
    ["a template without a layout", { templates: [{ ...template, layouts: {} }] }],
  ])("refuses %s", (_, patch) => {
    expect(packIssues(badPack(patch as Partial<Pack>))).not.toEqual([]);
  });

  it("collects the page templates of the built-in packs (Holo's cockpit) and the registered ones", async () => {
    const { loadPackTemplates } = await import("@/looks/pack-load");
    registerPack("test-pack", async () => ({ default: badPack({ templates: [template] as never }) }));
    try {
      expect((await loadPackTemplates()).map((t) => t.id)).toEqual(["holo-cockpit", "test-pack-hero"]);
    } finally {
      unregisterPack("test-pack");
    }
  });
});

describe("the pack loader (review round 1)", () => {
  const zone = { module: "Clock", at: [1, 1, 1, 1] };
  const template = { id: "test-pack-hero", name: "Hero", blurb: "", fits: ["standard"], size: { width: 1920, height: 1080 }, look: { style: { lookId: "test-pack" } }, layouts: { standard: { cols: 2, rows: 2, pages: [[zone]] } } };
  const withTemplate = (patch: object) => badPack({ templates: [{ ...template, ...patch }] as never });

  it("accepts a template that makes a screen", () => {
    expect(packIssues(withTemplate({}))).toEqual([]);
  });

  it.each([
    ["a page with no zone", { layouts: { standard: { cols: 2, rows: 2, pages: [[]] } } }],
    ["a layout without pages", { layouts: { standard: { cols: 2, rows: 2, pages: [] } } }],
    ["a zone off the grid", { layouts: { standard: { cols: 2, rows: 2, pages: [[{ module: "Clock", at: [2, 1, 2, 1] }]] } } }],
    ["a zone box that is not four whole numbers", { layouts: { standard: { cols: 2, rows: 2, pages: [[{ module: "Clock", at: [1, 1, 0, 1] }]] } } }],
    ["a widget that does not exist", { layouts: { standard: { cols: 2, rows: 2, pages: [[{ module: "no-such-widget", at: [1, 1, 1, 1] }]] } } }],
    ["a grid with no columns", { layouts: { standard: { cols: 0, rows: 2, pages: [[zone]] } } }],
    ["a class it fits with no layout", { fits: ["standard", "tall"] }],
    ["a layout under an unknown class", { layouts: { standard: { cols: 2, rows: 2, pages: [[zone]] }, huge: { cols: 1, rows: 1, pages: [[zone]] } } }],
    ["a size that is not a size", { size: { width: 0, height: 1080 } }],
    ["no name", { name: undefined }],
  ])("refuses a template with %s", (_, patch) => {
    expect(packIssues(withTemplate(patch))).not.toEqual([]);
  });

  it("refuses a pack whose effects list holds a null, without throwing", () => {
    expect(effectIssues([null as never])).toEqual(["effect 0 is not an effect"]);
    expect(packIssues(badPack({ stage: { layers: [], effects: [null as never] } }))).not.toEqual([]);
  });
});
