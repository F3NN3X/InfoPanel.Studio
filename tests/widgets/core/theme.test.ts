import { describe, expect, it } from "vitest";
import { MATERIALS, makeSurface } from "@/looks/materials";
import { accentVars, mix, hue } from "@/widgets/core/tokens";
import { SKIN_PACKS, TEXT_VARS, resolveSurface, textVars, tone } from "@/widgets/core/theme";

describe("colour helpers", () => {
  it("mixes and rotates the accent", () => {
    expect(mix(30)).toBe("color-mix(in oklab, var(--w-accent) 30%, transparent)");
    expect(mix(15, "#1b1b1f")).toBe("color-mix(in oklab, var(--w-accent) 15%, #1b1b1f)");
    expect(hue(0)).toBe("var(--w-accent)");
    expect(hue(70)).toBe("oklch(from var(--w-accent) l c calc(h + 70))");
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
      const s = MATERIALS[name];
      const today = makeSurface(name, null);
      expect(s.origin).toBe("app");
      expect(s.colors).toEqual(today);
      expect(s.s.background).toBe(today.background);
      expect(s.s.boxShadow).toBe(`inset 0 0 0 1px ${today.ring}`);
    }
  });

  it("resolves every skin's own surface", () => {
    for (const pack of SKIN_PACKS) {
      const name = pack.skin.surface;
      if (name) expect(MATERIALS[name], `${pack.name} → ${name}`).toBeDefined();
      expect(resolveSurface("auto", pack.name)).toBe(MATERIALS[name ?? "solid"]);
    }
  });

  it("defaults to glass, studio for an auto studio variant", () => {
    expect(resolveSurface(undefined, "default")).toBe(MATERIALS.glass);
    expect(resolveSurface("", "ios")).toBe(MATERIALS.glass);
    expect(resolveSurface("nope", "default")).toBe(MATERIALS.glass);
    expect(resolveSurface("auto", "default", true)).toBe(MATERIALS.studio);
    expect(resolveSurface("auto", "ios", true)).toBe(MATERIALS.ios);
    expect(resolveSurface("auto", "unknown-skin")).toBe(MATERIALS.solid);
    expect(resolveSurface("neon", "default")).toBe(MATERIALS.neon);
  });
});

describe("textVars", () => {
  it("sets light text on dark surfaces and dark text on light ones", () => {
    expect(textVars("dark")).toEqual({ "--w-fg": "#f4f4f5", "--w-muted": "#a1a1aa", "--w-faint": "#8a8a94", "--w-track": "rgba(255,255,255,.07)" });
    expect(textVars("light")).toEqual(TEXT_VARS.light);
    expect(TEXT_VARS.light["--w-fg"]).toBe("#18181b");
  });

});

describe("accentVars", () => {
  it("sets the colour as --w-accent only, never as --accent", () => {
    expect(accentVars("#ff0000")).toEqual({ "--w-accent": "#ff0000" });
  });
});
