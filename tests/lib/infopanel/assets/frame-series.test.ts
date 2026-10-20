import { describe, expect, it } from "vitest";
import { groupFrameSeries, parseFrameName } from "@/lib/infopanel/assets/frame-series";

const f = (name: string) => ({ name });

describe("frame names", () => {
  it("reads the stem, number and extension", () => {
    expect(parseFrameName("Fan_007.PNG")).toEqual({ stem: "fan", index: 7, ext: "png" });
    expect(parseFrameName("ring-12.webp")).toEqual({ stem: "ring", index: 12, ext: "webp" });
    expect(parseFrameName("logo.png")).toBeNull();
    expect(parseFrameName("12.png")).toBeNull();
  });

  it("collapses runs of three or more into one row, frames by number, at the first file's place", () => {
    const rows = groupFrameSeries([f("bg.png"), f("fan_003.png"), f("logo.png"), f("fan_002.png"), f("fan_001.png"), f("icon_1.png"), f("fan_1.gif")]);
    expect(rows.map((r) => (r.kind === "file" ? r.file.name : `${r.stem}×${r.frames.length}`))).toEqual(["bg.png", "fan×3", "logo.png", "icon_1.png", "fan_1.gif"]);
    const series = rows[1];
    expect(series.kind === "series" && series.frames.map((x) => x.name)).toEqual(["fan_001.png", "fan_002.png", "fan_003.png"]);
  });

  it("leaves numbered variants, gaps and repeated numbers as separate files", () => {
    const names = (files: string[]) => groupFrameSeries(files.map(f)).map((r) => (r.kind === "file" ? r.file.name : r.stem));
    expect(names(["v1.png", "v2.png"])).toEqual(["v1.png", "v2.png"]);
    expect(names(["icon-16.png", "icon-32.png", "icon-64.png"])).toEqual(["icon-16.png", "icon-32.png", "icon-64.png"]);
    expect(names(["fan_1.png", "fan_01.png", "fan_2.png"])).toEqual(["fan_1.png", "fan_01.png", "fan_2.png"]);
    expect(names(["fan_9.png", "fan_10.png", "fan_11.png"])).toEqual(["fan"]);
  });
});
