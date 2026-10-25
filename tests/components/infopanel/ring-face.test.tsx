import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import { DEFAULT_FACE } from "@/lib/effects/face";
import { DEFAULT_GAUGE, normalizeGauge } from "@/lib/infopanel/gauges/vector";
import { FittedVectorGauge, parseGaugeSetting } from "@/widgets/CustomGauge";

const ring = (extra: object = {}) => normalizeGauge({ ...DEFAULT_GAUGE, start: 0, sweep: 360, ...extra });

describe("a ring's face live", () => {
  it("draws a faced ring as two layers, the face once and the arc over it", () => {
    const html = renderToStaticMarkup(<VectorGaugeSvg gauge={ring({ face: DEFAULT_FACE })} p={0.4} id="a" />);
    expect(html.match(/<pattern/g)).toHaveLength(1);
    // The face's layer comes first (under the arc) and has no arc; the other has no pattern.
    const [first, second] = html.split("</span><span");
    expect(first).toContain("<pattern");
    expect(first).not.toContain("stroke-linecap");
    expect(second).not.toContain("<pattern");
    expect(second).toContain("stroke-linecap");
  });

  it("keeps an unfaced ring as one drawing", () => {
    const html = renderToStaticMarkup(<VectorGaugeSvg gauge={ring()} p={0.4} id="a" />);
    expect(html).not.toContain("<pattern");
    expect(html.match(/<svg/g)).toHaveLength(1);
  });

  it("renders a Custom gauge once with a face, from its saved setting", () => {
    const g = parseGaugeSetting(JSON.stringify({ ...ring({ face: { pattern: "carbon" } }) }));
    expect(g.face).toMatchObject({ pattern: "carbon" });
    const html = renderToStaticMarkup(<FittedVectorGauge gauge={g} p={0.7} id="c" width={160} height={160} />);
    expect(html).toContain("<pattern");
  });
});
