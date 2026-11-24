// Animated SVG in a pack (src/looks/motion-svg.ts, svgIssue in pack-safety.ts): the subset passes (CSS keyframes on transform, opacity and
// stroke-dashoffset, SMIL animate and animateTransform on the same), everything else that moves or reaches out is refused, the still copy has no
// animation left, and the validator lets an animated SVG move only as a stage layer that declares it (never from pack.css).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clockMs, SVG_ANIMATED_MAX, SVG_STEPS_MAX } from "@/looks/motion-svg";
import { stageIssues } from "@/looks/pack-checks";
import { svgAnimated, svgIssue, svgStill } from "@/looks/pack-safety";
import { type PackFile, type PackSource, validatePack } from "@/looks/pack-validate";
import { readPackDir } from "../../tools/validate-pack.mjs";

const SPIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .a { animation: spin 4s linear infinite; transform-origin: center; transform-box: fill-box; }</style><rect class="a" width="4" height="4" fill="#fff"/></svg>';
const PULSE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="3" fill="#0ff"><animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite"/></circle><path d="M0 0L10 10" stroke="#0ff" stroke-dasharray="4 4"><animate attributeName="stroke-dashoffset" from="0" to="8" dur="2s" repeatCount="indefinite"></animate></path><g><animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5" dur="6s" repeatCount="indefinite"/></g></svg>';

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;
const sheet = (css: string, body = '<rect class="a" width="1" height="1"/>') => svg(`<style>${css}</style>${body}`);

