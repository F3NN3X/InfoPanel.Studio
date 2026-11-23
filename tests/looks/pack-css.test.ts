import { describe, expect, it } from "vitest";
import { lintPackCss, scopePackCss } from "@/looks/pack-css";

describe("scopePackCss", () => {
  it("writes the parsed rules in @scope inside @layer look, and keyframes and font faces beside the scope", () => {
    const css = ".a { color: red } @keyframes pack-k { from { opacity: 0.5 } to { opacity: 1 } } @media (min-width: 1px) { .b { color: blue } }";
    expect(lintPackCss(css)).toEqual([]);
    expect(scopePackCss("p", css)).toBe(
      '@layer look{@keyframes pack-k{from{opacity:0.5;}to{opacity:1;}}@scope ([data-look="p"]){.a{color:red;}@media (min-width: 1px){.b{color:blue;}}}}'
    );
  });
  it("writes strings and comments as it read them, never the pack's own text", () => {
    expect(scopePackCss("p", String.raw`:scope{--pack-a:"/*\"}";color/**/:red;--pack-b:"*/"}`)).toBe(
      String.raw`@layer look{@scope ([data-look="p"]){:scope{--pack-a:"/*\"}";color:red;--pack-b:"*/";}}}`
    );
  });
});

describe("lintPackCss", () => {
  it("names each unpainted property and each selector that leaves the pack", () => {
    expect(lintPackCss("body { display: none }")).toEqual(["selector body reaches outside the pack", "rule body: property display is not a paint property"]);
    expect(lintPackCss(".a { margin: 0; color: red }")).toEqual(["rule .a: property margin is not a paint property"]);
  });
  it("does not take a word inside a class, an id or a string for the page", () => {
    expect(lintPackCss('.body-x, #html, [data-x="body"] { color: red }')).toEqual([]);
  });
  it("refuses unbalanced braces and a statement outside a rule", () => {
    expect(lintPackCss(".a { color: red }}").join()).toMatch(/unbalanced/);
    expect(lintPackCss(".a { color: red").join()).toMatch(/unbalanced/);
    expect(lintPackCss("color: red;").join()).toMatch(/statement/);
  });
});

describe("lintPackCss reads strings, comments and escapes as the browser does", () => {
  it("does not take a comment opener inside a string for a comment (B1)", () => {
    expect(lintPackCss(':scope{--pack-a:"/*";display:none;--pack-b:"*/"}')).toContain("rule :scope: property display is not a paint property");
  });
  it("ends a string at its closing quote after an escaped quote (B2)", () => {
    expect(lintPackCss(':scope{--pack-q:"\\"";display:none\n}')).toContain("rule :scope: property display is not a paint property");
  });
  it("refuses a stray } that would close the scope and the layer (B3)", () => {
    const css = '[a="\\""]{color:red}}}\nheader{color:red}';
    expect(lintPackCss(css)).toContain("unbalanced }");
    expect(scopePackCss("p", css)).toBe("");
  });
});

