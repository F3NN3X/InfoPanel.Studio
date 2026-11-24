// @vitest-environment happy-dom
// The component treatments (src/widgets/core/treatments.tsx): what each T3 token draws on the card, that a Look asking for none (Classic,
// and every pack before these tokens) writes the markup it always did, and the readout's fit to its card.
import { act, cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode, useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import classic from "@/looks/classic/look.json";
import type { PackFrame } from "@/looks/pack-json";
import { Bar, BarRow, Chip, LegendRow, Metric, Pill, Ring, RingStack, ShareBar, Spark } from "@/widgets/core/primitives";
import { t3Tokens } from "@/widgets/core/t3-tokens";
import { Part, Readout, hexPath, overflows, rowAttrs, slabAttrs, splitDecimals, stateAttr } from "@/widgets/core/treatments";
import { Widget } from "@/widgets/core/Widget";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CLASSIC_T3 = classic.t3 as Record<string, string | number>;
/** Cyberspec v2's T3, before the pack wore any treatment: a pack's own data styles that name none. */
const CYBERSPEC_V2_T3: Record<string, string | number> = { "header-style": "label-bar", "label-case": "upper", "ring-style": "segmented", "ring-cap": "butt", "meter-style": "segments", "meter-hold-style": "block", "cell-radius": "0px", "graph-style": "line", "series-stroke": 1.5, "spike-shape": "tick", "fader-knob-shape": "square", "meter-segments": 20, "meter-gap": 2, "grid-line": "{accent} / 24%", "label-color": "{accent}", "series-1": "{accent}", "series-2": "{muted}", "series-3": "{fg}", "accent-ink": "{accent}", "meter-ok": "{accent-ink}", "icon-color": "{accent}" };
const draw = (t3: Record<string, string | number> | undefined, children: ReactNode, frame?: PackFrame) =>
  renderToString(createElement(Widget, { size: "lg", title: "T", icon: "memory", t3: t3 && { ...CLASSIC_T3, ...t3 }, slots: frame ? { decor: { frame } } : undefined, packId: frame ? "p" : undefined, children }));
const ALL = (
  <>
    <Metric label="CPU" value={57} unit="%" t="warn" />
    <Bar value={50} t="crit" />
    <BarRow label="Disk" value={92} warn={70} crit={90} />
    <Ring value={40} />
    <RingStack rings={[{ v: 50, color: "red" }]} />
    <Spark values={[1, 4, 2, 6]} />
    <Spark values={[1, 4, 2, 6]} graph="bars" />
    <Chip>New</Chip>
    <Pill state="warn">Low</Pill>
    <LegendRow color="red" label="A" value="1" />
    <Part as="li" kind="row" current>row</Part>
    <Part as="span" kind="avatar" className="h-6 w-6" style={{ color: "red" }}>A</Part>
    <ShareBar parts={[{ pct: 30, color: "red" }, { pct: 20, color: "blue" }]} />
  </>
);
const HOOKS = /data-wp-slab|data-state=|data-part="(row|row-head|cell|decimals|readout-bar)"|data-readout|data-meter="cells"|data-ring="hex"|data-grid="dashed"|data-lead|data-pack-frame-host|data-frame-tone|data-frame-rule|--wp-slab|data-avatar|data-part="(share|ticks|thumb)"|data-meter="ruler"|clip-path:polygon\(50% 0/;

describe("a Look that asks for no treatment", () => {
  it("maps to no token: Classic's values, and words outside the vocabulary", () => {
    expect(t3Tokens(CLASSIC_T3)).toEqual({});
    expect(t3Tokens({ "slab-header": "solid", "row-style": "banded", "graph-grid": "dotted", "readout-scale": 9, "meter-peak": "yes" })).toEqual({});
  });

  it("draws the same markup as before, with none of the treatment hooks: Classic, no Look, and a pack's own T3 (Cyberspec v2)", () => {
    const none = draw(undefined, ALL);
    expect(draw(CLASSIC_T3, ALL)).toBe(none);
    expect(none).not.toMatch(HOOKS);
    expect(draw(CYBERSPEC_V2_T3, ALL)).not.toMatch(HOOKS);
  });
});

describe("tone slabs", () => {
  it("map each part's role, the ink, the info tone, the texture and the notch", () => {
    expect(t3Tokens({ "slab-header": "state", "slab-row": "current", "slab-chip": "current", "slab-ink": "#101010", "slab-texture": "scanlines", "slab-notch": 8 }).slab).toEqual({ roles: { header: "state", row: "current" }, ink: "#101010", info: "#5EF6FF", texture: true, notch: 8, current: "accent" });
    expect(t3Tokens({ "slab-card": "warn", "slab-ink": "{accent}" }).slab?.ink).toBe("var(--w-accent)");
  });

  it("put a part's own warning or critical state over its constant tone, and a header or card on `state` follows the card", () => {
    const sk = { slab: { roles: { chip: "accent", header: "state", card: "state", row: "current", tab: "state" }, ink: "#000", info: "#0ff", texture: false, notch: 0, current: "accent" } } as const;
    expect(slabAttrs(sk, "chip")).toEqual({ "data-wp-slab": "accent" });
    expect(slabAttrs(sk, "chip", "crit")).toEqual({ "data-wp-slab": "crit" });
    expect(slabAttrs(sk, "header")).toEqual({ "data-wp-slab-state": "" });
    expect(slabAttrs(sk, "card", "warn")).toEqual({ "data-wp-slab": "warn" });
    expect(slabAttrs(sk, "row", undefined, true)).toEqual({ "data-wp-slab": "accent" });
    expect(slabAttrs(sk, "row")).toEqual({});
    expect(slabAttrs(sk, "tab")).toEqual({});
    expect(slabAttrs({}, "chip", "crit")).toEqual({});
    expect(stateAttr(sk, "warn")).toEqual({ "data-state": "warn" });
    expect(stateAttr(sk, "ok")).toBeUndefined();
    expect(stateAttr({}, "crit")).toBeUndefined();
  });

  it("draw on the card: its slab colours resolved on it, the header, chips and states hooked", () => {
    const html = draw({ "slab-header": "state", "slab-chip": "info", "slab-texture": "scanlines", "slab-notch": 6 }, ALL);
    expect(html).toContain("--wp-slab-ink:#0B0B12");
    // the accent slab is the card's accent colour itself, never `var(--w-accent)`, which a slab around it has set to its ink
    expect(html).not.toContain("--wp-slab-accent:var(--w-accent)");
    expect(
      renderToString(
        <Widget size="lg" title="T" accent="#12AB34" t3={{ ...CLASSIC_T3, "slab-card": "accent" }}>
          <i />
        </Widget>,
      ),
    ).toContain("--wp-slab-accent:#12AB34");
    expect(html).toContain("--wp-slab-cut:6px");
    expect(html).toContain("repeating-linear-gradient(0deg, rgb(255 255 255 / 0.16)");
    expect(html).toMatch(/<header data-part="header" data-wp-slab-state=""/);
    expect(html).toMatch(/data-part="chip" data-wp-slab="info"/);
    expect(html).toMatch(/data-part="chip" data-wp-slab="warn"/);
    expect(html).toMatch(/data-part="num" data-state="warn"/);
    expect(html).toMatch(/data-part="bar" data-state="crit"/);
  });

  it("a whole card as a slab in a tone", () => {
    expect(draw({ "slab-card": "ok" }, <i />)).toMatch(/data-part="card"[^>]*data-wp-slab="ok"/);
  });
});

describe("rows and cells", () => {
  it("carry their hooks only where the Look styles rows", () => {
    expect(rowAttrs({}, { state: "warn" })).toEqual({});
    expect(rowAttrs({ rows: "ruled" }, { state: "warn", current: true })).toEqual({ "data-part": "row", "data-state": "warn", "data-current": "" });
    expect(rowAttrs({ rows: "ruled" }, { head: true })).toEqual({ "data-part": "row-head" });
    const html = draw({ "row-style": "ruled" }, ALL);
    expect(html).toMatch(/data-part="card"[^>]*data-wp-rows="ruled"/);
    expect(html).toMatch(/<li data-part="row" data-current="">row<\/li>/);
    expect(html).toMatch(/data-part="row" data-state="crit"/);
    expect(renderToString(<Part kind="cell" state="crit" className="x">7</Part>)).toBe('<div class="x">7</div>');
  });
});

describe("readouts", () => {
  it("split a plain number's decimals, and nothing else", () => {
    expect(splitDecimals("412.8")).toEqual(["412", ".8"]);
    expect(splitDecimals("-1,024.25")).toEqual(["-1,024", ".25"]);
    expect(splitDecimals("57")).toBeUndefined();
    expect(splitDecimals("1.2 GHz")).toBeUndefined();
  });

  it("draw a hero value at the scale, its decimals smaller, and the under-bar in the reading's colour", () => {
    const html = draw({ "readout-scale": 2.5, "readout-decimals": 0.5, "readout-bar": "rule" }, <Metric label="Out" value="412.8" unit="DPS" t="warn" />);
    expect(html).toContain('<span data-readout="" class="inline-block leading-none" style="font-size:2.5em">');
    expect(html).toContain('<span data-part="decimals" style="font-size:0.5em">.8</span>');
    expect(html).toMatch(/data-part="readout-bar"[^>]*color:var\(--w-warn/);
    expect(draw({ "readout-bar": "rule" }, <Metric label="Heat" value="31" pct={31} />)).toContain("0 0 / 31% 100% no-repeat");
    // a metric that is not a hero (one of several side by side) keeps its size
    expect(draw({ "readout-scale": 2.5 }, <Metric label="A" value="1" hero={false} />)).not.toContain("data-readout");
  });

  it("are stepped down before paint until nothing pokes out of the card, never under the widget's own size", () => {
    // a body 250 px wide; the readout is 100 px wide per em of its scale
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const em = this.hasAttribute("data-readout") ? Number.parseFloat(this.style.fontSize || "1") : 0;
      const w = this.hasAttribute("data-wp-body") ? 250 : em * 100;
      return { left: 0, top: 0, right: w, bottom: 20, width: w, height: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const spec = { scale: 4, decimals: 1, bar: false };
    const { container } = render(<div data-part="card"><div data-wp-body=""><Readout spec={spec} value="57" /></div></div>);
    expect((container.querySelector("[data-readout]") as HTMLElement).style.fontSize).toBe("2.19em");
    cleanup();
    const wide = render(<div data-part="card"><div data-wp-body=""><Readout spec={{ ...spec, scale: 2 }} value="57" /></div></div>);
    expect((wide.container.querySelector("[data-readout]") as HTMLElement).style.fontSize).toBe("2em");
  });

  it("read an element as poking out when it leaves the body or its parent is narrower than it", () => {
    const { container } = render(<div data-wp-body=""><span><b>x</b></span></div>);
    const b = container.querySelector("b") as HTMLElement;
    const body = container.querySelector("[data-wp-body]") as HTMLElement;
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 100, bottom: 50 } as DOMRect);
    vi.spyOn(b, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 120, bottom: 10 } as DOMRect);
    expect(overflows(b)).toBe(true);
    vi.spyOn(b, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 90, bottom: 10 } as DOMRect);
    expect(overflows(b)).toBe(false);
  });
});

