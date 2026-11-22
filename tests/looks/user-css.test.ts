// The user-CSS grammar (L94): what it accepts is listed, so every case here is an attempt to get something else past it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Declaration, parseCss, writeRules } from "@/looks/css-syntax";
import { lintPackCss, scopePackCss } from "@/looks/pack-css";
import { userCssIssues } from "@/looks/user-css";

const PART = '[data-part="num"]';
const passes = (css: string) => expect(userCssIssues(css), css).toEqual([]);
const refused = (css: string) => expect(userCssIssues(css).length, css).toBeGreaterThan(0);

describe("what the grammar accepts", () => {
  it.each([
    `${PART} { color: #fff; }`,
    `${PART} { color: #ffffffcc; }`,
    `${PART} { color: rgb(255, 0, 0); }`,
    `${PART} { color: rgb(255 0 0 / 80%); }`,
    `${PART} { color: rgba(255, 0, 0, 0.75); opacity: 0.8; }`,
    `${PART}, [data-part="label"] { color: #000; text-shadow: 0 1px 2px #0003; }`,
    `[data-part="header"] [data-part="label"] { color: #000; }`,
    `[data-part="header"] > [data-part="label"] { color: #000; }`,
    `[data-part="header"]>[data-part="label"] { color: #000; }`,
    `[data-part="chip"] { background: #123; border-color: rgb(1, 2, 3); box-shadow: inset 0 1px 0 #fff; }`,
    `[data-part="ring"] { stroke: #fff; stroke-width: 2; fill: #000; }`,
    `/* a comment */ ${PART} { /* inside */ color: /* here */ #fff; }`,
    `${PART} { --pack-a: #fff; color: var(--pack-a); }`,
    `${PART} { --pack-a: var(--pack-b); --pack-b: rgb(0, 0, 0); color: var(--pack-a); }`,
    `[data-part="label"] { color: var(--pack-a); } ${PART} { --pack-a: #fff; }`,
    `${PART} { color: color-mix(in srgb, #fff, #000); }`,
  ])("%s", (css) => {
    passes(css);
    // and the loader, which reads the same file, mounts what it accepted
    expect(lintPackCss(css)).toEqual([]);
    expect(scopePackCss("mine", css)).toContain('@scope ([data-look="mine"])');
  });
});

describe("selectors: the slot allow-list and nothing else", () => {
  it.each([
    ["everything", `* { color: #fff; }`],
    ["a type", `div { color: #fff; }`],
    ["a class", `.card { color: #fff; }`],
    ["an id", `#card { color: #fff; }`],
    ["the page", `html { color: #fff; }`],
    ["the root", `:root { color: #fff; }`],
    ["the pack's own element, its overlay among them", `:scope { background: #000; }`],
    ["a part that is not a slot", `[data-part="nope"] { color: #fff; }`],
    ["another attribute", `[data-mat="x"] { color: #fff; }`],
    ["an attribute with no value", `[data-part] { color: #fff; }`],
    ["an unquoted value", `[data-part=num] { color: #fff; }`],
    ["a substring operator", `[data-part*="num"] { color: #fff; }`],
    ["a prefix operator", `[data-part^="n"] { color: #fff; }`],
    ["a case flag", `[data-part="num" i] { color: #fff; }`],
    ["an uppercase attribute", `[DATA-PART="num"] { color: #fff; }`],
    [":has", `${PART}:has(*) { color: #fff; }`],
    [":has as a whole", `:has([data-part="num"]) { color: #fff; }`],
    [":not", `:not([data-part="num"]) { color: #fff; }`],
    [":is", `:is([data-part="num"], *) { color: #fff; }`],
    [":where", `:where(*) { color: #fff; }`],
    ["a state", `${PART}:hover { color: #fff; }`],
    ["a pseudo-element other than ::before and ::after", `${PART}::marker { color: #000; }`],
    ["the old pseudo-element spelling", `${PART}:after { background: #000; }`],
    ["a sibling combinator", `${PART} + [data-part="label"] { color: #fff; }`],
    ["a general sibling combinator", `${PART} ~ [data-part="label"] { color: #fff; }`],
    ["a column combinator", `${PART} || [data-part="label"] { color: #fff; }`],
    ["a compound of two", `${PART}[data-part="label"] { color: #fff; }`],
    ["a dangling combinator", `${PART} > { color: #fff; }`],
    ["nothing", `{ color: #fff; }`],
    ["a list hiding a bad selector at the end", `${PART}, * { color: #fff; }`],
    ["a list hiding a bad selector at the start", `html, ${PART} { color: #fff; }`],
    ["a list hiding a bad selector in the middle", `${PART}, :has(a), [data-part="label"] { color: #fff; }`],
    ["a list with an empty place", `${PART}, { color: #fff; }`],
    ["an escaped attribute", String.raw`[data\2d part="num"] { color: #fff; }`],
    ["an escaped everything", String.raw`\2a { color: #fff; }`],
  ])("%s", (_name, css) => refused(css));
});

