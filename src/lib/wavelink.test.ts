import { describe, expect, it } from "vitest";
import { findMeter, pctToDb } from "./wavelink";

describe("findMeter", () => {
  const mic = { left: 40, right: 40 };
  const music = { left: 30, right: 31 };
  const meters = { "input:BS33\\PCM_IN": mic, "channel:PCM_OUT_00": music };

  it("finds a meter by its own key", () => {
    expect(findMeter(meters, "channel:PCM_OUT_00")).toBe(music);
    expect(findMeter(meters, "input:BS33\\PCM_IN")).toBe(mic);
  });

  it("falls back to the input meter for old device and hardware channel keys", () => {
    expect(findMeter(meters, "device:BS33\\PCM_IN")).toBe(mic);
    expect(findMeter(meters, "channel:BS33\\PCM_IN")).toBe(mic);
  });

});

describe("pctToDb", () => {
  // Readings from Wave Link 3.4 for 1 kHz test tones at known dBFS levels
  it("maps the readings to their dBFS", () => {
    for (const [pct, db] of [
      [99.583, -0.25],
      [90, -6],
      [79.583, -12.25],
      [66.667, -20],
      [49.583, -30.25],
      [32.917, -40.25],
    ]) expect(pctToDb(pct), `${pct}`).toBeCloseTo(db, 1);
  });

  it("maps full scale to 0 dBFS", () => {
    expect(pctToDb(100)).toBe(0);
  });

});