describe("lintPackCss keeps widgets on screen and in place (M4)", () => {
  it("refuses an opacity under the floor, and one it cannot read", () => {
    expect(lintPackCss(":scope{opacity:0}")).toEqual(["rule :scope: opacity 0 is under 0.5 or not a plain number"]);
    expect(lintPackCss(":scope{opacity:var(--pack-o)}")).toEqual(["rule :scope: opacity var(--pack-o) is under 0.5 or not a plain number"]);
    expect(lintPackCss(":scope{opacity:0.5;fill-opacity:60%}")).toEqual([]);
  });
  it("allows filter functions that keep content readable, with capped values", () => {
    expect(lintPackCss(":scope{filter:saturate(1.2) drop-shadow(0 0 4px var(--w-accent)) hue-rotate(30deg)}")).toEqual([]);
    for (const f of ["opacity(0)", "blur(2px)", "brightness(0.2)", "invert(1)", "url(f.svg#x)", "var(--pack-f)"]) {
      expect(lintPackCss(`:scope{filter:${f}}`)).toEqual([`rule :scope: filter ${f} hides or blurs content`]);
    }
    expect(lintPackCss(":scope{backdrop-filter:blur(24px)}")).toEqual([]);
    expect(lintPackCss(":scope{backdrop-filter:blur(200px)}")).toEqual(["rule :scope: backdrop-filter blur(200px) hides or blurs content"]);
  });
  it("refuses content off a pseudo-element, border widths, mask modes, dashes and custom properties outside --pack-*", () => {
    expect(lintPackCss(':scope{content:"xxxxxxxx"}')).toEqual(["rule :scope: property content is not a paint property of a real element (only a ::before or ::after sets it)"]);
    for (const p of ["border-width:1px", "mask-composite:add", "stroke-dashoffset:0", "--wp-pad:90px"]) {
      expect(lintPackCss(`:scope{${p}}`)).toEqual([`rule :scope: property ${p.split(":")[0]} is not a paint property`]);
    }
  });
  it("animates only with the pack's own keyframes, named pack-*", () => {
    expect(lintPackCss("@keyframes pack-glow{from{opacity:0.6}to{opacity:1}} :scope{animation:pack-glow 2s ease-in-out infinite alternate}")).toEqual([]);
    expect(lintPackCss(":scope{animation:alert-in-left 1s}")).toEqual(["rule :scope: animation alert-in-left is not a keyframes of this pack"]);
    expect(lintPackCss("@keyframes glow{to{opacity:1}}")).toEqual(["@keyframes glow: name must start with pack-"]);
    expect(lintPackCss("@keyframes pack-k{to{opacity:0}}")).toEqual(["keyframe to: opacity 0 is under 0.5 or not a plain number"]);
  });
  it("names an @font-face family pack-*, so it cannot replace a font the app uses", () => {
    expect(lintPackCss('@font-face{font-family:"pack-body";src:url(f.woff2)}')).toEqual([]);
    expect(lintPackCss('@font-face{font-family:"Segoe UI";src:url(f.woff2)}')).toEqual(['@font-face: font-family "Segoe UI" must start with pack-']);
  });
});

// Phase 2 (gate 0 §6 and its decisions): one rule at a time, each row of the values table passing and refused.
const P = ":scope::before";
const R = ":scope";
const clean = (css: string) => expect(lintPackCss(css), css).toEqual([]);
const dirty = (css: string) => expect(lintPackCss(css).length, css).toBeGreaterThan(0);