describe("colours: hex, rgb() or a var(--pack-*) that resolves here", () => {
  it.each([
    ["a name", `${PART} { color: red; }`],
    ["transparent", `${PART} { color: transparent; }`],
    ["currentcolor", `${PART} { color: currentcolor; }`],
    ["inherit", `${PART} { color: inherit; }`],
    ["hsl", `${PART} { color: hsl(0 0% 100%); }`],
    ["oklch", `${PART} { color: oklch(1 0 0); }`],
    ["color()", `${PART} { color: color(srgb 1 1 1); }`],
    ["color-mix in a space it does not read", `${PART} { color: color-mix(in hwb, #fff, #000); }`],
    ["color-mix over a var", `${PART} { --pack-a: #fff; color: color-mix(in srgb, var(--pack-a) 1%, transparent); }`],
    ["light-dark", `${PART} { color: light-dark(#fff, #000); }`],
    ["five hex digits", `${PART} { color: #12345; }`],
    ["seven hex digits", `${PART} { color: #1234567; }`],
    ["letters past f", `${PART} { color: #ggg; }`],
    ["rgb of a var", `${PART} { --pack-a: #fff; color: rgb(var(--pack-a)); }`],
    ["rgb from a colour", `${PART} { color: rgb(from #fff r g b); }`],
    ["rgb of calc", `${PART} { color: rgb(calc(1 + 1), 0, 0); }`],
    ["rgb with a length in it", `${PART} { color: rgb(1px, 2, 3, 0.5); }`],
    ["rgb out of range", `${PART} { color: rgb(300, 0, 0); }`],
    ["rgb of too few", `${PART} { color: rgb(1, 2); }`],
    ["rgb of too many", `${PART} { color: rgb(1, 2, 3, 0.5, 1); }`],
    ["a transparent hex", `${PART} { color: #fff0; }`],
    ["a transparent rgb", `${PART} { fill: rgb(0 0 0 / 0); }`],
    ["two colours", `${PART} { color: #fff #000; }`],
    ["important", `${PART} { color: #fff !important; }`],
  ])("%s", (_name, css) => refused(css));

  it.each([
    ["a var of the app", `${PART} { color: var(--w-track); }`],
    ["an undefined var", `${PART} { color: var(--pack-none); }`],
    ["a var with a fallback", `${PART} { --pack-a: #fff; color: var(--pack-a, transparent); }`],
    ["a var with an empty fallback", `${PART} { --pack-a: #fff; color: var(--pack-a,); }`],
    ["a var in a var", `${PART} { --pack-a: #fff; color: var(var(--pack-a)); }`],
    ["a var of the chrome's own", `${PART} { --pack-chrome-fill: #fff; color: var(--pack-chrome-fill); }`],
    ["setting the chrome's own", `${PART} { --pack-chrome-ink: #000; }`],
    ["another custom name", `${PART} { --wp-pad: #fff; }`],
    ["a custom property that is not a colour", `${PART} { --pack-a: 1px; }`],
    ["a custom property holding a function", `${PART} { --pack-a: url(x.png); }`],
    ["a custom property with no value", `${PART} { --pack-a: ; color: var(--pack-a); }`],
    ["a loop of one", `${PART} { --pack-a: var(--pack-a); color: var(--pack-a); }`],
    ["a loop of two", `${PART} { --pack-a: var(--pack-b); --pack-b: var(--pack-a); color: var(--pack-a); }`],
    ["a loop never used", `${PART} { --pack-a: var(--pack-b); --pack-b: var(--pack-a); }`],
    ["a chain ending nowhere", `${PART} { --pack-a: var(--pack-b); color: var(--pack-a); }`],
    ["a var that resolves to transparent ink", `${PART} { --pack-a: #0000; color: var(--pack-a); }`],
    ["a var defined twice, once transparent", `${PART} { --pack-a: #fff; } [data-part="label"] { --pack-a: #0000; } [data-part="unit"] { color: var(--pack-a); }`],
    ["a var in a length", `${PART} { --pack-a: #fff; opacity: var(--pack-a); }`],
    ["var() case tricks with an unknown name", `${PART} { --pack-a: #fff; color: VAR(--PACK-A); }`],
  ])("%s", (_name, css) => refused(css));
});

