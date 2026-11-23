import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { STANDARD_DEFAULTS } from "@/modules/standard-settings";
import { SKINS, SKIN_NAMES, SkinCtx } from "@/widgets/core/theme";
import { skinContext } from "@/widgets/core/look";
import { CompactView, StudioView } from "@/widgets/core/views";
import { LedLadder, Num, Ring, Spark } from "@/widgets/core/primitives";
import { chromeOf } from "@/modules/standard-settings";
import { Widget, type LayoutBox } from "@/widgets/core/Widget";
import { CardLayer } from "@/widgets/core/card-frame";
import type { Compact, Shape, Studio, Tier } from "@/widgets/core/types";

const compact: Compact = { label: "CPU", value: 62.5, d: 1, unit: "%", pct: 62.5, hist: [10, 40, 30, 62], icon: "memory", sub: "8 cores" };
const studio: Studio = { label: "CPU", value: 62.5, unit: "%", pct: 62.5, live: true, rows: [{ n: "Core 0", v: "40%", pct: 40, dot: true }] };
const body = (b: LayoutBox) => h("span", null, `${b.size} ${b.shape}`);

describe("Widget smoke render", () => {
  it("has skins to render", () => {
    expect(SKIN_NAMES.length).toBeGreaterThan(0);
  });

  const draw = (skin: string, variant: "default" | "studio", size: Tier) =>
    // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
    renderToString(h(Widget, { skin, variant, size, title: "System", icon: "dashboard", compact, studio, surface: "auto", children: body }));

  it.each(SKIN_NAMES)("%s renders with its title", (skin) => {
    const html = draw(skin, "default", "lg");
    expect(html).toContain("--w-accent");
    expect(html).toContain("System");
  });

  it("renders the studio variant and the smallest tier", () => {
    for (const [variant, size] of [["studio", "lg"], ["default", "xs"], ["studio", "xs"]] as const) expect(draw("default", variant, size)).toContain("--w-accent");
  });
});

describe("Widget look", () => {
  const render = (look: Record<string, string | number | boolean>, extra: Record<string, unknown> = {}) =>
    // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
    renderToString(h(Widget, { title: "Template title", icon: "memory", size: "lg", children: body, look: { ...STANDARD_DEFAULTS, ...look }, ...extra }));

  it("takes the theme corner radius unless the look sets one, whatever the skin", () => {
    expect(render({}, { skin: "brutal" })).toContain("border-radius:var(--radius, 1rem)");
    expect(render({ radius: "12" }, { skin: "macos" })).toContain("border-radius:12px");
  });

  it("carries the text colour override on a legacy surface: the shell's text variables and the --wp-* ones its surface colours read", () => {
    const html = render({ surface: "matte-light", textColor: "#ff0000", mutedColor: "#00ff00" });
    expect(html).toContain("--w-fg:#ff0000");
    expect(html).toContain("--w-muted:#00ff00");
    expect(html).toContain("--wp-fg:var(--w-fg)");
    expect(html).toContain("--wp-muted:var(--w-muted)");
    expect(html).toContain("color:var(--w-fg)");
  });

  it("fades the card and blurs behind it from the look's opacity and blur", () => {
    const html = render({ surface: "glass", surfaceOpacity: 40, blur: "16" });
    // The shell writes its material as --w-mat-* variables; the [data-mat] rule in index.css paints them.
    expect(html).toContain("--w-mat-blur:blur(min(16px, var(--wp-blur-cap, 16px)))");
    expect(render({ surface: "solid", surfaceOpacity: 40, blur: "8" })).toContain("blur(min(8px, var(--wp-blur-cap, 8px)))");
  });

  it("renders the default glass surface and the forced layout tier", () => {
    const html = render({ layout: "simple" }, { size: undefined });
    expect(html).toContain("xs box");
    expect(html).toContain("linear-gradient(155deg, rgba(24, 24, 27, 0.85)");
  });

  it("applies title, accent, text colours, zoom, padding and custom CSS", () => {
    const html = render({ label: "My CPU", accent: "#ff0000", textColor: "#123456", scale: 150, padding: "8", customCss: ":scope { outline: 1px solid red }" }, { skin: "synth" });
    expect(html).toContain("My CPU");
    expect(html).not.toContain("Template title");
    expect(html).toContain("--w-accent:#ff0000");
    expect(html).toContain("--w-fg:#123456");
    expect(html).toContain("zoom:1.5");
    expect(html).toContain("padding:5.33px");
    expect(html).toContain("@scope");
    expect(html).toContain("data-wp-scope");
  });

  it("shows the background image and keeps the skin accent without an explicit one", () => {
    const html = render({ background: "/bg.png", backgroundOn: true }, { skin: "synth" });
    expect(html).toContain('src="/bg.png"');
    expect(html).toContain("--w-accent:#ff4fd8");
  });

  it("treats an empty surface as unset", () => {
    expect(render({ surface: "" }, { surface: "solid" })).toContain("#141418");
  });

  it("renders the legacy light material with dark text", () => {
    const html = render({ surface: "matte-light" });
    expect(html).toContain("--w-fg:#18181b");
    expect(html).toContain("rgb(244, 244, 245)");
  });

  it("marks a light card with data-mode and its status variables, darkens a failing accent, and leaves a dark card as it was (D3, D27)", () => {
    const light = render({ surface: "matte-light" });
    expect(light).toContain('data-mode="light"');
    expect(light).toContain("--w-ok:#15803d");
    expect(light).toContain("--w-accent:#27795d");
    expect(light).toContain("--accent:#34d399");
    expect(render({ surface: "matte-light", accent: "#ac8ff8" })).toContain("--w-accent:#ac8ff8");
    const dark = render({ surface: "glass" });
    expect(dark).not.toContain("data-mode");
    expect(dark).toContain("--w-accent:#34d399");
    expect(dark).not.toContain("--w-ok");
  });

  it("hands the shell's status variables to a LedLadder on a light card only: a theme card on a dark page keeps the literals (G1)", () => {
    const ladder = (surface: string) =>
      // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
      renderToString(h(Widget, { title: "T", icon: "memory", size: "lg", look: { ...STANDARD_DEFAULTS, surface }, children: () => h(LedLadder, { value: 100, n: 10 }) }));
    expect(ladder("matte-light")).toContain("var(--w-warn, #EDB232)");
    for (const dark of ["theme", "glass"]) {
      expect(ladder(dark)).not.toContain("var(--w-warn, #EDB232)");
      expect(ladder(dark)).toContain("background:#EDB232");
    }
  });

  it("takes a Look's status colours over the mode's own (L33)", () => {
    const html = render({ surface: "matte-light", warn: "#8A5A00", crit: "#A8340F" });
    expect(html).toContain("--w-warn:#8A5A00");
    expect(html).toContain("--w-crit:#A8340F");
  });
});

