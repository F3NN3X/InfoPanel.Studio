import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import classic from "@/looks/classic/look.json";
import paper from "@/looks/packs/paper/look.json";
import tape from "@/looks/packs/tape-86/look.json";
import { CardFrame } from "@/widgets/core/card-frame";
import { Bar, HoldMark, Metric, Ring, RingStack, Spark } from "@/widgets/core/primitives";
import { SkinCtx } from "@/widgets/core/theme";
import { gradientStops, safeFill, safeGradient, t3Tokens } from "@/widgets/core/t3-tokens";
import { skinContext } from "@/widgets/core/look";
import { Widget } from "@/widgets/core/Widget";

// A Look's T3 values (as look.json writes them) reaching the drawing code through <Widget t3>, not tokens set by hand.
const CLASSIC_T3 = classic.t3 as Record<string, string | number>;
const draw = (t3: Record<string, string | number>, children: () => ReactNode) =>
  renderToString(createElement(Widget, { size: "lg", title: "T", icon: "memory", t3: { ...CLASSIC_T3, ...t3 }, children }));
const GRAD = "linear-gradient(90deg, #ff4fd8 0%, var(--w-accent) 100%)";

describe("t3Tokens", () => {
  it("maps Classic's own values to nothing: v8 parity", () => {
    expect(t3Tokens(CLASSIC_T3)).toEqual({});
    expect(t3Tokens(undefined)).toEqual({});
  });
  it("maps each differing name to its token", () => {
    expect(
      t3Tokens({ "ring-style": "arc270", "border-fill": GRAD, "num-fill": GRAD, "num-effect": "chromatic", "label-glow": "accent", "series-glow": "soft", "graph-style": "line", "cell-radius": "0", "header-style": "prompt", "header-fill": GRAD, "meter-zone-style": "blend", "meter-hold-style": "dot", "spike-shape": "tick", "fader-knob-shape": "notch", "ring-cap": "butt" }),
    ).toEqual({ ringArc: 270, frame: "gradient", borderFill: GRAD, numFill: GRAD, numChroma: true, labelGlow: true, glow: true, graph: "line", cellSquare: true, header: "prompt", headerFill: GRAD, zones: "blend", hold: "dot", spike: "tick", knob: "notch", cap: "butt" });
    expect(t3Tokens({ "ring-style": "ticks" }).ringMark).toBe("ticks");
    expect(t3Tokens({ "meter-style": "blocks" }).meter).toBe("blocks");
    expect(t3Tokens({ "meter-style": "segments" }).meter).toBe("segments");
    expect(t3Tokens({ "meter-style": "bar; x" }).meter).toBeUndefined();
  });
  it("tab-label is a header, box-legend a header on its own frame (never tui's boxed padding), both off by default", () => {
    expect(t3Tokens({ "header-style": "tab-label" })).toEqual({ header: "tab-label" });
    expect(t3Tokens({ "header-style": "box-legend" })).toEqual({ header: "box-legend", frame: "legend" });
    expect(t3Tokens({ "header-style": "inline" })).toEqual({});
    expect(t3Tokens({ "header-style": "tab-label; x" })).toEqual({});
  });
  it("label-bar, bracket-line and index are headers too, none with a frame of its own (P11)", () => {
    for (const kind of ["label-bar", "bracket-line", "index"]) expect(t3Tokens({ "header-style": kind })).toEqual({ header: kind });
    expect(t3Tokens({ "header-style": "index; x" })).toEqual({});
  });
  it("chromatic is a static number effect, 270 degrees a ring style (P11: Overdrive, Holo)", () => {
    expect(t3Tokens({ "num-effect": "chromatic" })).toEqual({ numChroma: true });
    expect(t3Tokens({ "ring-style": "arc270" })).toEqual({ ringArc: 270 });
  });
});

