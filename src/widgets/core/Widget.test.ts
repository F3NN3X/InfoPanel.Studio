import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_DEFAULTS } from "@/modules/standard-settings";
import { SKIN_NAMES, SkinCtx } from "./theme";
import { skinContext } from "./look";
import { CompactView, StudioView } from "./views";
import { Spark } from "./primitives";
import { chromeOf } from "@/modules/standard-settings";
import { Widget, type LayoutBox } from "./Widget";
import type { Compact, Shape, Studio, Tier } from "./types";

const compact: Compact = { label: "CPU", value: 62.5, d: 1, unit: "%", pct: 62.5, hist: [10, 40, 30, 62], icon: "memory", sub: "8 cores" };
const studio: Studio = { label: "CPU", value: 62.5, unit: "%", pct: 62.5, live: true, rows: [{ n: "Core 0", v: "40%", pct: 40, dot: true }] };
const body = (b: LayoutBox) => h("span", null, `${b.size} ${b.shape}`);

describe("Widget smoke render", () => {
  it("has skins to render", () => {
    expect(SKIN_NAMES.length).toBeGreaterThan(0);
  });

  it.each(SKIN_NAMES)("%s renders at the smallest and the largest tier, in both variants", (skin) => {
    for (const variant of ["default", "studio"] as const)
      for (const size of ["xs", "lg"] as Tier[]) {
        const html = renderToString(h(Widget, { skin, variant, size, title: "System", icon: "dashboard", compact, studio, surface: "auto", children: body }));
        expect(html).toContain("--accent");
        if (variant === "default" && size !== "xs") expect(html).toContain("System");
      }
  });
});

describe("Widget look", () => {
  const render = (look: Record<string, string | number | boolean>, extra: Record<string, unknown> = {}) =>
    renderToString(h(Widget, { title: "Template title", icon: "memory", size: "lg", children: body, look: { ...STANDARD_DEFAULTS, ...look }, ...extra }));

  it("takes the theme corner radius unless the look sets one, whatever the skin", () => {
    expect(render({}, { skin: "brutal" })).toContain("border-radius:var(--radius, 1rem)");
    expect(render({ radius: "12" }, { skin: "macos" })).toContain("border-radius:12px");
  });

  it("fades the card and blurs behind it from the look's opacity and blur", () => {
    const html = render({ surface: "glass", surfaceOpacity: 40, blur: "16" });
    expect(html).toContain("backdrop-filter:blur(16px)");
    expect(render({ surface: "solid", surfaceOpacity: 40, blur: "8" })).toContain("blur(8px)");
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
    expect(html).toContain("--accent:#ff0000");
    expect(html).toContain("--w-fg:#123456");
    expect(html).toContain("zoom:1.5");
    expect(html).toContain("padding:5.33px");
    expect(html).toContain("@scope");
    expect(html).toContain("data-wp-scope");
  });

  it("shows the background image and keeps the skin accent without an explicit one", () => {
    const html = render({ background: "/bg.png", backgroundOn: true }, { skin: "synth" });
    expect(html).toContain('src="/bg.png"');
    expect(html).toContain("--accent:#ff4fd8");
  });

  it("treats an empty surface as unset", () => {
    expect(render({ surface: "" }, { surface: "solid" })).toContain("#141418");
  });

  it("renders the legacy light material with dark text", () => {
    const html = render({ surface: "matte-light" });
    expect(html).toContain("--w-fg:#18181b");
    expect(html).toContain("rgb(244, 244, 245)");
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
