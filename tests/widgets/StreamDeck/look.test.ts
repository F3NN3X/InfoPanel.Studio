import { describe, expect, it } from "vitest";
import { frameSurface, keyLook, keyRadius, pressedOf, scalePx, type IconOverlay } from "@/widgets/StreamDeck/look";
import { skinContext } from "@/widgets/core/look";

const pane = { className: "pane-class", style: { background: "red", boxShadow: "0 0 1px red" } };
const look = (style: string, skin = "default", o: { size?: number; overlay?: IconOverlay; strength?: number } = {}) =>
  keyLook({ style, frame: "thin", overlay: o.overlay ?? "skin", strength: o.strength ?? 100, size: o.size ?? 80, skin: skinContext(skin), pane });

describe("keyLook", () => {
  it("draws the plain key, with no frame or edge, for plain and for a surface name it doesn't know", () => {
    for (const style of ["plain", "gone-surface"]) {
      const l = look(style);
      expect(l.className).toBe("bg-white/[0.06]");
      expect(l.inset).toBe(0);
      expect(l.overlay).toBeNull();
    }
    expect(look("plain", "default", { overlay: "sheen" }).overlay).not.toBeNull();
  });

  it("takes the skin's own card on auto, scaling its chamfer to the key", () => {
    const l = look("auto", "cyber");
    expect(l.style.clipPath).toBe("polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px))");
    expect(l.inset).toBe(4);
    expect(l.overlay?.style.clipPath).toBe(l.style.clipPath);
    expect(l.overlay?.style.background).toBeUndefined();
  });

  it("never blurs the icon: only the surface's border classes go over it", () => {
    const l = look("auto", "macos");
    expect(l.className).toContain("backdrop-blur");
    expect(l.overlay?.className).toBe("border border-white/[0.08]");
  });

  it("keeps a surface's own size off the key, so it fills its grid cell", () => {
    const l = look("auto", "brutal");
    expect(l.style.width).toBeUndefined();
    expect(l.style.height).toBeUndefined();
  });

  it("gives an edgeless card an accent ring, and scales the overlay by its strength", () => {
    expect(look("auto", "tui").overlay?.style.boxShadow).toContain("inset 0 0 0 1px");
    expect(look("auto", "macos", { overlay: "glow", strength: 40 }).overlay?.style.opacity).toBe(0.4);
    expect(look("auto", "macos", { strength: 0 }).overlay).toBeNull();
    expect(look("auto", "macos", { overlay: "none" }).overlay).toBeNull();
  });

  it("takes the widget's surface on widget, leaving its text colours to the widget", () => {
    const l = look("widget");
    expect(l.className).toBe("pane-class");
    expect(l.style).toEqual(pane.style);
  });

  it("sets the text colours of a light surface on the key", () => {
    const l = look("matte-light");
    expect(l.tone).toBe("light");
    expect((l.style as Record<string, string>)["--w-fg"]).toBe("#18181b");
  });
});

describe("the widget frame", () => {
  it("keeps a surface picked by name and drops one only the skin brought in", () => {
    expect(frameSurface("neon")).toBe("neon");
    expect(frameSurface("matte-light")).toBe("matte-light");
    expect(frameSurface("auto")).toBeUndefined();
    expect(frameSurface("vibrancy")).toBeUndefined();
    expect(frameSurface(undefined)).toBeUndefined();
  });
});

describe("key radius and pressed effect", () => {
  it("prefers the key's radius, then the widget's, then the skin's on its card", () => {
    const cyber = skinContext("cyber");
    expect(keyRadius({ keyRadius: 6, radius: 20, style: "auto", skin: cyber })).toBe("6px");
    expect(keyRadius({ radius: 10, style: "auto", skin: cyber })).toBe("6.2px");
    expect(keyRadius({ style: "auto", skin: cyber })).toBe("0px");
    expect(keyRadius({ style: "neon", skin: cyber })).toBe("calc(var(--radius, 1rem) * 0.62)");
  });

  it("glows on the skins that glow and dips on the rest when it follows the skin", () => {
    expect(pressedOf("skin", skinContext("nixie"))).toBe("glow");
    expect(pressedOf("skin", skinContext("default"))).toBe("dip");
    expect(pressedOf("none", skinContext("nixie"))).toBe("none");
  });

  it("scales px lengths only", () => {
    expect(scalePx("calc(100% - 18px) 0", 0.5)).toBe("calc(100% - 9px) 0");
  });
});