describe("ring-fill and spark-fill (L90: Black and Gold's gold ring, Night Glow's gradient ring and spark)", () => {
  const FILL = "linear-gradient(135deg, #3EE6FF, #9B5CFF 55%, #FF4FD8)";
  it("read a gradient into a token and nothing else; Classic's \"none\" maps to no token", () => {
    expect(t3Tokens({ "ring-fill": FILL, "spark-fill": FILL })).toEqual({ ringFill: FILL, sparkFill: FILL });
    expect(t3Tokens({ "ring-fill": "none", "spark-fill": "#fff" })).toEqual({});
    expect(t3Tokens({ "ring-fill": "url(https://evil.example/x)" })).toEqual({});
  });
  it("gradientStops: the stops of a gradient with their offsets, the direction dropped, colour functions kept whole", () => {
    expect(gradientStops(FILL)).toEqual([{ colour: "#3EE6FF" }, { colour: "#9B5CFF", offset: 55 }, { colour: "#FF4FD8" }]);
    expect(gradientStops("linear-gradient(rgba(1,2,3,.5) 10%, var(--w-accent))")).toEqual([{ colour: "rgba(1,2,3,.5)", offset: 10 }, { colour: "var(--w-accent)" }]);
    expect(gradientStops("linear-gradient(#fff)")).toBeUndefined();
    expect(gradientStops(undefined)).toBeUndefined();
  });
  it("a ring's value arc takes the gradient, its track and the Classic ring do not", () => {
    const ring = draw({ "ring-fill": FILL }, () => createElement(Ring, { value: 50 }));
    expect(ring).toMatch(/<linearGradient id="(rg\w+)"/);
    const id = /<linearGradient id="(rg\w+)"/.exec(ring)![1];
    expect(ring.split(`stroke="url(#${id})"`)).toHaveLength(2);
    expect(draw({}, () => createElement(Ring, { value: 50 }))).not.toContain("linearGradient");
  });
  it("a graph's line takes the gradient, across the whole width", () => {
    const spark = draw({ "spark-fill": FILL }, () => createElement(Spark, { values: [1, 3, 2, 5, 4], fill: false }));
    expect(spark).toMatch(/gradientUnits="userSpaceOnUse"[^>]*x2="100"[^>]*y2="0"/);
    expect(spark).toMatch(/stroke="url\(#sp\w+k\)"/);
    expect(draw({}, () => createElement(Spark, { values: [1, 3, 2, 5, 4] }))).not.toContain('k)"');
  });
});

describe("free-text T3 values", () => {
  it("keeps a font-stretch keyword or an in-range percentage, nothing that could end the declaration", () => {
    expect(t3Tokens({ "num-stretch": "82%" }).numStretch).toBe("82%");
    expect(t3Tokens({ "num-stretch": "Condensed" }).numStretch).toBe("condensed");
    for (const bad of ["100%;pointer-events:auto", "normal", "10%", "900%", "url(x)", "82%}", 82]) expect(t3Tokens({ "num-stretch": bad }).numStretch, String(bad)).toBeUndefined();
  });
  it("keeps a graph style the drawing code knows and drops the rest", () => {
    for (const ok of ["line", "step", "bars", "dots", "braille"]) expect(t3Tokens({ "graph-style": ok }).graph).toBe(ok);
    for (const bad of ["area", "line;x:y", "evil", 3]) expect(t3Tokens({ "graph-style": bad }).graph, String(bad)).toBeUndefined();
  });
});