describe("cell meters, hex rings and signal graphs", () => {
  it("a cell meter: square cells, at least one lit, the lit ones textured, the ones past the warning tinted, the peak held", () => {
    const html = draw({ "meter-style": "cells", "meter-empty": "#1B3A42" }, <Bar value={1} mark={50} segments={20} />);
    const cells = html.match(/<span class="min-w-0 flex-1" style="[^"]*"/g) ?? [];
    expect(cells).toHaveLength(20);
    expect(cells[0]).toContain("repeating-linear-gradient");
    expect(cells[1]).toContain("background:#1B3A42");
    expect(cells[19]).toContain("color-mix(in srgb, var(--w-crit");
  });

  it("a cell meter row: a triangle under the bar at the warning and critical marks, the cells past the critical mark dimmed, a solid state chip", () => {
    const html = draw({ "meter-style": "cells", "slab-chip": "state" }, <BarRow label="Heat" value={93} warn={70} crit={90} />);
    expect(html.match(/data-part="threshold"/g)).toHaveLength(2);
    expect(html).toContain("left:70%");
    expect(html).toContain("left:90%");
    expect(html).toMatch(/data-part="chip" data-wp-slab="crit"[^>]*>.*Crit<\/span>/);
    // no chip for an ok reading, nor where the Look draws no slabs
    expect(draw({ "meter-style": "cells", "slab-chip": "state" }, <BarRow label="Heat" value={20} warn={70} crit={90} />)).not.toContain("data-wp-slab");
    expect(draw({ "meter-style": "cells" }, <BarRow label="Heat" value={93} warn={70} crit={90} />)).not.toContain('data-part="chip"');
  });

  it("a hex ring: a hexagon measured round its perimeter, the value's share of it drawn", () => {
    expect(hexPath(50)).toMatch(/^M50.00 6.70 L75.00 6.70 L100.00 50.00/);
    expect(hexPath(50, "bottom")).toMatch(/^M50.00 93.30 L25.00 93.30/);
    const html = draw({ "ring-style": "hex" }, <Ring value={40} />);
    expect(html).toContain('data-ring="hex"');
    expect(html).toContain('stroke-dasharray="40 100"');
    expect(draw({ "ring-style": "hex" }, <RingStack rings={[{ v: 50, color: "red" }, { v: 20, color: "blue" }]} />).match(/pathLength="100"/g)).toHaveLength(4);
  });

  it("a signal graph: the dashed grid, the lead square, striped bars with the newest brightest", () => {
    expect(draw({ "graph-grid": "dashed" }, <Spark values={[1, 4, 2, 6]} />)).toContain('data-grid="dashed"');
    expect(draw({ "graph-grid": "none" }, <Spark values={[1, 4, 2, 6]} />)).not.toMatch(/data-grid|stroke-opacity=".22"/);
    expect(draw({ "graph-lead": "square" }, <Spark values={[1, 4, 2, 6]} />)).toContain("data-lead");
    const bars = draw({ "graph-bars": "striped" }, <Spark values={[1, 4, 2, 6]} graph="bars" />);
    expect(bars.match(/<pattern/g)).toHaveLength(2);
    expect(bars.match(/fill="url\(#[^"]*s\)"/g)).toHaveLength(3);
    expect(bars.match(/fill="url\(#[^"]*n\)"/g)).toHaveLength(1);
  });
});

