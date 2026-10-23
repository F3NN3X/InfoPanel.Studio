import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { iconMarkup } from "@/lib/infopanel/gauges/icon-markup";
import { GAUGE_ICON_MARKUP } from "@/lib/infopanel/gauges/icon-markup.generated";
import { GAUGE_ICONS } from "@/lib/infopanel/gauges/vector";
import { WIDGET_ICONS } from "@/lib/widget-icons";

/** What icon-markup.ts rendered at runtime before the markup was generated (test only). */
const rendered = (name: string) =>
  renderToStaticMarkup(createElement(WIDGET_ICONS[name]))
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");

describe("iconMarkup", () => {
  it("matches the runtime render byte for byte, for every widget icon (else run node tools/gen-gauge-icons.mjs)", () => {
    expect(Object.keys(GAUGE_ICON_MARKUP).sort()).toEqual(Object.keys(WIDGET_ICONS).sort());
    for (const name of Object.keys(WIDGET_ICONS)) expect(GAUGE_ICON_MARKUP[name], name).toBe(rendered(name));
  });

  it("answers every gauge icon name, and nothing for unknown names", () => {
    for (const name of GAUGE_ICONS) expect(iconMarkup(name), name).toBe(WIDGET_ICONS[name] ? rendered(name) : "");
    expect(iconMarkup("toString" as never)).toBe("");
    expect(iconMarkup("nope" as never)).toBe("");
  });
});