describe("safeGradient and safeFill", () => {
  it("accept gradients with colour stops, colours and var(--w-*)", () => {
    expect(safeGradient(GRAD)).toBe(GRAD);
    expect(safeGradient("repeating-conic-gradient(from 90deg at 50% 50%, rgb(0 0 0 / 50%) 0 10deg, hsl(10 50% 50%) 10deg 20deg)")).toBeTruthy();
    expect(safeGradient("linear-gradient(to right, color-mix(in oklab, var(--w-accent) 40%, #000), red)")).toBeTruthy();
    for (const c of ["#fff", "#ff4fd8cc", "red", "rgba(1, 2, 3, .5)", "oklch(60% 0.2 30)", "var(--w-accent)"]) expect(safeFill(c), c).toBe(c);
  });
  it.each([
    ["url(", "linear-gradient(red, url(https://evil/x.png))"],
    ["a gradient over an image", "url(https://evil/x.png)"],
    ["image(", "linear-gradient(image(red), blue)"],
    ["image-set(", "linear-gradient(image-set(\"a.png\" 1x), blue)"],
    ["a semicolon", "linear-gradient(red, blue); pointer-events: auto"],
    ["a closing brace", "linear-gradient(red, blue)}"],
    ["an opening brace", "linear-gradient(red, {blue)"],
    ["a backslash", String.raw`linear-gradient(red, \75rl(x))`],
    ["an at-rule", "linear-gradient(red, @import)"],
    ["a comment", "linear-gradient(red, /* x */ blue)"],
    ["a var outside --w-", "linear-gradient(var(--secret), blue)"],
    ["a function that is not a colour", "linear-gradient(red, attr(x))"],
    ["unbalanced brackets", "linear-gradient(red, blue"],
    ["not a string", 42],
  ])("reject %s", (_, css) => {
    expect(safeGradient(css)).toBeUndefined();
    expect(safeFill(css)).toBeUndefined();
  });
  it("treats none as no fill", () => {
    expect(safeFill("none")).toBeUndefined();
    expect(safeFill("  NONE ")).toBeUndefined();
  });
});

describe("a Look's T3 through Widget", () => {
  it("border-fill draws the gradient border", () => {
    const html = draw({ "border-fill": GRAD }, () => null);
    expect(html).toContain(`${GRAD.replace(/&/g, "&amp;")} border-box`);
    expect(draw({}, () => null)).not.toContain("border-box");
  });
  it("a rejected border-fill draws today's default: no frame", () => {
    const html = draw({ "border-fill": "url(https://evil/x.png)" }, () => null);
    expect(html).not.toContain("evil");
    expect(html).not.toContain("border-box");
  });
  it("a none fill on a gradient frame keeps the border, in the accent", () => {
    const html = renderToString(createElement(CardFrame, { kind: "gradient", fill: "none" }));
    expect(html).toContain("var(--w-accent) border-box");
    expect(html).toContain("1.5px solid transparent");
    expect(renderToString(createElement(CardFrame, { kind: "gradient", fill: "url(https://evil/x.png)" }))).not.toContain("evil");
  });
  it("ring-style arc270 opens the ring and the ring stack", () => {
    expect(draw({ "ring-style": "arc270" }, () => createElement(Ring, { value: 50 }))).toContain("rotate(-135 50 50)");
    const stack = draw({ "ring-style": "arc270" }, () => createElement(RingStack, { rings: [{ v: 50, color: "red" }, { v: 20, color: "blue" }] }));
    expect(stack.match(/rotate\(-135 50 50\)/g)).toHaveLength(2);
    expect(draw({}, () => createElement(RingStack, { rings: [{ v: 50, color: "red" }] }))).not.toContain("rotate(-135");
  });
  it("ring-style segmented cuts a ring stack with the mask", () => {
    expect(draw({ "ring-style": "segmented" }, () => createElement(RingStack, { rings: [{ v: 50, color: "red" }] }))).toContain("repeating-conic-gradient");
  });
  it("label-glow sets the card's shadow, and a Classic Look sets none", () => {
    expect(draw({ "label-glow": "accent" }, () => null)).toContain("text-shadow:0 0 6px");
    expect(draw({}, () => null)).not.toContain("text-shadow");
  });
  it("label-color recolours the labels (the card's faint text) by a text role, so a variant's colours reach them, or by a colour", () => {
    expect(t3Tokens({ "label-color": "{muted}" })).toEqual({ labelColor: "var(--w-muted)" });
    expect(t3Tokens({ "label-color": "{accent}" })).toEqual({ labelColor: "var(--w-accent)" });
    expect(t3Tokens({ "label-color": "#FF5B5B" })).toEqual({ labelColor: "#FF5B5B" });
    // Classic's {faint}, another alias, a gradient, a var and anything that could end the declaration draw the tone's own
    for (const v of ["{faint}", "{border}", GRAD, "var(--w-accent)", "red;background:url(x)"]) expect(t3Tokens({ "label-color": v }), v).toEqual({});
    expect(draw({ "label-color": "{muted}" }, () => null)).toContain("--w-faint:var(--w-muted)");
    expect(draw({}, () => null)).toContain("--w-faint:#8a8a94");
  });
});

