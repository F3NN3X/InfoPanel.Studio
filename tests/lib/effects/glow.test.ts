import { describe, expect, it } from "vitest";
import { clampGlowRadius, glowFromInfoPanel, glowShadow, glowToInfoPanel, levelRadius } from "@/lib/effects/glow";

describe("glow", () => {
  it("keeps the radius in InfoPanel's 2-20 and falls back for junk", () => {
    expect([clampGlowRadius(0), clampGlowRadius(7.6), clampGlowRadius(99)]).toEqual([2, 8, 20]);
    expect([clampGlowRadius("x"), clampGlowRadius(NaN), clampGlowRadius(undefined, 5)]).toEqual([8, 8, 5]);
  });

  it("maps Soft and Strong to a radius, and Auto and Off to none", () => {
    expect([levelRadius("auto"), levelRadius("off"), levelRadius("soft"), levelRadius("strong")]).toEqual([null, null, 6, 12]);
  });

  it("draws a tight core and a wide halo, in the accent unless a colour is given", () => {
    expect(glowShadow(6)).toBe("0 0 3px var(--accent), 0 0 12px var(--accent)");
    expect(glowShadow(100, "#0ff")).toBe("0 0 10px #0ff, 0 0 40px #0ff");
  });

  it("round-trips through the Text/Value fields", () => {
    const fields = glowToInfoPanel({ radius: 12, color: "#FF22D3EE" });
    expect(fields).toEqual({ GlowEnabled: true, GlowRadius: 12, GlowColor: "#FF22D3EE" });
    expect(glowFromInfoPanel(fields)).toEqual({ radius: 12, color: "#FF22D3EE" });
    expect(glowToInfoPanel(null)).toEqual({ GlowEnabled: false });
    expect(glowFromInfoPanel({ GlowEnabled: false, GlowRadius: 12 })).toBeNull();
  });
});
