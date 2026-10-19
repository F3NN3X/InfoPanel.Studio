import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLevel, levelText, nextLevels, rangeOf, ThresholdsRow, zoneWidths } from "./thresholds-control";

describe("nextLevels", () => {
  it("keeps Critical at or above Warning: the other level follows", () => {
    expect(nextLevels({ warn: 80, crit: 92 }, "warn", 95)).toEqual({ warn: 95, crit: 95 });
    expect(nextLevels({ warn: 80, crit: 92 }, "crit", 70)).toEqual({ warn: 70, crit: 70 });
    expect(nextLevels({ warn: 80, crit: 92 }, "warn", 85)).toEqual({ warn: 85, crit: 92 });
  });

  it("an Off level never pushes the other", () => {
    expect(nextLevels({ warn: "off", crit: 92 }, "crit", 10)).toEqual({ warn: "off", crit: 10 });
    expect(nextLevels({ warn: 80, crit: 92 }, "crit", "off")).toEqual({ warn: 80, crit: "off" });
  });
});

describe("levels as shown", () => {
  it("reads stored values; anything unreadable is the fallback", () => {
    expect(asLevel("off", 80)).toBe("off");
    expect(asLevel("75", 80)).toBe(75);
    expect(asLevel(undefined, 80)).toBe(80);
  });

  it("shows Off, the unit, and temperatures in °F for f", () => {
    expect(levelText("off", "load")).toBe("Off");
    expect(levelText(80, "load")).toBe("80%");
    expect(levelText(-9, "db")).toBe("-9 dB");
    // a widget's own default between steps (Audio Meter's old hot zone)
    expect(levelText(20 * Math.log10(0.9), "db")).toBe("-0.9 dB");
    expect(levelText(90, "temp")).toBe("90°C");
    expect(levelText(90, "temp", "f")).toBe("194°F");
  });

  it("the zone bar: ok to Warning, amber to Critical, red after; Off Warning has no amber", () => {
    const range = { min: 0, max: 100 };
    expect(zoneWidths({ warn: 80, crit: 90 }, range)).toEqual({ ok: 80, warn: 10, crit: 10 });
    expect(zoneWidths({ warn: "off", crit: 90 }, range)).toEqual({ ok: 90, warn: 0, crit: 10 });
    expect(zoneWidths({ warn: 80, crit: "off" }, range)).toEqual({ ok: 80, warn: 20, crit: 0 });
  });

  it("Value has no fixed range: 0 to a little past the levels", () => {
    expect(rangeOf("value", { warn: 40, crit: 60 })).toEqual({ min: 0, max: 100 });
    expect(rangeOf("value", { warn: 200, crit: 400 })).toEqual({ min: 0, max: 500 });
    expect(rangeOf("load", { warn: 1, crit: 2 })).toEqual({ min: 0, max: 100 });
  });
});

describe("ThresholdsRow", () => {
  const html = (props: Partial<Parameters<typeof ThresholdsRow>[0]> = {}) =>
    renderToStaticMarkup(<ThresholdsRow label="Temperature" quantity="temp" warn={80} crit="off" onChange={() => {}} {...props} />);

  it("draws a slider per level with its Off chip; an Off level's slider is disabled", () => {
    const out = html();
    expect(out.match(/type="range"/g)).toHaveLength(2);
    expect(out).toContain('aria-label="Critical off"');
    expect(out).toMatch(/aria-pressed="true"[^>]*aria-label="Critical off"/);
    expect(out).toMatch(/aria-label="Critical" disabled=""/);
  });

  it("shows the levels in °F for a widget in Fahrenheit", () => {
    expect(html({ tempUnit: "f" })).toContain("176°F");
  });

  it("number boxes for Value", () => {
    expect(html({ quantity: "value", warn: 50, crit: 70 }).match(/type="number"/g)).toHaveLength(2);
  });
});
