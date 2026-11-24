import { describe, expect, it } from "vitest";
import { contrastOf } from "@/looks/status";
import { ownSlabVars, SLAB_INK_DEFAULT, slabTexture } from "@/looks/treatments";

describe("ownSlabVars (a layout variant's slab in its own colour)", () => {
  it("takes an ink that reads 4.5:1 on any literal colour, with the kit's scan lines", () => {
    for (const color of ["#5ef6ff", "#ffd400", "#ff3b3b", "#0b0b12", "#7a7a7a", "#808080", "#6a6a6a"]) {
      const v = ownSlabVars(color);
      expect(v["--wp-slab-accent"]).toBe(color);
      expect(contrastOf(v["--wp-slab-ink"], color) ?? 0).toBeGreaterThanOrEqual(4.5);
      expect(v["--wp-slab-tex"]).toContain("repeating-linear-gradient");
    }
    expect(ownSlabVars("#5ef6ff")["--wp-slab-tex"]).toBe(slabTexture(SLAB_INK_DEFAULT));
  });

  it("leaves a variable's ink to CSS and draws no texture", () => {
    const v = ownSlabVars("var(--w-accent)");
    expect(v["--wp-slab-ink"]).toContain("oklch(from var(--w-accent)");
    expect(v).not.toHaveProperty("--wp-slab-tex");
  });
});
