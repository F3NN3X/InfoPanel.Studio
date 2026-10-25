import { describe, expect, it } from "vitest";
import { clampGlowRadius, glowFromInfoPanel, glowToInfoPanel } from "@/lib/effects/glow";

describe("glow", () => {
  it("keeps the radius in InfoPanel's 2-20 and falls back for junk", () => {
    expect([clampGlowRadius(0), clampGlowRadius(7.6), clampGlowRadius(99)]).toEqual([2, 8, 20]);
    expect([clampGlowRadius("x"), clampGlowRadius(NaN), clampGlowRadius(undefined, 5)]).toEqual([8, 8, 5]);
  });

  it("round-trips through the Text/Value fields", () => {
    const fields = glowToInfoPanel({ radius: 12, color: "#FF22D3EE" });
    expect(fields).toEqual({ GlowEnabled: true, GlowRadius: 12, GlowColor: "#FF22D3EE" });
    expect(glowFromInfoPanel(fields)).toEqual({ radius: 12, color: "#FF22D3EE" });
    expect(glowToInfoPanel(null)).toEqual({ GlowEnabled: false });
    expect(glowFromInfoPanel({ GlowEnabled: false, GlowRadius: 12 })).toBeNull();
  });
});