describe("properties and values: a short list, each its own shape", () => {
  it.each([
    ["layout", `${PART} { width: 1px; }`],
    ["display", `${PART} { display: none; }`],
    ["visibility", `${PART} { visibility: hidden; }`],
    ["a filter", `${PART} { filter: opacity(0); }`],
    ["a blend", `${PART} { mix-blend-mode: multiply; }`],
    ["a text fill", `${PART} { -webkit-text-fill-color: #fff; }`],
    ["a clip", `${PART} { -webkit-background-clip: text; }`],
    ["an animation", `${PART} { animation: spin 1s; }`],
    ["a transition of everything", `${PART} { transition: all 1s; }`],
    ["a font", `${PART} { font-family: Arial; }`],
    ["a background image", `${PART} { background-image: none; }`],
    ["a gradient", `${PART} { background: linear-gradient(#000, #fff); }`],
    ["opacity under the floor", `${PART} { opacity: 0.49; }`],
    ["opacity as a percentage", `${PART} { opacity: 90%; }`],
    ["opacity over one", `${PART} { opacity: 2; }`],
    ["a thin stroke", `${PART} { stroke-width: 0.1; }`],
    ["a wide stroke", `${PART} { stroke-width: 9; }`],
    ["a background on a mark", `[data-part="bar"] { background: #000; }`],
    ["a border on a mark", `[data-part="ring"] { border-color: #000; }`],
    ["a shadow on a mark", `[data-part="range"] { box-shadow: 0 0 2px #000; }`],
    ["a mark hiding in a list", `[data-part="header"], [data-part="meter"] { background: #000; }`],
    ["a shadow spread", `[data-part="chip"] { box-shadow: 0 0 0 16px #000; }`],
    ["a long shadow offset", `[data-part="chip"] { box-shadow: 5px 0 #000; }`],
    ["a wide shadow blur", `[data-part="chip"] { box-shadow: 0 0 13px #000; }`],
    ["a shadow list", `${PART} { text-shadow: 0 0 1px #000, 0 0 1px #000; }`],
    ["an inset text shadow", `${PART} { text-shadow: inset 0 0 1px #000; }`],
    ["a shadow in em", `${PART} { text-shadow: 1em 0 #000; }`],
    ["a shadow with no colour", `${PART} { text-shadow: 0 1px; }`],
  ])("%s", (_name, css) => refused(css));

  it("a property name on Object's prototype is no property", () => {
    refused(`${PART} { constructor: #fff; }`);
    refused(`${PART} { toString: 1; }`);
  });
});