describe("rulers, share bars, hex avatars and the current row's tone", () => {
  it("a ruler level: the reading in its tone up to a square thumb, a ruler of ticks over it", () => {
    const html = draw({ "meter-style": "ruler" }, <Bar value={40} t="warn" />);
    expect(html).toContain('data-meter="ruler"');
    expect(html).toContain('data-part="ticks"');
    expect(html).toMatch(/data-part="thumb"[^>]*left:40%/);
    expect(html).toContain("scaleX(0.4)");
  });

  it("a share bar: without the token, the rounded track with the parts slid along it the widgets drew before", () => {
    const old = renderToString(
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--w-track)]">
        <div className="absolute inset-0 transition-transform duration-700" style={{ transform: "translateX(30%) scaleX(0.2)", transformOrigin: "left", background: "blue" }} />
      </div>,
    );
    const now = renderToString(<ShareBar parts={[{ pct: 30, color: "red" }, { pct: 20, color: "blue" }]} />);
    expect(now).toContain(old.slice(old.indexOf("<div class=\"absolute")));
    expect(now.startsWith(old.slice(0, old.indexOf("<div class=\"absolute")))).toBe(true);
    expect(renderToString(<ShareBar height="h-1.5" bleed parts={[]} />)).toBe('<div class="relative h-1.5 overflow-hidden rounded-full bg-[color:var(--w-track)]" data-qa-bleed="true"></div>');
  });

  it("a gapped share bar: square parts in their shares, the rest of the track dim, never past the whole", () => {
    const html = draw({ "share-style": "gapped", "meter-empty": "#1B3A42" }, <ShareBar parts={[{ pct: 60, color: "red" }, { pct: 70, color: "blue" }]} />);
    expect(html).toContain('data-part="share"');
    expect(html).toContain("flex:60 1 0;background:red");
    expect(html).toContain("flex:40 1 0;background:blue");
    expect(html).not.toContain("background:#1B3A42");
    expect(draw({ "share-style": "gapped" }, <ShareBar parts={[{ pct: 25, color: "red" }]} />)).toContain("flex:75 1 0;background:var(--w-track)");
  });

  it("a hex avatar: the widget's own element and style, clipped to a pointy-top hexagon", () => {
    const html = draw({ "avatar-shape": "hex" }, <Part as="span" kind="avatar" className="h-6 w-6" style={{ color: "red" }}>A</Part>);
    expect(html).toMatch(/<span data-part="avatar" data-avatar="hex" class="h-6 w-6" style="color:red;clip-path:polygon\(50% 0, 100% 25%/);
  });

  it("the current row's slab in the `slab-current` tone, the accent by default", () => {
    expect(t3Tokens({ "slab-row": "current", "slab-current": "warn" }).slab?.current).toBe("warn");
    expect(t3Tokens({ "slab-row": "current", "slab-current": "gold" }).slab?.current).toBe("accent");
    expect(draw({ "slab-row": "current", "slab-current": "warn" }, <Part as="li" kind="row" current>now</Part>)).toContain('data-wp-slab="warn"');
  });
});