describe("lintPackCss: the Phase 2 values", () => {
  it.each([
    ["clip-path", [`${R}{clip-path:polygon(evenodd, 0 0, 100% 0, calc(100% - 8px) 100%)}`, `${R}{clip-path:inset(4px 0 round 8px)}`, `${P}{clip-path:none}`], [`${R}{clip-path:circle(50%)}`, `${R}{clip-path:polygon(0 0, 100% 0, var(--pack-x) 100%)}`, `${R}{clip-path:inset(1em)}`, `${R}{clip-path:inset(0) border-box}`, `${R}{clip-path:polygon(0 0, 100% 0)}`, `${R}{clip-path:inset(calc(2px * 2))}`]],
    ["mask-image", [`${R}{mask-image:linear-gradient(#000, transparent)}`, `${R}{-webkit-mask-image:repeating-radial-gradient(circle at 50% 0, #000 0 2px, transparent 2px 4px)}`, `${P}{mask-image:url(assets/m.svg)}`, `${R}{mask-image:url(assets/m.svg)}`, `${R}{-webkit-mask-image:url("assets/m.svg")}`], [`${R}{mask-image:url(assets/m.svg), url(assets/n.svg)}`, `${R}{mask-image:image(#000)}`, `${P}{mask-image:cross-fade(url(a.svg), url(b.svg))}`, `${R}{mask-image:conic-gradient(#000, #fff)}`]],
    ["mask-size, -repeat, -position", [`${R}{mask-size:100% 8px;mask-repeat:no-repeat;-webkit-mask-position:center 4px}`], [`${R}{mask-size:5000px}`, `${R}{mask-repeat:repeat-x repeat}`, `${R}{mask-position:1em}`]],
    ["mask", [`${R}{mask:linear-gradient(#000, transparent) center / 100% 50% no-repeat}`, `${P}{-webkit-mask:url(assets/m.svg) no-repeat}`, `${R}{mask:url(assets/m.svg)}`, `${R}{mask:url(assets/m.svg) center / contain no-repeat}`], [`${R}{mask:linear-gradient(#000, #000) luminance}`, `${R}{mask:linear-gradient(#000, #000), linear-gradient(#000, #000)}`, `${P}{mask:url(assets/m.svg) content-box}`, `${R}{mask:url(assets/m.svg) alpha}`]],
    ["mask-composite, mask-mode", [], [`${R}{mask-composite:add}`, `${P}{mask-mode:alpha}`, `${P}{-webkit-mask-composite:xor}`]],
    ["transform", [`${P}{transform:translateY(-100%) rotate(45deg) scale(0.9) skewX(10deg)}`, `${P}{transform:translate(4px, calc(50% - 2px)) rotate(0.5turn)}`], [`${R}{transform:translateY(-100%)}`, `${P}{transform:matrix(1, 0, 0, 1, 0, 0)}`, `${P}{transform:scale(2)}`, `${P}{transform:translateZ(1px)}`, `${P}{transform:skew(21deg)}`, `${P}{transform:rotate(var(--pack-r))}`]],
    ["translate, rotate, scale", [`${P}{translate:4px 50%;rotate:0.25turn;scale:1.1}`], [`${R}{rotate:2deg}`, `${P}{scale:0.4}`, `${P}{translate:1px 2px 3px}`, `${P}{rotate:x 10deg}`]],
    ["transform-origin", [`${P}{transform-origin:left 50%}`], [`${R}{transform-origin:center}`, `${P}{transform-origin:1em}`]],
    ["content", [`${P}{content:"// "}`, `${P}{content:counter(pack-n)}`, `${P}{content:attr(data-pack-label)}`, `${P}{content:none}`], [`${R}{content:""}`, `${P}{content:url(a.svg)}`, `${P}{content:attr(title)}`, `${P}{content:"a" "b"}`, `${P}{content:"${"x".repeat(65)}"}`, `${P}{content:linear-gradient(#000, #fff)}`]],
    ["inset, top, right, bottom, left, width, height", [`${P}{content:"";inset:0 auto;width:calc(100% - 8px);height:2px;top:50%}`], [`${R}{width:10px}`, `${P}{left:-1px}`, `${P}{width:10vw}`, `${P}{height:calc(0% - 4px)}`, `${P}{inset:1em}`]],
    ["border-radius", [`${R}{border-radius:8px 50% / 4px;border-top-left-radius:64px}`], [`${R}{border-radius:65px}`, `${R}{border-radius:51%}`, `${R}{border-bottom-right-radius:1em}`]],
    ["border-image-width, -outset", [`${R}{border-image-width:1 8px;border-image-outset:0}`], [`${R}{border-image-outset:1px}`, `${R}{border-image-width:9px}`, `${R}{border-image-width:2}`]],
    ["border-image shorthand", [`${R}{border-image:linear-gradient(#0ff, transparent) 1}`, `${R}{border-image:url(assets/e.svg) 30% 10 / 1px / 0 round stretch}`, `${R}{border-image:round 1 / 4px linear-gradient(#000, #fff)}`, `${R}{border-image:linear-gradient(#000, #fff) 1 fill}`, `${P}{border-image:none 2}`], [`${R}{border-image:conic-gradient(#000, #fff) 1}`, `${R}{border-image:linear-gradient(#000, #fff) 1 / 9px}`, `${R}{border-image:linear-gradient(#000, #fff) 1 / 1 / 2px}`, `${R}{border-image:linear-gradient(#000, #fff) -1}`, `${R}{border-image:linear-gradient(#000, #fff) 1 tile}`, `${R}{border-image:1 / 2 / 0 / 0}`, `${R}{border-image:url(a.svg) url(b.svg) 1}`, `${R}{border-image:url(a.svg) 1 2 3 4 5}`, `${R}{border-image:url(a.svg) 1 round 2}`, `${R}{border-image:url(a.svg) / 1}`, `${R}{border-image:round round round}`, `${R}{border-image:image(#000) 1}`]],
    ["outline-offset", [`${R}{outline-offset:-8px}`, `${R}{outline-offset:0}`], [`${R}{outline-offset:9px}`, `${R}{outline-offset:1em}`]],
    ["letter-spacing", [`${R}{letter-spacing:0.06em}`, `${R}{letter-spacing:0.15em}`, `${R}{letter-spacing:1px}`, `${R}{letter-spacing:normal}`, `${R}{letter-spacing:0}`, `${P}{letter-spacing:0.1em}`], [`${R}{letter-spacing:0.16em}`, `${R}{letter-spacing:-0.02em}`, `${R}{letter-spacing:4px}`, `${R}{letter-spacing:1rem}`, `${R}{letter-spacing:5%}`, `${R}{letter-spacing:inherit}`, `${R}{letter-spacing:0.1em 0.1em}`, `${R}{transition:letter-spacing 1s}`, `@keyframes pack-t{to{letter-spacing:0.1em}} ${R}{animation:pack-t 2s}`]],
    ["text-transform", [`${R}{text-transform:uppercase}`, `${R}{text-transform:none}`], [`${R}{text-transform:lowercase}`, `${R}{text-transform:capitalize}`, `${R}{text-transform:uppercase none}`, `@keyframes pack-t{to{text-transform:none}} ${R}{animation:pack-t 2s}`]],
    ["font-variant-numeric", [`${R}{font-variant-numeric:tabular-nums}`, `${R}{font-variant-numeric:lining-nums slashed-zero}`], [`${R}{font-variant-numeric:diagonal-fractions}`, `${R}{font-variant-numeric:ordinal}`, `${R}{font-variant-numeric:tabular-nums lining-nums slashed-zero normal}`]],
    ["transition", [`${R}{transition:color 200ms ease-out, opacity 2s linear 100ms}`, `${R}{transition-property:box-shadow;transition-duration:1s;transition-timing-function:steps(4, jump-end)}`], [`${R}{transition:all 1s}`, `${R}{transition:1s}`, `${R}{transition:color 3s}`, `${R}{transition:width 1s}`, `${P}{transition:content 1s}`, `${R}{transition:color 1s -1s}`, `${R}{transition:--pack-a 1s}`]],
    ["border", [`${P}{border:1px solid #0ff}`, `${R}{border:solid}`, `${R}{border:#0ff dashed}`, `${R}{border:double rgb(1 2 3)}`, `${R}{border:none}`, `${R}{border:dotted var(--w-accent)}`, `${R}{border-style:solid dashed}`], [`${R}{border:1px solid #0ff}`, `${R}{border:0 solid}`, `${R}{border:thin solid}`, `${R}{border:medium dashed #0ff}`, `${R}{border:calc(1px + 1px) solid}`, `${R}{border:solid #0ff 1px}`, `${P}{border:5px solid #0ff}`, `${P}{border:1px groove #0ff}`, `${P}{border:1px solid url(a.svg)}`, `${P}{border:solid #0ff}`, `${R}{border:groove}`, `${R}{border:solid dashed}`, `${R}{border:#0ff}`, `${R}{border:solid url(a.svg)}`, `${R}{border-width:1px}`, `${R}{border-style:groove}`, `${R}{border-style:solid solid solid solid solid}`, `${R}{--pack-w:2px;border:solid var(--pack-w)}`]],
    ["length custom properties", [`${R}{--pack-w:12px;clip-path:polygon(0 0, 100% 0, var(--pack-w) 100%)}`, `${P}{--pack-w:8px;content:"";width:var(--pack-w);transform:translateX(var(--pack-w))}`, `@media (min-width: 1px){${R}{--pack-w:6px}} ${R}{border-radius:var(--pack-w)}`, `${R}{--pack-s:40%;mask-image:linear-gradient(#000 var(--pack-s), transparent)}`, `${R}{--pack-b:2px;border-image-width:var(--pack-b);border-image:linear-gradient(#000, #fff) 1 / var(--pack-b)}`, `${R}{--pack-w:0;--pack-w:4px;mask-size:var(--pack-w) 100%}`, `${R}{--pack-c:#0ff;mask-image:linear-gradient(var(--pack-c), transparent)}`], [`${R}{clip-path:polygon(0 0, 100% 0, var(--pack-x) 100%)}`, `${R}{--pack-w:12px;--pack-w:99px;border-radius:var(--pack-w)}`, `${R}{--pack-w:12px;border-image-width:var(--pack-w)}`, `${R}{--pack-w:12px;clip-path:polygon(0 0, 100% 0, var(--pack-w, 1px) 100%)}`, `${R}{--pack-chrome-w:12px;clip-path:polygon(0 0, 100% 0, var(--pack-chrome-w) 100%)}`, `${R}{--pack-w:12px;mask-image:linear-gradient(var(--pack-w), transparent)}`, `${R}{--pack-w:calc(1px + 2px);clip-path:polygon(0 0, 100% 0, var(--pack-w) 100%)}`, `${R}{--pack-w:2em;border-radius:var(--pack-w)}`, `${R}{--pack-w:1px 2px;mask-size:var(--pack-w)}`, `${R}{--pack-c:#0ff;clip-path:polygon(0 0, 100% 0, var(--pack-c) 100%)}`, `${P}{--pack-w:-2px;width:var(--pack-w)}`, `${R}{--pack-w:2px;border-image:linear-gradient(var(--pack-w), #fff) 1}`]],
    ["@keyframes run by a pseudo-element", [`@keyframes pack-s{to{transform:translateX(10px);opacity:0.6}} ${P}{animation:pack-s 2s}`], [`@keyframes pack-s{to{transform:translateX(10px)}} ${R}{animation:pack-s 2s}`, `@keyframes pack-s{to{width:10px}} ${P}{animation:pack-s 2s} ${R}{animation:pack-s 2s}`, `@keyframes pack-s{to{content:"x"}} ${P}{animation:pack-s 2s}`, `@keyframes pack-s{to{transform:translateX(10px)}}`, `@keyframes pack-s{to{transition:color 1s}} ${P}{animation:pack-s 2s}`]],
  ])("%s", (_row, passes, refusals) => {
    for (const css of passes) clean(css);
    for (const css of refusals) dirty(css);
  });

  it("refuses a value that has more than 64 combinations of the definitions of its length vars", () => {
    const defs = (name: string) => Array.from({ length: 9 }, (_, i) => `--pack-${name}:${i + 1}px;`).join("");
    clean(`${R}{${defs("a")}border-radius:var(--pack-a)}`);
    dirty(`${R}{${defs("a")}${defs("b")}clip-path:polygon(0 0, var(--pack-a) var(--pack-b), 100% 100%)}`);
  });

  it("reads the pseudo lane from every selector of the rule, and refuses any other pseudo-element", () => {
    clean(`${P}, :scope::after{content:""}`);
    dirty(`${P}, ${R}{content:""}`);
    for (const selector of [":scope:before", ":scope::marker", ":scope::before:hover", ":scope::before .a", ":scope:first-line"]) {
      expect(lintPackCss(`${selector}{color:red}`), selector).toContain(`selector ${selector} names a pseudo-element other than a final ::before or ::after`);
    }
  });

  it("never lets a pack write the box the mount pins, on a pseudo-element or anywhere", () => {
    for (const decl of ["position:static", "pointer-events:auto", "z-index:9"]) {
      dirty(`${P}{${decl}}`);
      dirty(`${R}{${decl}}`);
    }
  });
});

