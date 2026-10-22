import { describe, expect, it } from "vitest";
import { parseDensity, parseLeftPanelWidth, widthFromPx } from "@/components/studio/add-prefs";

describe("Left panel width migration", () => {
  it("moves an old pixel width to the nearest option", () => {
    expect(widthFromPx("232")).toBe("narrow");
    expect(widthFromPx("319")).toBe("narrow");
    expect(widthFromPx("320")).toBe("default");
    expect(widthFromPx("359")).toBe("default");
    expect(widthFromPx("360")).toBe("wide");
    expect(widthFromPx("440")).toBe("wide");
  });

  it("is Default with nothing (or junk) stored", () => {
    expect(widthFromPx(null)).toBe("default");
    expect(widthFromPx("wide-ish")).toBe("default");
  });

  it("prefers a stored option over the old pixel width", () => {
    expect(parseLeftPanelWidth("wide", "240")).toBe("wide");
    expect(parseLeftPanelWidth("huge", "240")).toBe("narrow");
    expect(parseLeftPanelWidth(null, null)).toBe("default");
  });
});

describe("Widget list density", () => {
  it("is Comfortable unless Compact is stored", () => {
    expect(parseDensity("compact")).toBe("compact");
    expect(parseDensity(null)).toBe("comfortable");
    expect(parseDensity("dense")).toBe("comfortable");
  });
});
