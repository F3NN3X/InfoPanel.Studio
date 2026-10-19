import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_DEFAULTS } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { TEMPLATE_MODULES } from "../registry";

// Backlog X1: which templates honour the standard alignment and gap. The `[data-wp-body]` rules in
// src/index.css reach the body's root layout when it is a flex or grid container; label case
// reaches every label through the primitives and the `uppercase` class. A template listed below
// lays out its body some other way, and gets text alignment and label case only.
const TEXT_ONLY: Record<string, string> = {
  Visualizer: "a canvas, pure graphic",
  GameSpotlight: "art with overlaid text",
  SteamGame: "art with overlaid text",
  TextFile: "a preformatted text block from the sm tier",
};

const TIERS = ["xs", "sm", "md", "lg"] as const;
// Web Page offers none of these controls (its settings are its own short list).
const OFFERING = TEMPLATE_MODULES.filter((m) => (m.settings ?? []).some((d) => d.key === "align"));
const SENSORS = fixtureSensors();
const defaults = (m: DashboardModule): ModuleSettings => ({ ...STANDARD_DEFAULTS, ...Object.fromEntries((m.settings ?? []).map((d) => [d.key, d.default])) });

/** The body's root element per forced tier: its tag and class list. */
function roots(m: DashboardModule, over: ModuleSettings = {}): { tag: string; cls: string[] }[] {
  return TIERS.map((sizeTier) => {
    const out = renderToStaticMarkup(m.render(SENSORS, { ...defaults(m), sizeTier, ...over }) as never);
    const at = out.search(/data-wp-body/);
    const tag = out.slice(out.indexOf(">", at) + 1).match(/^<(\w+)(?:[^>]*?class="([^"]*)")?/);
    return { tag: tag?.[1] ?? "", cls: (tag?.[2] ?? "").split(/\s+/) };
  });
}
const layoutRoot = (r: { cls: string[] }) => r.cls.includes("flex") || r.cls.includes("grid");

describe("templates honour the standard alignment and gap", () => {
  it.each(OFFERING.filter((m) => !TEXT_ONLY[m.id]).map((m) => [m.id, m] as const))("%s lays its body out as flex or grid", (_, m) => {
    for (const r of roots(m)) expect(layoutRoot(r), `${m.id}: <${r.tag} class="${r.cls.join(" ")}">`).toBe(true);
  });

  it.each(Object.keys(TEXT_ONLY))("%s is listed for a reason (some tier has no flex or grid root)", (id) => {
    const m = OFFERING.find((x) => x.id === id);
    expect(m, id).toBeDefined();
    expect(roots(m!).some((r) => !layoutRoot(r))).toBe(true);
  });

  it("every template offering them flags its body with the chosen options", () => {
    expect(OFFERING.length).toBe(TEMPLATE_MODULES.length - 1);
    for (const m of OFFERING) {
      // Top right: the horizontal axis at the end, the vertical at the start.
      const out = renderToStaticMarkup(m.render(SENSORS, { ...defaults(m), align: "tr", gap: "8" }) as never);
      expect(out, m.id).toMatch(/data-wp-body="" data-wp-x="end" data-wp-y="start" data-wp-gap=""/);
    }
  });
});