describe("at-rules, urls and syntax: refused, each spelling", () => {
  it.each([
    ["@keyframes not named pack-*", `@keyframes x { from { color: #fff; } } ${PART} { animation: x 2s; }`],
    ["@keyframes with a prefix", `@-webkit-keyframes pack-x { from { color: #fff; } }`],
    ["@import", `@import "x.css";`],
    ["@import with a url", `@import url(x.css);`],
    ["@layer as a block", `@layer a { ${PART} { color: #fff; } }`],
    ["@layer as a statement", `@layer a; ${PART} { color: #fff; }`],
    ["@media", `@media screen { ${PART} { color: #fff; } }`],
    ["@supports", `@supports (color: red) { ${PART} { color: #fff; } }`],
    ["@font-face", `@font-face { font-family: pack-x; src: url(a.woff2); }`],
    ["@container", `@container (width > 1px) { ${PART} { color: #fff; } }`],
    ["@scope", `@scope (html) { * { color: #fff; } }`],
    ["@property", `@property --pack-a { syntax: "*"; inherits: true; }`],
    ["@charset", `@charset "utf-8"; ${PART} { color: #fff; }`],
    ["a url", `${PART} { background: url(assets/a.png); }`],
    ["a quoted url", `${PART} { background: url("assets/a.png"); }`],
    ["a remote url", `${PART} { background: url(https://x.test/a.png); }`],
    ["image-set", `[data-part="chip"] { background: image-set("a.png" 1x); }`],
    ["an escaped url", String.raw`${PART} { background: \75 rl(x.png); }`],
    ["a nested rule", `${PART} { [data-part="label"] { color: #fff; } }`],
    ["a nesting selector", `${PART} { & { color: #fff; } }`],
    ["an escaped property", String.raw`${PART} { dis\70lay: none; }`],
    ["an escaped value", String.raw`${PART} { color: \23 fff; }`],
    ["a comment splitting a property", `${PART} { col/**/or: #fff; }`],
    ["a comment splitting a colour", `${PART} { color: #ff/**/ff; }`],
    ["a comment that never closes", `${PART} { color: #fff; } /* `],
    ["an html comment", `<!-- ${PART} { color: #fff; } -->`],
    ["an unterminated block", `${PART} { color: #fff;`],
    ["a stray closer", `${PART} { color: #fff; } }`],
    ["a stylesheet of nothing", ""],
    ["a stylesheet of comments", "/* nothing */"],
    ["a rule with no declaration", `${PART} { }`],
    ["a byte-order mark", `﻿${PART} { color: #fff; }`],
    ["a NUL", `${PART} { color: #fff\0; }`],
  ])("%s", (_name, css) => refused(css));
});

