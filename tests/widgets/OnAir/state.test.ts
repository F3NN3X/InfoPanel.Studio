import { describe, expect, it } from "vitest";
import { elapsedText, ON_AIR_LABEL, onAirKind } from "@/widgets/OnAir/state";

const obs = (o: Partial<Parameters<typeof onAirKind>[0]>) => ({ configured: true, connected: true, streaming: false, recording: false, ...o });

describe("onAirKind", () => {
  it("maps the OBS flags", () => {
    expect(onAirKind(obs({ streaming: true }))).toBe("live");
    expect(onAirKind(obs({ recording: true }))).toBe("rec");
    expect(onAirKind(obs({ streaming: true, recording: true }))).toBe("both");
    expect(onAirKind(obs({}))).toBe("off");
  });

  it("is unset without a connection set up, and off while OBS is not connected, whatever the flags say", () => {
    expect(onAirKind(obs({ configured: false, connected: false }))).toBe("unset");
    expect(onAirKind(obs({ connected: false, streaming: true, recording: true }))).toBe("off");
  });

  it("words unset and off alike", () => {
    expect(ON_AIR_LABEL.unset).toBe(ON_AIR_LABEL.off);
    expect(ON_AIR_LABEL.both).toBe("LIVE + REC");
  });
});

describe("elapsedText", () => {
  it("counts minutes unless seconds are on", () => {
    expect(elapsedText(5 * 60_000 + 59_000, false)).toBe("5 min");
    expect(elapsedText(30_000, false)).toBe("Just started");
    expect(elapsedText(3_900_000, false)).toBe("1 h 05 min");
  });

  it("counts seconds, and never goes negative", () => {
    expect(elapsedText(3_725_000, true)).toBe("1:02:05");
    expect(elapsedText(-5000, true)).toBe("0:00:00");
  });
});
