import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLASH_MAX, FX_KINDS } from "@/looks/pack-json";

const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");

/** The opacity of each stop of a keyframes block, in time order, 0 or not. */
function stops(kind: string): boolean[] {
  const body = new RegExp(`@keyframes wp-fx-${kind} \\{(.*)\\}\\s*\\n`).exec(css)?.[1];
  expect(body, `keyframes wp-fx-${kind}`).toBeDefined();
  const out: { at: number; lit: boolean }[] = [];
  for (const m of body!.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)) {
    const op = /opacity:\s*([^;]+)/.exec(m[2])?.[1].trim();
    if (op === undefined) continue;
    for (const at of m[1].split(",")) out.push({ at: parseFloat(at), lit: op !== "0" });
  }
  return out.sort((a, b) => a.at - b.at).map((s) => s.lit);
}

/** Flashes a cycle: the times opacity rises from nothing to something. */
const flashesPerCycle = (kind: string): number => stops(kind).filter((lit, i, all) => lit && !all[i - 1]).length;

/** The cycle length in seconds at `rate`: the rule's `calc(1s / var(--wp-fx-rate, 1))`. */
function cycleSeconds(kind: string, rate: number): number {
  const rule = new RegExp(`\\[data-pack-effect="${kind}"\\]\\[data-pack-animate\\] \\{ animation: wp-fx-${kind} calc\\(1s / var\\(--wp-fx-rate, (\\d+)\\)\\)`).exec(css);
  expect(rule, `animation rule for ${kind}`).not.toBeNull();
  return 1 / (rate || Number(rule![1]));
}

describe("the flashing effect kinds' CSS (WCAG 2.3.1)", () => {
  it.each(FX_KINDS)("%s: starts dark, and flashes at most FLASH_MAX times a second at the default rate and at the cap", (kind) => {
    expect(stops(kind)[0]).toBe(false);
    const perCycle = flashesPerCycle(kind);
    expect(perCycle).toBeGreaterThan(0);
    const defaultRate = Number(new RegExp(`wp-fx-${kind} calc\\(1s / var\\(--wp-fx-rate, (\\d+)\\)`).exec(css)![1]);
    for (const rate of [defaultRate, FLASH_MAX]) expect(perCycle / cycleSeconds(kind, rate)).toBeLessThanOrEqual(FLASH_MAX);
  });

  it("the default rate of every flashing kind is one a second", () => {
    for (const kind of FX_KINDS) expect(1 / cycleSeconds(kind, 0)).toBe(1);
  });
});