describe("the animation a pack SVG may carry", () => {
  it("CSS keyframes and SMIL inside the subset pass, and count as animated", () => {
    expect(svgIssue(SPIN)).toBeUndefined();
    expect(svgIssue(PULSE)).toBeUndefined();
    expect(svgAnimated(SPIN) && svgAnimated(PULSE)).toBe(true);
    expect(svgAnimated(svg('<rect width="1" height="1"/>'))).toBe(false);
    expect(svgIssue(sheet("@keyframes d { 0%, 100% { stroke-dashoffset: 0; } 50% { stroke-dashoffset: 12px; opacity: .5; animation-timing-function: steps(4, end); } } #b { animation-name: d; animation-duration: 1.2s; animation-iteration-count: infinite; }", '<path id="b" d="M0 0"/>'))).toBeUndefined();
  });

  it.each([
    ["a keyframe that sets a paint", "@keyframes x { to { fill: #f00; } } .a { animation: x 2s infinite; }"],
    ["a keyframe that moves layout", "@keyframes x { to { width: 9px; } } .a { animation: x 2s infinite; }"],
    ["a cycle under a second", "@keyframes x { to { opacity: 0; } } .a { animation: x 300ms infinite alternate; }"],
    ["a rule that paints", ".a { fill: red; }"],
    ["a selector that reaches past one class", "rect .a { animation: x 2s; } @keyframes x { to { opacity: 0; } }"],
    ["an element selector", "rect { animation: x 2s; } @keyframes x { to { opacity: 0; } }"],
    ["an at-rule", "@import x; .a { animation: x 2s; }"],
    ["a font face", "@font-face { src: x; }"],
    ["a url", "@keyframes x { to { transform: url(#a); } } .a { animation: x 2s; }"],
    ["a comment", "/* x */ .a { animation: x 2s; }"],
    ["an escape", ".a { anim\\61tion: x 2s; }"],
    ["a quote", "@keyframes x { to { opacity: 0; } } .a { animation: 'x' 2s; }"],
    ["an animation of no keyframes in the file", ".a { animation: elsewhere 2s infinite; }"],
    ["a list of animations", "@keyframes x { to { opacity: 0; } } @keyframes y { to { opacity: 1; } } .a { animation: x 2s, y 3s; }"],
    ["too many steps", `@keyframes x { ${Array.from({ length: SVG_STEPS_MAX + 1 }, (_, i) => `${i * 10}% { opacity: ${i % 2}; }`).join(" ")} } .a { animation: x 2s infinite; }`],
    ["!important", "@keyframes x { to { opacity: 0 !important; } } .a { animation: x 2s; }"],
  ])("refuses %s in a <style>", (_, css) => {
    expect(svgIssue(sheet(css))).toBeDefined();
  });

  it.each([
    ["a <set>", '<set attributeName="opacity" to="0" dur="2s"/>'],
    ["an animation of a link", '<a><animate attributeName="href" values="#a;#b" dur="2s"/></a>'],
    ["an animation of a paint", '<animate attributeName="fill" values="#000;#fff" dur="2s"/>'],
    ["an animation of a position", '<animate attributeName="x" from="0" to="9" dur="2s"/>'],
    ["a transform of no type", '<animateTransform attributeName="transform" from="0" to="9" dur="2s"/>'],
    ["an href on an animation", '<animate href="#a" attributeName="opacity" values="1;0" dur="2s"/>'],
    ["a begin on an event", '<animate attributeName="opacity" values="1;0" dur="2s" begin="click"/>'],
    ["a cycle under a second", '<animate attributeName="opacity" values="1;0;1" dur="0.2s" repeatCount="indefinite"/>'],
    ["no dur", '<animate attributeName="opacity" values="1;0"/>'],
    ["a word in the values", '<animate attributeName="opacity" values="url(#a)" dur="2s"/>'],
    ["too many values", `<animate attributeName="opacity" values="${Array.from({ length: SVG_STEPS_MAX + 1 }, (_, i) => i % 2).join(";")}" dur="2s"/>`],
    ["markup inside an animation", '<animate attributeName="opacity" values="1;0" dur="2s"><desc>x</desc></animate>'],
    ["a <text>", "<text>HELLO</text>"],
    ["a script, still", "<script>alert(1)</script>"],
    ["markup in a <style>", "<style><rect/></style>"],
    ["CDATA in a <style>", "<style><![CDATA[.a{}]]></style>"],
    ["a <style> of another type", '<style type="text/x">.a { animation-name: none; }</style>'],
  ])("refuses %s", (_, inner) => {
    expect(svgIssue(svg(inner))).toBeDefined();
  });

  it("caps the animated elements of one file", () => {
    const many = (n: number) => svg(Array.from({ length: n }, () => '<rect width="1" height="1"><animate attributeName="opacity" values="1;0.5;1" dur="2s"/></rect>').join(""));
    expect(svgIssue(many(SVG_ANIMATED_MAX))).toBeUndefined();
    expect(svgIssue(many(SVG_ANIMATED_MAX + 1))).toMatch(/animated elements/);
    // a rule counts every element it reaches
    const css = "@keyframes x { to { opacity: 0.5; } } .a { animation: x 2s infinite; }";
    expect(svgIssue(sheet(css, '<rect class="a"/>'.repeat(SVG_ANIMATED_MAX + 1)))).toMatch(/animated elements/);
  });

  it("the walkthrough's animated SVG passes, and animates", () => {
    const doc = readFileSync("docs/building-an-advanced-theme-pack.md", "utf8");
    const art = /^```\r?\n(<svg[\s\S]*?<\/svg>)\r?\n```$/m.exec(doc)?.[1];
    expect(art).toBeDefined();
    expect(svgIssue(art!)).toBeUndefined();
    expect(svgAnimated(art!)).toBe(true);
  });

  it("reads SMIL clock values", () => {
    expect([clockMs("2s"), clockMs("1500ms"), clockMs("3"), clockMs("1min"), clockMs("click"), clockMs("")]).toEqual([2000, 1500, 3000, 60_000, undefined, undefined]);
  });

  it("the still copy is the file without its animation, and passes as a still SVG", () => {
    for (const src of [SPIN, PULSE]) {
      const still = svgStill(src);
      expect(svgAnimated(still)).toBe(false);
      expect(svgIssue(still)).toBeUndefined();
    }
    expect(svgStill(PULSE)).toContain('<circle r="3" fill="#0ff"></circle>');
    const plain = svg('<rect width="1" height="1"/>');
    expect(svgStill(plain)).toBe(plain);
  });
});

