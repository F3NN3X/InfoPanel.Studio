import { describe, expect, it } from "vitest";
import { tuningLookOf, vizStyleOf } from "@/widgets/NowPlaying/settings";

describe("vizStyleOf", () => {
  it("live waveform: scrolling (the default) is scroll; static is bars, line or mirror", () => {
    expect(vizStyleOf({ vizEngine: "waveform" })).toBe("scroll");
    expect(vizStyleOf({ vizEngine: "waveform", waveformMode: "scrolling", waveformVariant: "line" })).toBe("scroll");
    expect(vizStyleOf({ vizEngine: "waveform", waveformMode: "static" })).toBe("bars");
    expect(vizStyleOf({ vizEngine: "waveform", waveformMode: "static", waveformVariant: "line" })).toBe("line");
    expect(vizStyleOf({ vizEngine: "waveform", waveformMode: "static", waveformVariant: "mirror" })).toBe("mirror");
  });
  it("bar visualizer: bars, or mirror from the variant or the mirrored switch", () => {
    expect(vizStyleOf({ vizEngine: "bars" })).toBe("bars");
    expect(vizStyleOf({ vizEngine: "bars", waveformVariant: "mirror" })).toBe("mirror");
    expect(vizStyleOf({ vizEngine: "bars", visualizerMirrored: true })).toBe("mirror");
  });
  it("inline canvas (or none): the saved style as is", () => {
    expect(vizStyleOf({})).toBe("bars");
    expect(vizStyleOf({ vizEngine: "mini", waveformVariant: "dots" })).toBe("dots");
    expect(vizStyleOf({ waveformVariant: "radial" })).toBe("radial");
    expect(vizStyleOf({ waveformVariant: "nope" })).toBe("bars");
  });
  it("takes the engine the legacy modules pick from their switches", () => {
    expect(vizStyleOf({ waveformVariant: "line" }, "waveform")).toBe("scroll");
    expect(vizStyleOf({ visualizerMirrored: true }, "bars")).toBe("mirror");
  });
});

describe("tuningLookOf", () => {
  it("carries the old engines' keys onto the look, at their defaults when unset", () => {
    expect(tuningLookOf({})).toEqual({ count: 24, align: "center", orientation: "horizontal", minLevel: 0.08, lineWidth: 1.5, fade: 24, gain: 1, scrollAs: "bars" });
    expect(
      tuningLookOf({ visualizerBarCount: 40, visualizerAlign: "end", visualizerOrientation: "vertical", visualizerMinLevel: 0.2, waveformLineWidth: 3, waveformFadeWidth: 60, waveformSensitivity: 2 })
    ).toMatchObject({ count: 40, align: "end", orientation: "vertical", minLevel: 0.2, lineWidth: 3, fade: 60, gain: 2 });
    expect(tuningLookOf({ waveformFadeEdges: false }).fade).toBe(0);
  });
  it("turns a saved bar width + gap into the gap, unless vizGap is set", () => {
    expect(tuningLookOf({ waveformBarWidth: 6, waveformBarGap: 2 }).gap).toBe(0.25);
    expect(tuningLookOf({ waveformBarWidth: 6, waveformBarGap: 2, vizGap: 30 })).not.toHaveProperty("gap");
  });
  it("turns a saved radius into the shape while vizShape is auto", () => {
    expect(tuningLookOf({ waveformBarRadius: 0 }).shape).toBe("square");
    expect(tuningLookOf({ waveformBarRadius: 4, vizShape: "auto" }).shape).toBe("round");
    expect(tuningLookOf({ waveformBarRadius: 0, vizShape: "pill" })).not.toHaveProperty("shape");
  });
  it("turns a saved minimum bar height into a floor in px", () => {
    expect(tuningLookOf({ waveformMinBarHeight: 10 }).minPx).toBe(10);
  });
  it("treats the hidden keys' defaults as no choice", () => {
    const look = tuningLookOf({ waveformBarWidth: 3, waveformBarGap: 1, waveformBarRadius: 1.5, waveformMinBarHeight: 4 });
    for (const k of ["gap", "shape", "minPx"]) expect(look).not.toHaveProperty(k);
  });
});
