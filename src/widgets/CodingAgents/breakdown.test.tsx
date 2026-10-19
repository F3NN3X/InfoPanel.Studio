import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentUsage } from "@/lib/agents";
import { Breakdown, breakdownH, breakdownOf, tokensToday } from "./breakdown";

const text = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, "");

const day = (d: string, over = {}) => ({ day: d, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, ...over });
const usage = (week: AgentUsage["breakdown"], days = [day("2026-10-15")]): AgentUsage => ({ today: 0, history: 0, days, breakdown: week });

describe("breakdownOf", () => {
  it("adds the agents up by model and project, largest first, with shares of the total", () => {
    const a = usage({
      week: { projects: [{ name: "app", total: 600 }, { name: "api", total: 100 }], models: [{ name: "opus-5-5", total: 700 }] },
    });
    const b = usage({ week: { projects: [{ name: "app", total: 100 }, { name: "docs", total: 100 }], models: [{ name: "gpt-5.5", total: 100 }, { name: "opus-5-5", total: 100 }] } });
    const d = breakdownOf([a, b])!;
    expect(d.total).toBe(900);
    expect(d.models.map((m) => [m.name, m.total])).toEqual([["Opus 5.5", 800], ["gpt-5.5", 100]]);
    expect(d.projects.map((p) => p.name)).toEqual(["app", "api", "docs"]);
    expect(d.projects[0].share).toBeCloseTo(700 / 900);
  });

  it("keeps four models and merges the rest as Other", () => {
    const models = ["opus-5-5", "sonnet-5-5", "haiku-5", "gpt-5.5", "o3", "o4"].map((name, i) => ({ name, total: 100 - i * 10 }));
    const d = breakdownOf([usage({ week: { projects: [], models } })])!;
    expect(d.models.map((m) => m.name)).toEqual(["Opus 5.5", "Sonnet 5.5", "Haiku 5", "gpt-5.5", "Other"]);
    expect(d.models[4].total).toBe(60 + 50);
    expect(d.models.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1);
  });

  it("merges a statusline name and a transcript id for the same model", () => {
    const a = usage({ week: { projects: [], models: [{ name: "opus-5-5", total: 100 }, { name: "Opus 5.5 (1M context)", total: 50 }] } });
    expect(breakdownOf([a])!.models).toMatchObject([{ name: "Opus 5.5", total: 150, share: 1 }]);
  });

  it("is null without a weekly split", () => {
    expect(breakdownOf([usage(undefined), undefined])).toBeNull();
    expect(breakdownOf([usage({ today: { projects: [{ name: "a", total: 1 }], models: [] } })])).toBeNull();
  });
});

describe("tokensToday", () => {
  it("adds today's types over the agents, cache being read plus write", () => {
    const a = usage(undefined, [day("2026-10-14", { input: 9 }), day("2026-10-15", { input: 10, output: 20, cacheRead: 30, cacheWrite: 5 })]);
    const b = usage(undefined, [day("2026-10-15", { input: 1, cacheRead: 1 })]);
    expect(tokensToday([a, b], "2026-10-15")).toEqual({ input: 11, output: 20, cache: 36 });
    expect(tokensToday([a], "2026-10-16")).toBeNull();
  });
});

describe("Breakdown", () => {
  const data = breakdownOf([usage({ week: { projects: [{ name: "app", total: 410 }, { name: "api", total: 300 }, { name: "docs", total: 100 }, { name: "x", total: 90 }], models: [{ name: "opus-5-5", total: 620 }, { name: "sonnet-5-5", total: 300 }, { name: "haiku-5", total: 80 }] } })])!;

  it("budgets its height by rows and the by-type line", () => {
    expect(breakdownH(1, false)).toBe(16 + 6 + 24 + 22);
    expect(breakdownH(3, true)).toBe(16 + 6 + 24 + 66 + 20);
    expect(breakdownH(2, false, false)).toBe(16 + 44);
  });

  it("draws the header, the legend with shares and only the rows it is given", () => {
    const html = text(<Breakdown data={data} rows={2} tokens={{ input: 12_000, output: 40_000, cache: 3_100_000 }} />);
    expect(html).toContain("This week");
    expect(html).toContain(">1k<");
    expect(html).toContain("Opus 5.5 62%");
    expect(html).toContain("Sonnet 5.5 30%");
    expect(html).toContain("app");
    expect(html).toContain("41%");
    expect(html).toContain("api");
    expect(html).not.toContain("docs");
    expect(html).toContain("in 12k · out 40k · cache 3.1M");
    expect(text(<Breakdown data={data} rows={1} />)).not.toContain("cache");
  });
});
