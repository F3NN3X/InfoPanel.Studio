import { describe, expect, it } from "vitest";
import { appliedToast, paletteUsedBy, resetToast, skinToast } from "@/components/studio/theme-messages";

describe("the toast row", () => {
  it("says what changed, the background, and the fine-tune kept; a page names where its parts come from", () => {
    expect(appliedToast("Desk", "screen", false, 0, "MyDefault")).toEqual({ title: "Applied Desk.", sub: "Palette, skin and corners changed. Background kept." });
    expect(appliedToast("Desk", "all", true, 2, "MyDefault")).toEqual({ title: "Applied Desk.", sub: "Palette, skin, corners and background changed. 2 fine-tune changes kept." });
    expect(appliedToast("Desk", "page", false, 1, "MyDefault")).toEqual({
      title: "Applied Desk.",
      sub: "Skin changed. Palette, corners and background come from MyDefault. 1 fine-tune change kept.",
    });
  });

  it("a page's skin and reset name where its palette, corners and background come from", () => {
    expect(skinToast("TUI", "screen", "MyDefault").sub).toBe("Colors, corners, background and fine-tune kept.");
    expect(skinToast("TUI", "page", "MyDefault").sub).toBe("Fine-tune kept. Palette, corners and background come from MyDefault.");
    expect(resetToast("Desk", "screen", "MyDefault", "MyDefault")).toEqual({
      title: "Reset to Desk.",
      sub: "Everything on MyDefault now matches the theme, including its background.",
    });
    expect(resetToast("Desk", "page", "Gaming", "MyDefault").sub).toBe("Everything on Gaming now matches the theme. Palette, corners and background come from MyDefault.");
  });

  it("a saved palette's line names who uses it", () => {
    expect(paletteUsedBy(["Desk look", "All screens"])).toBe("Used by Desk look and All screens");
    expect(paletteUsedBy([])).toBe("Not in use");
  });
});