/** How often a `Probe` mounted: a widget's content mounts again only when its card does. */
const mounted = { n: 0 };
function Probe() {
  useEffect(() => void mounted.n++, []);
  return null;
}

describe("the frame's outside layer", () => {
  const frame: PackFrame = { corners: "cut", size: 12, which: ["br"], glow: { radius: 10 }, caption: { text: "CS-54 // METER", at: "tl" }, tab: { at: "tl", width: 40, height: 5, out: true }, tone: "state", rule: true };

  it("hosts the card beside a layer the card's own size: the glow its shadow, the caption an attribute, the tab its size", () => {
    const html = draw(undefined, <i />, frame);
    expect(html).toMatch(/^<div data-pack-frame-host="" data-frame-tone="state" class="relative h-full w-full min-w-0"><div aria-hidden="true" data-pack-decor="frame-out" data-caption="CS-54 \/\/ METER" data-caption-at="tl" data-tab-at="tl" class="pointer-events-none absolute inset-0"/);
    expect(html).toContain("box-shadow:0 0 10px color-mix(in srgb, var(--wp-frame-ink, var(--w-accent)) 35%, transparent)");
    expect(html).toContain("--wp-tab-w:40px");
    expect(html).toMatch(/data-part="card"[^>]*data-frame-tone="state" data-frame-rule=""/);
  });

  it("is not there for a frame that draws nothing outside the card", () => {
    expect(draw(undefined, <i />, { corners: "cut", size: 12, tint: 0.06, grid: { size: 22 }, band: { edge: "left", width: 28 } })).not.toContain("data-pack-frame-host");
  });

  it("draws the tint, the grid and the band inside the card, the band no wider than the padding", () => {
    const html = draw(undefined, <i />, { corners: "cut", size: 12, tint: 0.06, grid: { size: 22 }, band: { edge: "left", width: 28 } });
    expect(html).toContain('data-frame-part="tint"');
    expect(html).toContain("background-size:22px 22px");
    expect(html).toMatch(/data-frame-part="band" style="position:absolute;top:0;bottom:0;width:20px;left:0/);
  });

  it("mounts the card anew when the frame starts drawing outside it, so what measures the card watches the one on the page; not on other changes", async () => {
    mounted.n = 0;
    const card = (f?: PackFrame) => createElement(Widget, { size: "lg", title: "T", slots: f ? { decor: { frame: f } } : undefined, packId: f ? "p" : undefined }, createElement(Probe));
    const view = render(card());
    await act(async () => view.rerender(card({ corners: "cut", size: 12 })));
    expect(mounted.n).toBe(1);
    await act(async () => view.rerender(card(frame)));
    expect(mounted.n).toBe(2);
    expect(view.container.querySelector("[data-pack-frame-host] > [data-part='card']")).not.toBeNull();
    await act(async () => view.rerender(card({ ...frame, glow: { radius: 4 } })));
    expect(mounted.n).toBe(2);
  });
});

describe("a slab in the browser", () => {
  it("re-renders a header slab when the card's state changes, without remounting the card", async () => {
    const t3 = { ...CLASSIC_T3, "slab-header": "state" };
    const card = (t: "ok" | "crit") => createElement(Widget, { size: "lg", title: "T", t3 }, <Metric label="A" value={1} t={t} />);
    const view = render(card("ok"));
    const before = view.container.querySelector('[data-part="card"]');
    expect(view.container.querySelector("[data-state]")).toBeNull();
    await act(async () => view.rerender(card("crit")));
    expect(view.container.querySelector('[data-part="card"]')).toBe(before);
    expect(view.container.querySelector('[data-part="num"]')?.getAttribute("data-state")).toBe("crit");
    expect(view.container.querySelector('[data-part="header"]')?.hasAttribute("data-wp-slab-state")).toBe(true);
  });
});