describe("a crafted file cannot make the reader slow", () => {
  const chain = (steps: number) => {
    const both = (i: number) => `--pack-a${i}: var(--pack-a${i + 1}); --pack-a${i}: var(--pack-a${i + 1});`;
    return `${PART} { ${Array.from({ length: steps }, (_, i) => both(i)).join(" ")} --pack-a${steps}: #fff; color: var(--pack-a0); }`;
  };

  it("walks a chain of doubled definitions once", () => {
    const start = performance.now();
    passes(chain(40));
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("refuses a long chain ending in an undefined var, fast", () => {
    const css = `${PART} { ${Array.from({ length: 1900 }, (_, i) => `--pack-a${i}: var(--pack-a${i + 1});`).join(" ")} color: var(--pack-a0); }`;
    const start = performance.now();
    expect(userCssIssues(css).join()).toContain("is not defined in this file");
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("refuses doubled definitions ending in an undefined var, fast", () => {
    const both = (i: number) => `--pack-a${i}: var(--pack-a${i + 1}); --pack-a${i}: var(--pack-a${i + 1});`;
    const css = `${PART} { ${Array.from({ length: 40 }, (_, i) => both(i)).join(" ")} color: var(--pack-a0); }`;
    const start = performance.now();
    expect(userCssIssues(css).join()).toContain("is not defined in this file");
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("refuses more definitions of one property than the cap", () => {
    const many = Array.from({ length: 9 }, () => "--pack-a: #fff;").join(" ");
    expect(userCssIssues(`${PART} { ${many} color: var(--pack-a); }`).join()).toContain("defined 9 times");
  });

  it("refuses more declarations than the cap", () => {
    const many = Array.from({ length: 2001 }, () => "color: #fff;").join(" ");
    expect(userCssIssues(`${PART} { ${many} }`).join()).toContain("2001 declarations");
  });

  it("counts a keyframe's declarations toward the cap", () => {
    const many = Array.from({ length: 2001 }, () => "opacity: 1;").join(" ");
    expect(userCssIssues(`@keyframes pack-a { to { ${many} } } ${PART} { animation: pack-a 2s; }`).join()).toContain("2002 declarations");
  });
});

// Phase 2 (gate 0 §6 and its decisions): each row of the values table, passing and refused in the grammar.
const CARD = '[data-part="card"]';
const PSEUDO = '[data-part="num"]::before';

describe("the Phase 2 values in the grammar", () => {
  it.each([
    ["clip-path", [`${CARD} { clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%); }`, `[data-part="label"]::after { clip-path: inset(2px round 4px); }`], [`${PART} { clip-path: inset(2px); }`, `${CARD} { clip-path: circle(50%); }`, `${CARD} { clip-path: path("M0 0"); }`]],
    ["mask-image", [`${PART} { mask-image: linear-gradient(#000, transparent); }`, `${CARD} { --pack-a: #000; -webkit-mask-image: radial-gradient(circle, var(--pack-a), transparent); }`, `${PSEUDO} { mask-image: url(assets/m.svg); }`], [`${CARD} { mask-image: url(assets/m.svg); }`, `${PART} { mask-image: linear-gradient(red, #000); }`, `${PART} { mask-image: element(#x); }`, `${PART} { mask-image: linear-gradient(var(--w-fg), #000); }`]],
    ["mask-size, -repeat, -position", [`${PART} { mask-size: 100% 8px; mask-repeat: no-repeat; -webkit-mask-position: center; }`], [`${PART} { mask-size: 5000px; }`, `${PART} { mask-position: 1vh; }`]],
    ["mask", [`${CARD} { mask: linear-gradient(#000, transparent) center / 100% 50% no-repeat; }`], [`${CARD} { mask: linear-gradient(#000, #000) alpha; }`, `${CARD} { mask: url(assets/m.svg); }`]],
    ["mask-composite, mask-mode", [], [`${CARD} { mask-composite: add; }`, `${PSEUDO} { mask-mode: luminance; }`]],
    ["transform", [`${PSEUDO} { transform: translateY(-100%) rotate(45deg); }`], [`${CARD} { transform: rotate(1deg); }`, `${PSEUDO} { transform: perspective(10px); }`, `${PSEUDO} { transform: rotate3d(1, 0, 0, 10deg); }`]],
    ["translate, rotate, scale", [`${PSEUDO} { translate: 4px; rotate: 10deg; scale: 0.9; }`], [`${PART} { scale: 1; }`, `${PSEUDO} { scale: 1.2; }`]],
    ["transform-origin", [`${PSEUDO} { transform-origin: right bottom; }`], [`${CARD} { transform-origin: 0 0; }`]],
    ["content", [`${PSEUDO} { content: "// "; }`, `${PSEUDO} { content: attr(data-pack-x); }`, `${PSEUDO} { content: counter(pack-n); }`], [`${PART} { content: ""; }`, `${PSEUDO} { content: attr(data-part); }`, `${PSEUDO} { content: url(assets/a.svg); }`, `${PSEUDO} { content: "a" counter(pack-n); }`]],
    ["inset, top, right, bottom, left, width, height", [`${PSEUDO} { content: ""; inset: 0; width: 12px; height: calc(100% - 4px); left: auto; }`], [`${CARD} { height: 10px; }`, `${PSEUDO} { top: -2px; }`, `${PSEUDO} { width: 1rem; }`]],
    ["border-radius", [`${CARD} { border-radius: 8px; }`, `${PSEUDO} { border-top-right-radius: 50%; }`], [`${CARD} { border-radius: 65px; }`, `${PART} { border-radius: 4px; }`]],
    ["border-image-source", [`${CARD} { border-image-source: linear-gradient(#0ff, transparent); }`, `${PSEUDO} { border-image-source: url(assets/edge.svg); }`], [`${CARD} { border-image-source: conic-gradient(#000, #fff); }`, `${PART} { border-image-source: linear-gradient(#000, #fff); }`, `${CARD} { border-image-source: url(https://x.test/a.svg); }`]],
    ["border-image-width, -outset, -slice, -repeat", [`${CARD} { border-image-width: 1px; border-image-outset: 0; border-image-slice: 1 10%; border-image-repeat: round stretch; }`], [`${CARD} { border-image-outset: 2px; }`, `${CARD} { border-image-slice: 1 fill; }`, `${CARD} { border-image-width: 9px; }`, `${CARD} { border-image-repeat: tile; }`]],
    ["outline-offset", [`${PART} { outline-offset: -2px; }`], [`${PART} { outline-offset: 12px; }`]],
    ["background gradients and files", [`${CARD} { background: linear-gradient(90deg, #000 0%, rgb(0 0 0 / 50%) 100%); }`, `${PSEUDO} { background-image: repeating-linear-gradient(to bottom, #fff1 0 1px, transparent 1px 3px); }`, `${CARD} { background-image: url("assets/bg.png"); }`], [`${PART} { background: linear-gradient(#000, #fff); }`, `${CARD} { background: conic-gradient(#000, #fff); }`, `${PART} { background-image: url(assets/bg.png); }`, `${CARD} { background-image: url(assets/bg.png?x); }`, `${CARD} { background-image: linear-gradient(#000, #fff), url(assets/bg.png); }`]],
    ["color-mix", [`${PART} { color: color-mix(in oklch, #fff 80%, #000); }`, `${CARD} { --pack-a: #0ff; background-color: color-mix(in srgb, var(--pack-a) 20%, transparent); }`, `${PART} { --pack-m: color-mix(in hsl, #fff, #000); color: var(--pack-m); }`], [`${PART} { color: color-mix(in srgb, #fff, transparent); }`, `${PART} { color: color-mix(in lab, #fff, #000); }`, `${PART} { color: color-mix(in srgb, var(--w-fg), #000); }`, `${PART} { color: color-mix(in srgb, color-mix(in srgb, #fff, #000), #000); }`, `${PART} { color: color-mix(in srgb, #fff 120%, #000); }`]],
    ["transition", [`${PART} { transition: color 200ms ease-in-out, opacity 1s; }`, `${CARD} { transition-property: box-shadow; transition-duration: 2s; }`], [`${PSEUDO} { transition: width 1s; }`, `${PART} { transition: color 2.5s; }`, `${PART} { transition-delay: -1s; }`, `${PART} { transition: --pack-a 1s; }`]],
    ["border", [`${PSEUDO} { border: 1px dashed #0ff; }`], [`${CARD} { border: 1px solid #0ff; }`, `[data-part="ring"]::before { border: 1px solid #0ff; }`, `${PSEUDO} { border: 1px solid red; }`, `${PSEUDO} { border: 6px solid #0ff; }`]],
    ["@keyframes pack-*", [`@keyframes pack-scan { from { transform: translateY(0); } to { transform: translateY(100%); } } ${PSEUDO} { content: ""; animation: pack-scan 4s linear infinite; }`, `@keyframes pack-glow { from { opacity: 0.6; } to { opacity: 1; } } ${CARD} { animation: pack-glow 2s infinite alternate; }`], [`@keyframes pack-scan { to { transform: translateY(100%); } } ${CARD} { animation: pack-scan 4s; }`, `@keyframes pack-x { to { content: "a"; } } ${PSEUDO} { animation: pack-x 2s; }`, `@keyframes pack-x { to { animation: pack-y 1s; } } ${PSEUDO} { animation: pack-x 2s; }`, `@keyframes pack-x { to { width: 4px; } } ${PSEUDO} { animation: pack-x 2s; } ${CARD} { animation: pack-x 2s; }`, `@keyframes pack-x { to { clip-path: inset(2px); } } ${PART} { animation: pack-x 2s; }`]],
    ["animation", [`@keyframes pack-glow { to { opacity: 0.8; } } ${CARD} { animation-name: pack-glow; animation-duration: 2s; animation-iteration-count: 3; }`], [`@keyframes pack-glow { to { opacity: 0.8; } } ${CARD} { animation: pack-glow 0.5s infinite; }`, `${CARD} { animation: spin 2s; }`, `@keyframes pack-glow { to { opacity: 0.8; } } ${CARD} { animation: pack-glow 2s var(--pack-t); }`]],
  ])("%s", (_row, passing, refusals) => {
    for (const css of passing) passes(css);
    for (const css of refusals) refused(css);
  });

  it("a pseudo-element is a slot selector followed directly by ::before or ::after", () => {
    passes(`[data-part="header"] > [data-part="label"]::after { content: "x"; }`);
    passes(`${PSEUDO}, [data-part="unit"]::after { content: ""; }`);
    for (const selector of [`${PSEUDO}:hover`, `${PSEUDO} [data-part="label"]`, '[data-part="num"]::BEFORE', '[data-part="num"] ::before', '[data-part="num"]::first-line', `${PSEUDO}, ${PART}`]) refused(`${selector} { content: ""; }`);
  });

  it("a pack never writes the box the mount pins, on a pseudo-element or anywhere", () => {
    for (const decl of ["position: absolute", "pointer-events: auto", "z-index: 1"]) {
      refused(`${PSEUDO} { ${decl}; }`);
      refused(`${CARD} { ${decl}; }`);
    }
  });
});

describe("the CyberSpec sample (MIT) through both gates", () => {
  const sample = readFileSync(new URL("../fixtures/looks/cyberspec-phase2-sample.css", import.meta.url), "utf8");
  /** Each declaration of the sample on its own, in its own rule, with the custom properties it names defined beside it. */
  const one = (css: string) => {
    const rules = parseCss(css, []);
    const custom = new Map(rules.flatMap((r) => (r.declarations ?? []).filter((d) => d.name.startsWith("--")).map((d) => [d.name, d] as const)));
    return rules.flatMap((r) =>
      (r.declarations ?? []).map((d) => {
        const named = d.value.filter((t) => t.t === "ident" && custom.has(t.v) && t.v !== d.name).map((t) => custom.get(t.v) as Declaration);
        return writeRules([{ prelude: r.prelude, declarations: [...named, d] }]);
      })
    );
  };
  const failing = (lint: (css: string) => string[], css: string) => one(css).filter((rule) => lint(rule).length > 0);

  it("passes the built-in lint whole but for one declaration: the border-image shorthand, which the table does not list", () => {
    expect(one(sample)).toHaveLength(40);
    expect(failing(lintPackCss, sample)).toEqual([".sample-23{border-image:linear-gradient(transparent, transparent) 1;}"]);
  });

  it("passes the grammar on the card but for that one and a custom property that is not a colour", () => {
    const onCard = sample.replace(/\.sample-[\w-]+/g, CARD);
    expect(failing(userCssIssues, onCard)).toEqual([`${CARD}{border-image:linear-gradient(transparent, transparent) 1;}`, `${CARD}{--pack-cut:12px;}`]);
  });
});