describe("gradient digits", () => {
  const metric = (t3: Record<string, string | number>, t: "ok" | "crit") => draw(t3, () => createElement(Metric, { label: "CPU", value: 42, t }));
  const num = (html: string) => html.match(/<span data-part="num"[^>]*>/)?.[0] ?? "";
  it("turn off the card's inherited glow, which would show through the transparent text", () => {
    const html = metric({ "num-fill": GRAD, "label-glow": "accent" }, "ok");
    expect(html).toContain("text-shadow:0 0 6px");
    expect(num(html)).toContain("color:transparent");
    expect(num(html)).toContain("text-shadow:none");
  });
  it("lose to a warn or crit tone: the status colour stays visible", () => {
    const n = num(metric({ "num-fill": GRAD }, "crit"));
    expect(n).toContain("color:var(--w-crit");
    expect(n).not.toContain("color:transparent");
  });
  it("a rejected num-fill leaves a solid number", () => {
    expect(num(metric({ "num-fill": "url(https://evil/x.png)" }, "ok"))).not.toContain("background");
  });
});

describe("skinContext with a Look's T3", () => {
  it("overrides the skin's own token, and leaves the skin alone without one", () => {
    expect(skinContext("hud", { t3: { "ring-cap": "round" } }).cap).toBe("butt");
    expect(skinContext("default", { t3: { "graph-style": "line" } }).graph).toBe("line");
    expect(skinContext("synth", { t3: CLASSIC_T3 }).graph).toBe("line");
  });
});

describe("the numeral accent tint", () => {
  const num = (t3: Record<string, string | number>) => draw(t3, () => createElement(Metric, { label: "L", value: 5 }));
  it("is not applied for a chromatic fringe alone, which keeps the text colour (Overdrive's cyan numerals)", () => {
    expect(num({ "num-effect": "chromatic" })).not.toContain("color-mix(in oklab, var(--w-accent) 55%");
    expect(num({ "num-effect": "chromatic" })).toContain("rgba(255,40,90,.7)");
  });
});

describe("L23: the five contract tokens have a reader, and Classic's values change nothing", () => {
  it("maps a Look's own value to a token, and Classic's own to nothing", () => {
    expect(t3Tokens({ "series-stroke": 2.5, "series-fill-alpha": "0.5 > 0.2 > 0.1", "motion-fast": "90ms", "motion-base": "0.6s", "ease-standard": "cubic-bezier(.4, 0, .2, 1)" })).toEqual({
      strokeFixed: 2.5, fillAlpha: [0.5, 0.2, 0.1], motionFast: "90ms", motionBase: "0.6s", ease: "cubic-bezier(.4, 0, .2, 1)",
    });
    expect(t3Tokens({ "series-stroke": 1, "series-fill-alpha": "0.32 > 0.06 > 0", "motion-fast": "150ms", "motion-base": "300ms", "ease-standard": "cubic-bezier(.2,0,0,1)" })).toEqual({});
  });
  it("refuses a stroke out of range, an alpha above 1, a time or a curve that is not one", () => {
    expect(t3Tokens({ "motion-fast": "fast", "motion-base": "1;x", "series-stroke": 20, "series-fill-alpha": "2 > 1 > 0", "ease-standard": "url(x)" })).toEqual({});
  });
  it("reads a blank segment of the fill alpha as no alpha, not as 0", () => {
    expect(t3Tokens({ "series-fill-alpha": "0.5 > > 0.1" })).toEqual({});
    expect(t3Tokens({ "series-fill-alpha": "0.5 > 0.2 >" })).toEqual({});
  });
  it("a graph's fill gradient and its stroke follow the Look; Classic's markup is unchanged", () => {
    const classic = draw({}, () => createElement(Spark, { values: [1, 3, 2, 5, 4] }));
    expect(classic).toContain('stop-opacity=".32"');
    const set = draw({ "series-fill-alpha": "0.6 > 0.3 > 0.1", "series-stroke": 3 }, () => createElement(Spark, { values: [1, 3, 2, 5, 4] }));
    expect(set).toContain('stop-opacity="0.6"');
    expect(set).toContain('stop-opacity="0.1"');
    expect(set).toContain('stroke-width="3"');
    expect(classic).not.toContain('stroke-width="3"');
  });
  it("the hold mark's transition takes motion-fast and ease-standard, and keeps its class for Classic", () => {
    const hold = (t3: Record<string, string | number>) => draw(t3, () => createElement(HoldMark, { at: 50 }));
    expect(hold({})).not.toContain("transition-duration");
    expect(hold({ "motion-fast": "90ms", "ease-standard": "linear" })).toMatch(/transition-duration:90ms;transition-timing-function:linear/);
  });
});

