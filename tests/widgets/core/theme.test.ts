import { describe, expect, it } from "vitest";
import { makeSurface } from "@/components/surfaces";
import { mix, hue } from "@/widgets/core/tokens";
import { LEGACY_SURFACES } from "@/widgets/core/surfaces";
import { SKIN_PACKS, SURFACES, TEXT_VARS, resolveSurface, textVars, tone } from "@/widgets/core/theme";

describe("colour helpers", () => {
  it("mixes and rotates the accent", () => {
    expect(mix(30)).toBe("color-mix(in oklab, var(--accent) 30%, transparent)");
    expect(mix(15, "#1b1b1f")).toBe("color-mix(in oklab, var(--accent) 15%, #1b1b1f)");
    expect(hue(0)).toBe("var(--accent)");
    expect(hue(70)).toBe("oklch(from var(--accent) l c calc(h + 70))");
  });

  it("grades a value against warn / crit", () => {
    expect(tone(50, 70, 90)).toBe("ok");
    expect(tone(70, 70, 90)).toBe("warn");
    expect(tone(95, 70, 90)).toBe("crit");
    expect(tone(NaN, 70, 90)).toBe("ok");
    expect(tone(95)).toBe("ok");
  });
});

describe("surface registry", () => {
  it("keeps the app's materials with today's output", () => {
    for (const name of ["glass", "matte-light", "matte-dark", "theme"] as const) {
      const s = SURFACES[name];
      const today = makeSurface(name, null);
      expect(s).toBe(LEGACY_SURFACES[name]);
      expect(s.colors).toEqual(today);
      expect(s.s.background).toBe(today.background);
      expect(s.s.boxShadow).toBe(`inset 0 0 0 1px ${today.ring}`);
    }
  });

  it("resolves every skin's own surface", () => {
    for (const pack of SKIN_PACKS) {
      const name = pack.skin.surface;
      if (name) expect(SURFACES[name], `${pack.name} → ${name}`).toBeDefined();
      expect(resolveSurface("auto", pack.name)).toBe(SURFACES[name ?? "solid"]);
    }
  });

  it("defaults to glass, studio for an auto studio variant", () => {
    expect(resolveSurface(undefined, "default")).toBe(SURFACES.glass);
    expect(resolveSurface("", "ios")).toBe(SURFACES.glass);
    expect(resolveSurface("nope", "default")).toBe(SURFACES.glass);
    expect(resolveSurface("auto", "default", true)).toBe(SURFACES.studio);
    expect(resolveSurface("auto", "ios", true)).toBe(SURFACES.ios);
    expect(resolveSurface("auto", "unknown-skin")).toBe(SURFACES.solid);
    expect(resolveSurface("neon", "default")).toBe(SURFACES.neon);
  });
});

describe("textVars", () => {
  it("sets light text on dark surfaces and dark text on light ones", () => {
    expect(textVars("dark")).toEqual({ "--w-fg": "#f4f4f5", "--w-muted": "#a1a1aa", "--w-faint": "#8a8a94", "--w-track": "rgba(255,255,255,.07)" });
    expect(textVars("light")).toEqual(TEXT_VARS.light);
    expect(TEXT_VARS.light["--w-fg"]).toBe("#18181b");
  });

});
