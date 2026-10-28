import { describe, expect, it } from "vitest";
import { appliedToast, paletteUsedBy, resetToast, skinToast, type AppliedOutcome } from "@/components/studio/theme-messages";

describe("the toast row", () => {
  const outcome = (o: Partial<AppliedOutcome>): AppliedOutcome => ({ replaced: false, background: false, kept: 0, widgets: 0, ...o });

  it("says what changed, the background, and the fine-tune kept; a page names where its parts come from", () => {
    expect(appliedToast("Desk", "screen", outcome({}), "MyDefault")).toEqual({ title: "Applied Desk.", sub: "Palette, skin and corners changed. Background kept." });
    expect(appliedToast("Desk", "all", outcome({ background: true, kept: 2 }), "MyDefault")).toEqual({
      title: "Applied Desk.",
      sub: "Palette, skin, corners and background changed. 2 fine-tune changes kept.",
    });
    expect(appliedToast("Desk", "page", outcome({ kept: 1 }), "MyDefault")).toEqual({
      title: "Applied Desk.",
      sub: "Skin changed. Palette, corners and background come from MyDefault. 1 fine-tune change kept.",
    });
  });

  it("says a first pick replaced the look, and the widgets that keep their own", () => {
    expect(appliedToast("Paper", "screen", outcome({ replaced: true, background: true, widgets: 3 }), "MyDefault").sub).toBe(
      "Replaced this screen's look, background included. 3 widgets keep their own look."
    );
    expect(appliedToast("Paper", "all", outcome({ replaced: true }), "MyDefault").sub).toBe("Replaced the look of All screens. Background kept.");
    expect(appliedToast("Paper", "page", outcome({ replaced: true, widgets: 1 }), "MyDefault").sub).toBe(
      "Replaced this page's look. Palette, corners and background come from MyDefault. 1 widget keeps its own look."
    );
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