const BASE = readPackDir("src/looks/packs/field-kit", /\.tsx?$/) as PackSource;
const enc = (s: string) => new TextEncoder().encode(s);
const file = (path: string, content: string): PackFile => ({ path, size: enc(content).length, bytes: enc(content) });
// biome-ignore lint/suspicious/noExplicitAny: the fixtures edit parsed JSON of any shape.
const pack = BASE.pack as any;
/** Field Kit with an animated `orbit.svg` and its stage layers set to `layers`. */
const withOrbit = (layers: unknown[], css = BASE.css, content = SPIN): PackSource => ({ ...BASE, css, pack: { ...pack, stage: { ...pack.stage, layers } }, files: [...BASE.files, file("assets/orbit.svg", content)] });
const issues = (src: PackSource, source: "builtin" | "user" = "builtin") => validatePack(src, { source }).filter((i) => i.rule === "svg-animation" || i.rule === "svg-unsafe" || i.rule === "stage");

describe("an animated SVG in the validator", () => {
  it("passes as a stage layer declared animated, as a built-in and as a user pack", () => {
    const src = withOrbit([...pack.stage.layers, { image: "orbit.svg", animated: true }]);
    expect(issues(src)).toEqual([]);
    expect(issues(src, "user").filter((i) => i.severity === "error")).toEqual([]);
  });

  it("refuses one on a layer that does not say it animates (it would move at Calm and Off)", () => {
    expect(issues(withOrbit([{ image: "orbit.svg" }])).map((i) => `${i.rule} ${i.severity}`)).toEqual(["svg-animation error"]);
  });

  it("refuses one pack.css uses: only the stage can hold it still", () => {
    const src = withOrbit([{ image: "orbit.svg", animated: true }], `${BASE.css}\n[data-part="card"] { mask-image: url(orbit.svg); }`);
    expect(issues(src).filter((i) => i.file === "pack.css").map((i) => i.rule)).toEqual(["svg-animation"]);
  });

  it("warns on a layer declared animated whose SVG is still, and refuses animated on a layer that is not an SVG", () => {
    const still = withOrbit([{ image: "orbit.svg", animated: true }], BASE.css, svg('<rect width="1" height="1"/>'));
    expect(issues(still).map((i) => `${i.rule} ${i.severity}`)).toEqual(["svg-animation warn"]);
    expect(issues(withOrbit([{ fill: "#000", animated: true }])).map((i) => i.rule)).toContain("stage");
  });

  it("names an animation outside the subset svg-animation, and script svg-unsafe as before", () => {
    expect(issues(withOrbit([{ image: "orbit.svg", animated: true }], BASE.css, sheet("@keyframes x { to { fill: red; } } .a { animation: x 2s; }"))).map((i) => i.rule)).toContain("svg-animation");
    expect(issues(withOrbit([{ image: "orbit.svg", animated: true }], BASE.css, svg("<style>.a { animation-name: none; }</style><script>1</script>"))).map((i) => i.rule)).toContain("svg-unsafe");
  });

  it("allows one animated layer: a second repaints the page again each frame", () => {
    expect(issues(withOrbit([{ image: "orbit.svg", animated: true }, { image: "orbit.svg", animated: true }])).map((i) => `${i.rule} ${i.severity}`)).toEqual(["svg-animation error"]);
  });

  it("an old pack, with no animated layer, has nothing new to say", () => {
    expect(issues(BASE)).toEqual([]);
  });
});

describe("an animated layer at load (`stageIssues`)", () => {
  const layer = (image: string) => stageIssues({ layers: [{ image, animated: true }] } as Parameters<typeof stageIssues>[0]);
  it("is an SVG by its file's name, a built-in's served URL with its query too; any other image is refused", () => {
    expect(layer("radar.svg")).toEqual([]);
    expect(layer("radar.svg?no-inline")).toEqual([]);
    expect(layer("art.png?x.svg")).toEqual(["stage layer 0 animated: only an SVG image layer animates"]);
    expect(layer("art.png")).toEqual(["stage layer 0 animated: only an SVG image layer animates"]);
  });
});
