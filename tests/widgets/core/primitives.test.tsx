import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bar, Ring, Spark, sparkMarks, sparkY } from "@/widgets/core/primitives";

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

describe("Bar segments", () => {
  const cells = (html: string) => html.match(/<span /g)?.length ?? 0;

  it("draws 24 cells by default and as many as asked", () => {
    expect(cells(renderToString(<Bar value={50} style="segments" />))).toBe(24);
    expect(cells(renderToString(<Bar value={50} style="segments" segments={12} />))).toBe(12);
  });
});

describe("sparkMarks", () => {
  it("marks the last, lowest and highest sample on the line's own y", () => {
    const m = sparkMarks([5, 1, 9, 4], 1, 9);
    expect(m.last).toMatchObject({ i: 3, v: 4, x: 100, y: sparkY(4, 1, 9) });
    expect(m.min).toMatchObject({ i: 1, v: 1, y: sparkY(1, 1, 9) });
    expect(m.max).toMatchObject({ i: 2, v: 9 });
  });

  it("skips the extremes of a flat series and keeps the last dot", () => {
    const m = sparkMarks([3, 3, 3], 0, 10);
    expect(m.last?.i).toBe(2);
    expect(m.min).toBeNull();
    expect(m.max).toBeNull();
  });

  it("skips an extreme that is the last sample, and a tie takes the latest index", () => {
    expect(sparkMarks([1, 5, 9], 1, 9).max).toBeNull();
    expect(sparkMarks([9, 2, 9, 4], 2, 9).max?.i).toBe(2);
  });

  it("ignores non-finite samples and returns nothing for none", () => {
    expect(sparkMarks([2, Number.NaN, 8, Number.NaN], 2, 8).last?.i).toBe(2);
    expect(sparkMarks([Number.NaN], 0, 1)).toEqual({ last: null, min: null, max: null });
  });
});

describe("Spark marks", () => {
  it("draws nothing extra by default and a dot when asked", () => {
    const v = [1, 4, 2, 6];
    expect(renderToString(<Spark values={v} />)).not.toContain("rounded-full");
    expect(renderToString(<Spark values={v} marks />)).toContain("rounded-full");
  });
  it("keeps a caller's own positioning on the wrapper instead of adding relative", () => {
    const html = renderToString(<Spark values={[1, 4, 2, 6]} marks className="absolute inset-0 h-full" />);
    expect(html).not.toContain("relative absolute");
    expect(html).toContain('class="absolute inset-0 h-full"');
  });
});
