import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MissingImage } from "./MissingImage.tsx";

describe("MissingImage", () => {
  it("fills the item's box with a striped pattern and a centred icon", () => {
    const html = renderToString(h(MissingImage, { width: 120, height: 80, id: "p-a" }));
    expect(html).toContain('width="120"');
    expect(html).toContain('height="80"');
    expect(html).toContain('<pattern id="p-a-missing"');
    expect(html).toContain('fill="url(#p-a-missing)"');
    // 80 * 0.35 = 28 px icon, centred: (120 - 28) / 2, (80 - 28) / 2.
    expect(html).toContain("translate(46 26)");
  });

  it("keeps the icon inside a tiny box", () => {
    expect(renderToString(h(MissingImage, { width: 10, height: 10, id: "x" }))).toContain("translate(1 1)");
  });
});
