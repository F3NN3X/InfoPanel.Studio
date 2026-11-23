import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PACK_IDS, packBackground } from "@/looks/pack";
import PackStageLayers from "@/looks/pack-stage";
import { Widget } from "@/widgets/core/Widget";
import { TEST_PACK } from "./__fixtures__/test-pack";

// biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
const card = (props: Record<string, unknown> = {}) => renderToString(h(Widget, { size: "lg", title: "T", icon: "memory", children: () => h("i"), ...props }));
const withPack = () => card({ t3: TEST_PACK.look.t3, slots: TEST_PACK.slots, packId: "test-pack" });

describe("a pack Look through Widget", () => {
  it("draws the frame, ornament, tab band, icon set and gradient numerals its Look carries", () => {
    const html = withPack();
    expect(html).toContain('data-wp-layer="ornament"');
    expect(html).toContain('data-wp-layer="tab-band"');
    expect(html).toContain("mask-composite");
    expect(html).toContain("--wp-pad:20px");
    expect(html).toContain("M2 2h20v20H2z");
    expect(html).toContain('data-look="test-pack"');
  });
  it("draws nothing extra for Classic or a Look that is not a pack", () => {
    const plain = card();
    for (const mark of ["data-wp-layer", "--wp-pad", "mask-composite", "M2 2h20v20H2z"]) expect(plain).not.toContain(mark);
    expect(card({ t3: undefined, slots: undefined, packId: undefined })).toBe(plain);
    expect(plain).not.toContain("data-look");
  });
  it("keeps every ornament and tab band mark inside the card's padding, and the ornament within 10 px (plan risk line, H4.5)", () => {
    const html = withPack();
    const pad = Number(/--wp-pad:(\d+(?:\.\d+)?)px/.exec(html)?.[1]);
    expect(pad).toBeGreaterThanOrEqual(10);
    let marks = 0;
    for (const part of ["ornament", "tab-band"]) {
      const layer = html.split(`data-wp-layer="${part}"`)[1].split(/data-wp-layer|data-wp-body/)[0];
      for (const [, style] of layer.matchAll(/<i data-t="[^"]*" style="([^"]*)"/g)) {
        const px = (name: string) => {
          const m = new RegExp(`(?:^|;)${name}:(-?[\\d.]+)(?:px)?(?:;|$)`).exec(style);
          return m ? Number(m[1]) : undefined;
        };
        const [top, left, right, bottom, w, ht] = ["top", "left", "right", "bottom", "width", "height"].map(px);
        for (const edge of [top, left, right, bottom]) expect(edge ?? 0, `${part} offset in ${style}`).toBeGreaterThanOrEqual(0);
        if (part === "ornament") for (const size of [w, ht]) expect(size ?? 0, `ornament size in ${style}`).toBeLessThanOrEqual(10);
        // along each axis: what is anchored to an edge reaches in by offset plus size, never past the padding
        for (const [from, size] of [[top, ht], [bottom, ht], [left, w], [right, w]] as const) if (from !== undefined) expect(from + (size ?? 0), `${part} reach in ${style}`).toBeLessThanOrEqual(pad);
        marks++;
      }
    }
    expect(marks).toBe(2);
  });
});

describe("the pack stage", () => {
  it("draws up to 3 decorative layers with their fill or image, and the overlay", () => {
    const html = renderToString(h(PackStageLayers, { stage: { ...TEST_PACK.stage!, layers: [...TEST_PACK.stage!.layers, { fill: "red" }] }, packId: "test-pack", base: TEST_PACK.base, className: "fixed inset-0 -z-10", overlayClassName: "fixed inset-0 z-10" }));
    expect(html.match(/data-pack-layer="\d"/g)).toHaveLength(3);
    expect(html).toContain('data-pack-deco=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("url(&quot;/packs/test-pack/bg.png&quot;)");
    expect(html).toContain('data-t="overlay"');
    expect(html.match(/data-look="test-pack"/g)).toHaveLength(4);
  });
  it("paints no fill that is not a colour or a gradient", () => {
    const html = renderToString(h(PackStageLayers, { stage: { layers: [{ fill: "url(https://evil.example/x.png)" }] } }));
    expect(html).not.toContain("evil.example");
  });
  it("counts as a page background only with layers, and only the built-in Looks are packs (P10, P11)", () => {
    expect(packBackground(TEST_PACK)).toBe(true);
    expect(packBackground({ ...TEST_PACK, stage: { layers: [] } })).toBe(false);
    expect(packBackground(undefined)).toBe(false);
    expect([...PACK_IDS].sort()).toEqual(["black-and-gold", "classy-black", "cyberspec", "field-kit", "holo", "liquid-glass", "neon-stripe", "night-glow", "overdrive", "paper", "swiss-mono", "tape-86", "term"]);
  });
});