describe("L90: bar-fill and focus-outline", () => {
  const STRIPES = "linear-gradient(90deg, #B83A08 0 25%, #C8273A 25% 50%)";
  it("bar-fill reads a gradient only; focus-outline a colour only", () => {
    expect(t3Tokens({ "bar-fill": STRIPES, "focus-outline": "#5B3FD4" })).toEqual({ barFill: STRIPES, focusOutline: "#5B3FD4" });
    expect(t3Tokens({ "bar-fill": "#fff", "focus-outline": STRIPES })).toEqual({});
    expect(t3Tokens({ "bar-fill": "none", "focus-outline": "none" })).toEqual({});
    expect(t3Tokens({ "bar-fill": "url(https://evil.example/x)", "focus-outline": "url(x)" })).toEqual({});
  });
  it("Paper sets the outline and Tape '86 the stripes, and the shipped values reach the tokens", () => {
    expect(t3Tokens(paper.t3)).toMatchObject({ focusOutline: "#5B3FD4" });
    expect(t3Tokens(tape.t3).barFill).toMatch(/^linear-gradient\(90deg, #B83A08 0 25%/);
  });
  it("a bar's ok fill takes the gradient, its warn and crit fills do not, and Classic's bar is unchanged", () => {
    const bar = (t: "ok" | "warn", t3: Record<string, string | number> = {}) => draw(t3, () => createElement(Bar, { value: 50, t, style: "square" }));
    expect(bar("ok", { "bar-fill": STRIPES })).toContain(`background:${STRIPES}`);
    expect(bar("warn", { "bar-fill": STRIPES })).toContain("background:var(--w-warn, #EDB232)");
    expect(bar("warn", { "bar-fill": STRIPES })).not.toContain(`background:${STRIPES}`);
    expect(bar("ok")).not.toContain(`background:${STRIPES}`);
    expect(bar("ok")).toContain("scaleX(0.5);transform-origin:left;background:var(--w-accent)");
  });
  it("the card carries the outline colour and its marker for the app's focus rule, and Classic neither", () => {
    const card = (t3: Record<string, string | number>) => draw(t3, () => createElement("span"));
    expect(card({ "focus-outline": "#5B3FD4" })).toMatch(/--w-focus-outline:#5B3FD4[^>]*data-focus-outline=""/);
    expect(card({})).not.toContain("focus-outline");
  });
});

describe("L58: a pack that sets its own ok has the ok tone draw it", () => {
  const bar = (sk: Record<string, unknown>) =>
    renderToString(createElement(SkinCtx.Provider, { value: { ...skinContext("default"), ...sk } }, createElement(Bar, { value: 50, t: "ok", style: "square" }), createElement(Bar, { value: 50, t: "warn", style: "square" })));
  it("ok follows the Look's ok on a pack card; warn does not change; the accent stays everywhere else", () => {
    const pack = bar({ packOk: true });
    expect(pack).toContain("background:var(--w-ok)");
    expect(pack.match(/var\(--w-ok\)/g)).toHaveLength(1);
    expect(bar({})).not.toContain("--w-ok");
    expect(bar({})).toContain("background:var(--w-accent)");
  });
});