describe("views", () => {
  const ctx = skinContext("default");
  const inCtx = (el: ReturnType<typeof h>) => renderToString(h(SkinCtx.Provider, { value: ctx }, el));

  it("renders CompactView for every shape and kind", () => {
    const shapes: [Shape, number, number][] = [["tile", 150, 150], ["tile", 110, 110], ["strip", 420, 120], ["column", 120, 300]];
    for (const [shape, w, hh] of shapes)
      for (const kind of ["spark", "bar", "ring", "text", "value"] as const) {
        const html = inCtx(h(CompactView, { c: { ...compact, kind }, shape, w, h: hh }));
        expect(html).toContain("CPU");
      }
    expect(inCtx(h(CompactView, { c: { ...compact, img: "/a.png" }, shape: "tile", w: 150, h: 150 }))).toContain("/a.png");
  });

  it("blurs the compact value when the card asks (Hide IP), as a text card and as a hero", () => {
    for (const kind of ["text", "value"] as const) {
      const quiet = inCtx(h(CompactView, { c: { ...compact, value: "192.0.2.1", kind }, shape: "tile", w: 228, h: 228 }));
      const hidden = inCtx(h(CompactView, { c: { ...compact, value: "192.0.2.1", kind, blur: true }, shape: "tile", w: 228, h: 228 }));
      expect(quiet).not.toContain("blur-xs");
      expect(hidden).toContain("blur-xs hover:blur-0");
    }
  });

  it("glides line graphs with Graph updates: Smooth, and keeps them static when Stepped", () => {
    const spark = (smoothing: string) =>
      renderToString(h(SkinCtx.Provider, { value: skinContext("default", { chrome: chromeOf({ smoothing }) }) }, h(Spark, { values: [1, 5, 3, 8, 6, 4], graph: "line" })));
    expect(spark("smooth")).toContain("overflow-hidden");
    expect(spark("stepped")).toContain("overflow-visible");
  });

  it("draws StudioView labels in the shell's font unless the skin has its own", () => {
    expect(inCtx(h(StudioView, { c: studio, w: 300, h: 80 }))).not.toContain("Geist Mono");
    const own = renderToString(h(SkinCtx.Provider, { value: skinContext("instrument") }, h(StudioView, { c: studio, w: 300, h: 80 })));
    expect(own).toContain("IBM Plex Sans");
  });

  it("renders every StudioView layout", () => {
    const cases: [Studio, number, number][] = [
      [studio, 300, 80],
      [{ ...studio, rows: undefined, hist: [1, 2, 3] }, 220, 200],
      [{ label: "Mix", meters: [{ n: "A", v: 40 }, { n: "B", v: 80 }] }, 220, 150],
      [{ ...studio }, 220, 220],
      [{ label: "Cores", value: 50, cells: [10, 50, 90, 30] }, 220, 160],
      [{ label: "Now", value: "Song", img: "/c.png", progress: { a: "1:00", b: "3:00", pct: 33 } }, 300, 160],
    ];
    for (const [c, w, hh] of cases) expect(inCtx(h(StudioView, { c, w, h: hh }))).toContain(c.img ? String(c.value) : c.label!);
  });
});

