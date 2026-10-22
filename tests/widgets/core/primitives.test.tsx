import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Ring } from "@/widgets/core/primitives";

describe("Ring sweep", () => {
  const dash = (html: string) => [...html.matchAll(/stroke-dasharray="([^"]+)"/g)].map((m) => m[1]);

  it("draws a full ring by default (a whole circle, offset by the value)", () => {
    const html = renderToString(<Ring value={50} />);
    expect(html).toContain("stroke-dashoffset");
    expect(dash(html)).toHaveLength(1);
  });
  it("draws an open arc: the track and the value are partial dashes", () => {
    const html = renderToString(<Ring value={50} sweep={270} track="red" />);
    const [track, value] = dash(html).map((d) => Number(d.split(" ")[0]));
    expect(html).not.toContain("stroke-dashoffset");
    expect(html).toContain('stroke="red"');
    expect(value).toBeCloseTo(track / 2);
    expect(dash(renderToString(<Ring value={50} />))[0]).not.toBe(dash(html)[0]);
  });
});
