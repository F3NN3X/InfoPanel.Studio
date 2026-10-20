import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, normalizeThemePatch, resolveTheme, themeVars } from "@/lib/theme";

describe("resolveTheme", () => {
  const config = { theme: DEFAULT_THEME, radius: 0.5 };

  it("is the dashboard's theme without a profile theme", () => {
    expect(resolveTheme(config)).toEqual({ tokens: DEFAULT_THEME, radius: 0.5 });
    expect(resolveTheme(config, {}).tokens).toBe(DEFAULT_THEME);
  });

  it("lays a profile's own colours and radius over it", () => {
    const t = resolveTheme(config, { theme: { background: "0 0% 100%" }, radius: 1 });
    expect(t.tokens).toEqual({ ...DEFAULT_THEME, background: "0 0% 100%" });
    expect(t.radius).toBe(1);
    expect(resolveTheme(config, { radius: 0 }).radius).toBe(0);
  });
});

describe("normalizeThemePatch", () => {
  it("keeps token strings only", () => {
    expect(normalizeThemePatch({ card: "0 0% 0%", bogus: "x", ring: 4 })).toEqual({ card: "0 0% 0%" });
    expect(normalizeThemePatch({})).toBeUndefined();
    expect(normalizeThemePatch("paper")).toBeUndefined();
  });
});

describe("themeVars", () => {
  it("writes each token and the radius as CSS variables", () => {
    const vars = themeVars(DEFAULT_THEME, 0.75);
    expect(vars["--background"]).toBe(DEFAULT_THEME.background);
    expect(vars["--card-foreground"]).toBe(DEFAULT_THEME["card-foreground"]);
    expect(vars["--radius"]).toBe("0.75rem");
  });
});