describe("Number glow reaches a ring's centre", () => {
  const ring = () => h(Ring, { value: 72 }, h(Num, null, "72"));
  const render = (look: Record<string, string>) =>
    // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
    renderToString(h(Widget, { title: "CPU", surface: "auto", look: { ...STANDARD_DEFAULTS, ...look }, children: ring }));

  it("flags the scope and sets the glow variables, and the ring's number is a numeral the stylesheet reaches", () => {
    const html = render({ numGlow: "strong" });
    expect(html).toContain('data-wp-numglow="strong"');
    expect(html).toMatch(/class="tabular-nums[^"]*"[^>]*>72</);
  });

  it("leaves a widget on Auto unflagged", () => {
    const html = render({});
    expect(html).not.toContain("data-wp-numglow");
  });
});

describe("Widget slots", () => {
  // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
  const render = (skin: string) => renderToString(h(Widget, { skin, size: "md", title: "System", compact, children: body }));

  it("draws the frame its skin names, and nothing extra for a skin with none", () => {
    expect(render("tui")).toContain("inset-1.25");
    expect((render("hud").match(/border-[lr] border-[tb]/g) ?? []).length).toBe(4);
    const plain = render("default");
    expect(plain).not.toContain("inset-1.25");
    expect(plain).not.toContain("data-wp-layer");
    expect(plain).not.toContain("--wp-pad");
  });

  it("marks the card root for a pack to style", () => {
    expect(render("default")).toContain('data-part="card"');
  });
});

const ornamentSlot = () => h("i");

describe("shell layers", () => {
  it("renders an ornament in a click-through, hidden layer", () => {
    const html = renderToString(h(CardLayer, { part: "ornament", Slot: ornamentSlot }));
    expect(html).toContain('data-wp-layer="ornament"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain('aria-hidden="true"');
  });
});

const Orn = () => h("i", { "data-t": "orn" });
const Band = () => h("i", { "data-t": "band" });

describe("Widget slot layout", () => {
  const values = [1, 5, 2, 8, 3, 9];
  // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
  const render = (skin: string, extra: Record<string, unknown> = {}) => renderToString(h(Widget, { skin, size: "lg", title: "T", icon: "memory", children: () => h(Spark, { values, graph: "area" }), ...extra }));
  const slotted = (tokens: object) => {
    SKINS.qa = { ...SKINS.default, ...tokens };
    return render("qa");
  };
  afterEach(() => {
    delete SKINS.qa;
  });

  it("hands the padding to the layers as --wp-pad and draws frame, ornament, tab band, then the padded body in that order", () => {
    const html = slotted({ frame: "inset", ornament: Orn, tabBand: Band });
    expect(html).toContain("--wp-pad:20px");
    const at = (s: string) => html.indexOf(s);
    expect(at('inset-1.25')).toBeGreaterThan(-1);
    expect(at('inset-1.25')).toBeLessThan(at('data-wp-layer="ornament"'));
    expect(at('data-wp-layer="ornament"')).toBeLessThan(at('data-wp-layer="tab-band"'));
    expect(at('data-wp-layer="tab-band"')).toBeLessThan(at("data-wp-body"));
  });

  it("follows the Look's padding and draws nothing without a slot", () => {
    const html = slotted({ ornament: Orn });
    expect(html).toContain('data-t="orn"');
    expect(html).not.toContain('data-wp-layer="tab-band"');
    const none = render("default");
    expect(none).not.toContain("--wp-pad");
    expect(none).not.toContain('data-wp-layer="ornament"');
  });

  it("keeps a child's useId (a graph's gradient id) the same with and without the slots", () => {
    const idOf = (html: string) => html.match(/sp_?[A-Za-z0-9_]*R[A-Za-z0-9_]*/)?.[0];
    const plain = idOf(render("default"));
    expect(plain).toBeTruthy();
    expect(idOf(slotted({ frame: "inset", ornament: Orn, tabBand: Band }))).toBe(plain);
  });
});
