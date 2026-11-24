import { describe, expect, it } from "vitest";
import { demoSettings, withDemo } from "@/widgets/widget-qa/demo-settings";
import { DEFAULT_STATE, frameRef, parseParams, serializeParams } from "@/widgets/widget-qa/params";

describe("widget-qa params", () => {
  it("reads fixture data by default and live only when asked, and writes back only live", () => {
    expect(parseParams("?widget-qa").data).toBe("fixtures");
    expect(parseParams("?widget-qa&data=fixtures").data).toBe("fixtures");
    expect(parseParams("?widget-qa&data=live").data).toBe("live");
    expect(serializeParams(DEFAULT_STATE)).toBe("?widget-qa");
    expect(serializeParams({ ...DEFAULT_STATE, data: "live" })).toBe("?widget-qa&data=live");
  });

  it("round-trips stress data, the grid and the noted filter, and falls back to fixtures on an unknown source", () => {
    const state = parseParams("?widget-qa&data=stress&grid=1&noted=1");
    expect(state).toMatchObject({ data: "stress", grid: true, noted: true });
    expect(serializeParams(state)).toBe("?widget-qa&data=stress&grid=1&noted=1");
    expect(parseParams("?widget-qa&data=bogus").data).toBe("fixtures");
  });

  it("round-trips the worn Look, its variant, the effects level, the script, the flagged filter and the surfaces", () => {
    const state = parseParams("?widget-qa&look=cyberspec&lookVariant=crimson&fx=calm&script=0&flagged=1&surfaces=0");
    expect(state).toMatchObject({ look: "cyberspec", lookVariant: "crimson", fx: "calm", script: false, flagged: true, surfaces: false });
    expect(serializeParams(state)).toBe("?widget-qa&look=cyberspec&lookVariant=crimson&fx=calm&script=0&flagged=1&surfaces=0");
    // the defaults: no Look, the screen's level, the script on, every widget and the surfaces shown
    expect(parseParams("?widget-qa&fx=bogus")).toMatchObject({ look: "", fx: "", script: true, flagged: false, surfaces: true });
    expect(frameRef({ ...DEFAULT_STATE, look: "cyberspec", lookVariant: "ice", fx: "off" }, "Clock", "2x1", "/").text.split("\n")[0]).toBe("Clock 2x1 (cell 110, skin default, look cyberspec/ice, fx off)");
  });

  it("copies a frame as its name, its look and a link that opens the widget alone at that frame", () => {
    const ref = frameRef({ ...DEFAULT_STATE, skin: "cyber", variant: "studio", q: "agent" }, "CodingAgents", "view:summary", "http://127.0.0.1:3922/");
    expect(ref.url).toBe("http://127.0.0.1:3922/?widget-qa&module=CodingAgents&skin=cyber&variant=studio#CodingAgents--view-summary");
    expect(ref.text).toBe(`CodingAgents view:summary (cell 110, skin cyber, variant studio)\n${ref.url}`);
    expect(frameRef(DEFAULT_STATE, "Clock", "2x1", "/").text.split("\n")[0]).toBe("Clock 2x1 (cell 110, skin default)");
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
