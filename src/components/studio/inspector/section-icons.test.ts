import { SlidersHorizontal } from "lucide-react";
import { describe, expect, it } from "vitest";
import { sectionIcon, sectionShort } from "./section-icons";

describe("section icons and short labels", () => {
  it("names the shared sections, also under Global style or split across tabs", () => {
    expect(sectionShort({ id: "colors", title: "Colors" })).toBe("Colors");
    expect(sectionShort({ id: "gs-spacing", title: "Size & spacing" })).toBe("Spacing");
    expect(sectionShort({ id: "fit@data", title: "Fit" })).toBe("Fit");
    expect(sectionIcon({ id: "gs-colors" })).toBe(sectionIcon({ id: "colors" }));
  });

  it("uses the sheet's short labels for the sections of the four tabs", () => {
    const shorts = ["header", "fit", "skin", "colors", "palette", "surface", "type", "spacing", "border", "css", "format", "thresholds", "motion", "island"].map(
      (id) => sectionShort({ id, title: "Untitled section" })
    );
    expect(shorts).toEqual(["Header", "Fit", "Skin", "Colors", "Widget", "Surface", "Type", "Spacing", "Border", "CSS", "Format", "Alerts", "Motion", "Island"]);
  });

  it("falls back to a generic icon and the title's first word", () => {
    expect(sectionIcon({ id: "m-now-playing" })).toBe(SlidersHorizontal);
    expect(sectionShort({ id: "m-now-playing", title: "Now playing" })).toBe("Now");
    expect(sectionShort({ id: "m-x", title: "Cover & art" })).toBe("Cover");
  });
});
