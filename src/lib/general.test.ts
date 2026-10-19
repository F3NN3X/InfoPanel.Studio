import { describe, expect, it } from "vitest";
import {
  GENERAL_DEFAULTS,
  fontStack,
  formatClock,
  isSupportedLocale,
  normalizeGeneral,
  resolveGeneral,
  withGeneral,
} from "./general";

describe("resolveGeneral", () => {
  it("fills the defaults", () => {
    expect(resolveGeneral({})).toEqual(GENERAL_DEFAULTS);
    expect(GENERAL_DEFAULTS.hour12).toBeUndefined();
    expect(GENERAL_DEFAULTS.showSeconds).toBe(true);
  });

  it("keeps the set keys over the defaults, the 12-hour switch from the style's clock (config v7)", () => {
    const g = resolveGeneral({ general: { font: "serif", motion: "reduce" }, style: { clock: "12" } });
    expect(g).toMatchObject({ font: "serif", hour12: true, motion: "reduce", showSeconds: true, locale: "" });
    expect(resolveGeneral({ style: { clock: "24" } }).hour12).toBe(false);
    expect(resolveGeneral({ style: { clock: "auto" } }).hour12).toBeUndefined();
  });
});

describe("kioskPageNav", () => {
  it("defaults off and is kept only as a boolean", () => {
    expect(GENERAL_DEFAULTS.kioskPageNav).toBe(false);
    expect(resolveGeneral({ general: { kioskPageNav: true } }).kioskPageNav).toBe(true);
    expect(normalizeGeneral({ kioskPageNav: true })).toEqual({ kioskPageNav: true });
    expect(normalizeGeneral({ kioskPageNav: "yes" })).toBeUndefined();
  });
});

describe("normalizeGeneral", () => {
  it("drops non-objects and empty results", () => {
    expect(normalizeGeneral(undefined)).toBeUndefined();
    expect(normalizeGeneral("serif")).toBeUndefined();
    expect(normalizeGeneral([])).toBeUndefined();
    expect(normalizeGeneral({})).toBeUndefined();
  });

  it("keeps valid keys and drops invalid ones", () => {
    expect(
      normalizeGeneral({
        font: "comic",
        hour12: "yes",
        showSeconds: false,
        locale: " de-DE ",
        motion: "fast",
        hideCursor: true,
        extra: 1,
      })
    ).toEqual({ showSeconds: false, locale: "de-DE", hideCursor: true });
    // The 12 / 24 h switch moved into the themed clock (config v7): a stored one is not kept here.
    expect(normalizeGeneral({ font: "mono", motion: "full", hour12: false })).toEqual({
      font: "mono",
      motion: "full",
    });
  });

  it("validates the locale", () => {
    expect(normalizeGeneral({ locale: "not a locale!" })).toBeUndefined();
    expect(normalizeGeneral({ locale: "" })).toEqual({ locale: "" });
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("")).toBe(true);
    expect(isSupportedLocale("##")).toBe(false);
  });
});

describe("withGeneral", () => {
  it("sets a key and clears it back to the default", () => {
    const g = withGeneral(undefined, "font", "serif");
    expect(g).toEqual({ font: "serif" });
    expect(withGeneral(g, "motion", "full")).toEqual({ font: "serif", motion: "full" });
    expect(withGeneral(g, "font", undefined)).toBeUndefined();
  });
});

describe("fontStack", () => {
  it("leaves the system font to the page", () => {
    expect(fontStack("system")).toBeUndefined();
    expect(fontStack("mono")).toContain("monospace");
  });

  it("resolves catalog web fonts with a fallback", () => {
    expect(fontStack("inter")).toMatch(/^.Inter., .*sans-serif$/);
  });
});

describe("formatClock", () => {
  const at = new Date(2026, 9, 12, 15, 4, 5);

  it("formats 24 h with seconds and 12 h without", () => {
    expect(formatClock(at, { hour12: false, showSeconds: true, locale: "en-GB" }).time).toBe("15:04:05");
    const twelve = formatClock(at, { hour12: true, showSeconds: false, locale: "en-US" }).time;
    expect(twelve).toMatch(/^03:04\sPM$/);
  });

  it("formats the date in the chosen locale", () => {
    expect(formatClock(at, { hour12: undefined, showSeconds: true, locale: "de-DE" }).date).toBe("Mo., 12.10.2026");
    expect(formatClock(at, { hour12: undefined, showSeconds: true, locale: "en-US" }).date).toBe("Mon, 10/12/2026");
  });
});