describe("scopePackCss: the mount's own declarations and URLs", () => {
  const css = `${P}{content:"";mask-image:url(./assets//m.svg)} @media (min-width: 1px){:scope::after{content:""}} ${R}{background:url("assets/a b.png")}`;

  it("ends every pseudo-lane rule, at any depth, in position, pointer-events and z-index, after the pack's own; other rules get none", () => {
    expect(scopePackCss("p", css)).toBe(
      '@layer look{@scope ([data-look="p"]){:scope::before{content:"";mask-image:url(./assets//m.svg);position:absolute;pointer-events:none;z-index:0;}@media (min-width: 1px){:scope::after{content:"";position:absolute;pointer-events:none;z-index:0;}}:scope{background:url("assets/a b.png");}}}'
    );
  });

  it("rewrites a user pack's URLs to its route from the tokens, each step encoded, and leaves a built-in pack's as written", () => {
    const user = scopePackCss("mine", css, { user: true });
    expect(user).toContain("mask-image:url(/api/packs/mine/assets/m.svg)");
    expect(user).toContain('background:url("/api/packs/mine/assets/a%20b.png")');
    expect(scopePackCss("mine", css)).toContain("url(./assets//m.svg)");
  });

  it("mounts nothing for a user pack that names a URL outside its folder", () => {
    expect(scopePackCss("mine", `${R}{background:url(https://x.test/a.png)}`, { user: true })).toBe("");
    expect(scopePackCss("mine", `${P}{content:"";mask-image:url(../a.svg)}`, { user: true })).toBe("");
  });
});
