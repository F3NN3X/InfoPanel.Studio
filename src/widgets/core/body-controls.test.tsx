import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chromeOf, STANDARD_DEFAULTS } from "@/modules/standard-settings";
import { bodyFlags, bodyGap, GAP_CAP } from "./look";
import { BarRow, LegendRow, Logo, Metric, Stat, StatGrid } from "./primitives";
import { Widget } from "./Widget";

// Backlog X1: the standard alignment, label case and gap reach the template body. Every primitive
// reads the shell's --wp-* variable with its own value as the fallback, so "Auto" renders as before.

const look = (over: Record<string, string | number | boolean>) => ({ ...STANDARD_DEFAULTS, ...over });
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("bodyFlags", () => {
  it("sets nothing while every option is Auto", () => {
    expect(bodyFlags(undefined)).toEqual({});
    expect(bodyFlags(chromeOf(STANDARD_DEFAULTS))).toEqual({});
  });

  it("flags each chosen option, the horizontal one with its value", () => {
    expect(bodyFlags(chromeOf(look({ alignSpread: true })))).toEqual({ "data-wp-x": "between" });
    expect(bodyFlags(chromeOf(look({ align: "bc" })))).toEqual({ "data-wp-x": "center", "data-wp-y": "end" });
    expect(bodyFlags(chromeOf(look({ gap: "0" })))).toEqual({ "data-wp-gap": "" });
  });

  it("still reads the old two axes while the new key is Auto (until PR 8)", () => {
    expect(bodyFlags(chromeOf(look({ alignX: "between" })))).toEqual({ "data-wp-x": "between" });
    expect(bodyFlags(chromeOf(look({ alignY: "end" })))).toEqual({ "data-wp-y": "end" });
  });
});

describe("bodyGap", () => {
  it("is the template's own gap while the look sets none", () => {
    expect(bodyGap(undefined, 10, 200)).toBe(10);
    expect(bodyGap(STANDARD_DEFAULTS, 10, 200)).toBe(10);
  });

  it("is the look's gap, capped at the CSS rule's share of the room", () => {
    expect(bodyGap(look({ gap: "4" }), 10, 200)).toBe(4);
    expect(bodyGap(look({ gap: "48" }), 10, 200)).toBe(200 * GAP_CAP);
  });
});

describe("the widget body", () => {
  const body = (l?: Record<string, string | number | boolean>) => {
    const out = html(<Widget look={l ? look(l) : undefined} showHeader={false}>body</Widget>);
    return out.match(/<div[^>]*data-wp-body[^>]*>/)?.[0] ?? "";
  };

  it("carries no flag by default", () => {
    expect(body()).toBe('<div data-wp-body="" class="relative min-h-0 flex-1">');
    expect(body({})).toBe('<div data-wp-body="" class="relative min-h-0 flex-1">');
  });

  it("flags the chosen alignment and gap", () => {
    const b = body({ align: "tr", gap: "16" });
    expect(b).toContain('data-wp-x="end"');
    expect(b).toContain('data-wp-y="start"');
    expect(b).toContain('data-wp-gap=""');
  });
});

describe("primitives read the look", () => {
  it("Metric: its label follows the label case, its items the horizontal alignment", () => {
    const out = html(<Metric label="CPU" value={42} unit="%" />);
    expect(out).toContain("align-items:var(--wp-x-cross, stretch)");
    expect(out).toContain("text-transform:var(--wp-label-case, none)");
    // the value is not a label
    expect(out.match(/--wp-label-case/g)).toHaveLength(1);
  });

  it("Metric: a centred one keeps centre as its fallback", () => {
    const out = html(<Metric label="CPU" value={42} align="center" />);
    expect(out).toContain("align-items:var(--wp-x-cross, center)");
    expect(out).toContain("text-align:var(--wp-text-align, center)");
  });

  it("Stat: label case on the label only", () => {
    const out = html(<Stat label="Threads" value="12" />);
    expect(out).toContain("align-items:var(--wp-x-cross, stretch)");
    expect(out.match(/--wp-label-case/g)).toHaveLength(1);
  });

  it("BarRow and LegendRow: label case on the label", () => {
    expect(html(<BarRow label="Disk" value={40} />)).toContain("text-transform:var(--wp-label-case, none)");
    expect(html(<LegendRow label="VRAM" value="8 GB" />)).toContain("text-transform:var(--wp-label-case, none)");
  });

  it("StatGrid: the gap falls back to its own 0.75rem", () => {
    expect(html(<StatGrid items={[{ label: "a", value: "1" }]} />)).toContain("gap:var(--wp-gap, 0.75rem)");
  });

  it("Logo: a typeset name stays uppercase whatever the label case", () => {
    const out = html(<Logo name="Game" />);
    expect(out).toContain("text-transform:uppercase");
    expect(out).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("the body rules in index.css", async () => {
  // node:fs through a non-literal specifier: the project has no Node types, and Vitest serves CSS imports empty
  const fs = "node:fs";
  const { readFileSync } = await import(/* @vite-ignore */ fs);
  const css = String(readFileSync(new URL("../../index.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]*\[data-wp-body\][^{}]*)\{([^{}]*)\}/g)].map(([, sel, decl]) => ({ sel: sel.trim(), decl }));

  it("exist", () => {
    expect(rules.length).toBeGreaterThan(5);
  });

  it("only reach into a template's layout while an option is set", () => {
    for (const r of rules.filter((r) => !r.sel.endsWith(".uppercase"))) expect(r.sel, r.sel).toMatch(/\[data-wp-(x|y|gap)/);
  });

  it("give labels written as uppercase the label case, with uppercase as the fallback", () => {
    const r = rules.find((r) => r.sel.endsWith(".uppercase"));
    expect(r?.decl).toContain("var(--wp-label-case, uppercase)");
  });
});
