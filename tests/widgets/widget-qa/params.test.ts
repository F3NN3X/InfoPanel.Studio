import { describe, expect, it } from "vitest";
import { demoSettings, withDemo } from "@/widgets/widget-qa/demo-settings";
import { DEFAULT_STATE, parseParams, serializeParams } from "@/widgets/widget-qa/params";

describe("widget-qa params", () => {
  it("reads fixture data by default and live only when asked, and writes back only live", () => {
    expect(parseParams("?widget-qa").data).toBe("fixtures");
    expect(parseParams("?widget-qa&data=fixtures").data).toBe("fixtures");
    expect(parseParams("?widget-qa&data=live").data).toBe("live");
    expect(serializeParams(DEFAULT_STATE)).toBe("?widget-qa");
    expect(serializeParams({ ...DEFAULT_STATE, data: "live" })).toBe("?widget-qa&data=live");
  });
});

describe("demo settings", () => {
  it("picks the demo deck and a future date, under the page's settings, on fixtures only", () => {
    const demo = demoSettings(new Date("2026-11-01T12:00:00Z"));
    expect(demo.StreamDeck).toEqual({ device: "demo" });
    expect(demo.Countdown).toEqual({ date: "2026-12-13" });
    expect(withDemo("StreamDeck", { skin: "cyber" }, false)).toEqual({ device: "demo", skin: "cyber" });
    expect(withDemo("StreamDeck", { device: "mine" }, false)).toEqual({ device: "mine" });
    expect(withDemo("StreamDeck", { skin: "cyber" }, true)).toEqual({ skin: "cyber" });
    expect(withDemo("CpuMonitor", {}, false)).toEqual({});
  });
});
