import { describe, expect, it } from "vitest";
import {
  GENERAL_DEFAULTS,
  fontStack,
  formatClock,
  isSupportedLocale,
  normalizeGeneral,
  resolveFont,
  resolveGeneral,
  withGeneral,
} from "@/lib/general";

describe("resolveGeneral", () => {
  it("fills the defaults", () => {
    expect(resolveGeneral({})).toEqual(GENERAL_DEFAULTS);
    expect(GENERAL_DEFAULTS.hour12).toBeUndefined();
    expect(GENERAL_DEFAULTS.showSeconds).toBe(true);
  });

  it("keeps the set keys over the defaults, the 12-hour switch from the app's clock (config v16)", () => {
    const g = resolveGeneral({ general: { locale: "de-DE", clock: "12" } });
    expect(g).toMatchObject({ font: "system", hour12: true, motion: "system", showSeconds: true, locale: "de-DE" });
    expect(g).not.toHaveProperty("clock");
    expect(resolveGeneral({ general: { clock: "24" } }).hour12).toBe(false);
    expect(resolveGeneral({ general: {} }).hour12).toBeUndefined();
  });

  it("adds a screen's page font and performance over the defaults", () => {
    const g = resolveGeneral({ general: { showSeconds: false } }, { font: "serif", performance: { maxFps: 15, motion: "reduce", blurLimit: false } });
    expect(g).toMatchObject({ font: "serif", maxFps: 15, motion: "reduce", blurLimit: false, ringGlide: false, showSeconds: false });
    expect(resolveGeneral({}, {})).toEqual(GENERAL_DEFAULTS);
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

describe("kioskRefresh", () => {
  it("defaults to daily and is kept only as a valid choice", () => {
    expect(GENERAL_DEFAULTS.kioskRefresh).toBe("daily");
    expect(resolveGeneral({}).kioskRefresh).toBe("daily");
    expect(resolveGeneral({ general: { kioskRefresh: "off" } }).kioskRefresh).toBe("off");
    expect(normalizeGeneral({ kioskRefresh: "off" })).toEqual({ kioskRefresh: "off" });
    for (const bad of ["weekly", "", 1, null, true]) expect(normalizeGeneral({ kioskRefresh: bad })).toBeUndefined();
  });
});

describe("rendering options and maxFps (each screen's since config v16)", () => {
  it("default ringGlide, innerBlur and liveGlow off, blurLimit on and 60 fps", () => {
    expect(GENERAL_DEFAULTS).toMatchObject({ ringGlide: false, blurLimit: true, innerBlur: false, liveGlow: false, maxFps: 60 });
  });

  it("are no longer kept in the app settings", () => {
    expect(normalizeGeneral({ maxFps: 15, motion: "full", ringGlide: true, blurLimit: false, font: "mono" })).toBeUndefined();
  });
});

describe("clock", () => {
  it("is kept only as 12 or 24", () => {
    expect(normalizeGeneral({ clock: "12" })).toEqual({ clock: "12" });
    expect(normalizeGeneral({ clock: "24" })).toEqual({ clock: "24" });
    for (const bad of ["auto", 12, true, null]) expect(normalizeGeneral({ clock: bad })).toBeUndefined();
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
    // The 12 / 24 h switch moved into the themed clock (config v7), then `clock` (v16): a stored `hour12` is not kept here.
    expect(normalizeGeneral({ showSeconds: true, hour12: false })).toEqual({ showSeconds: true });
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
    const g = withGeneral(undefined, "locale", "de-DE");
    expect(g).toEqual({ locale: "de-DE" });
    expect(withGeneral(g, "clock", "24")).toEqual({ locale: "de-DE", clock: "24" });
    expect(withGeneral(g, "locale", undefined)).toBeUndefined();
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

describe("resolveFont", () => {
  it("takes the screen's own page font, else the built-in one (SPEC §11.1)", () => {
    expect(resolveFont({ font: "geist" })).toBe("geist");
    expect(resolveFont({})).toBe("system");
    expect(resolveFont()).toBe("system");
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
