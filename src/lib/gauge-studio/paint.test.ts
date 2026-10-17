import { describe, expect, it } from "vitest";
import { customOf, follows, followOf, THEME_COLORS } from "./paint";

describe("paint", () => {
  it("lists the widget theme colours", () => {
    expect(THEME_COLORS).toEqual(["accent", "warn", "crit", "fg", "muted", "track"]);
  });

  it("starts a custom colour from the theme colour's own value, white for a translucent one", () => {
    expect(customOf("accent")).toBe("#34D399");
    expect(customOf("track")).toBe("#FFFFFF");
    expect(customOf("#123456")).toBe("#123456");
  });

  it("follows the accent when a fixed colour turns to the theme, and keeps a theme colour", () => {
    expect(followOf("#123456")).toBe("accent");
    expect(followOf("crit")).toBe("crit");
    expect([follows("fg"), follows("#FFFFFF")]).toEqual([true, false]);
  });
});
