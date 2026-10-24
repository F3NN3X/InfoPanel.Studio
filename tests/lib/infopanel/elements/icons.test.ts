import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { describe, expect, it } from "vitest";
import { ELEMENT_ICON_MARKUP } from "@/lib/infopanel/elements/icons.generated";
import { iconMarkupOf, iconNames, iconsLoaded, loadIcons } from "@/lib/infopanel/elements/icons";
import { ICONS, kebab } from "../../../../tools/gen-element-icons.mjs";

describe("the Icon element's icons", () => {
  it("match lucide's render byte for byte (else run node tools/gen-element-icons.mjs)", () => {
    expect(Object.keys(ELEMENT_ICON_MARKUP).sort()).toEqual(ICONS.map(kebab).sort());
    for (const component of ICONS) {
      const Icon = (lucide as unknown as Record<string, Parameters<typeof createElement>[0]>)[component];
      const markup = renderToStaticMarkup(createElement(Icon)).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      expect(ELEMENT_ICON_MARKUP[kebab(component)], component).toBe(markup);
    }
  });

  it("loads on first use, then answers known names only", async () => {
    expect(iconsLoaded()).toBe(false);
    expect(iconMarkupOf("cpu")).toBe("");
    await loadIcons();
    expect(iconNames()).toContain("cpu");
    expect(iconMarkupOf("cpu")).toBe(ELEMENT_ICON_MARKUP.cpu);
    expect(iconMarkupOf("toString")).toBe("");
    expect(iconMarkupOf("nope")).toBe("");
  });
});
