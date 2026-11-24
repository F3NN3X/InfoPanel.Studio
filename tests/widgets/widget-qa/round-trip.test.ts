import { describe, expect, it } from "vitest";
import { diffSnapshots, type QaSnapshot } from "@/widgets/widget-qa/round-trip";

const snap = (over: Partial<QaSnapshot> = {}): QaSnapshot => ({
  colours: { "Clock 2x2|0|color": "rgb(1, 2, 3)", "Clock 2x2|1|color": "rgb(4, 5, 6)", "Fans 2x2|0|fill": "rgb(0, 0, 0)" },
  vars: { "root|--wp-pack-motion": "none" },
  sheets: ["style data-pack=classic"],
  attrs: { "root|class": "dark" },
  ...over,
});

describe("the switch round trip", () => {
  it("finds nothing when the page came back as the fresh load had it", () => {
    expect(diffSnapshots(snap(), snap())).toEqual({ colours: [], vars: [], attrs: [], sheets: [] });
  });

  it("lists the colours, properties, attributes and sheets that stayed, and leaves out what moves on its own", () => {
    const fresh = snap();
    // the Fans spinner's colour moves between two fresh snapshots: it is not counted
    const still = snap({ colours: { ...fresh.colours, "Fans 2x2|0|fill": "rgb(9, 9, 9)" } });
    const after = snap({
      colours: { ...fresh.colours, "Clock 2x2|1|color": "rgb(255, 59, 69)", "Fans 2x2|0|fill": "rgb(1, 1, 1)" },
      vars: { "root|--wp-pack-motion": "none", "root|--w-accent": "#FF3B45" },
      sheets: ["style data-pack=classic", "style data-pack=cyberspec"],
      attrs: { "root|class": "dark", "root|data-lite-motion": "" },
    });
    expect(diffSnapshots(fresh, after, still)).toEqual({
      colours: [{ frame: "Clock 2x2", changed: 1, sample: ["#1 color: rgb(4, 5, 6) -> rgb(255, 59, 69)"] }],
      vars: ["root|--w-accent: (none) -> #FF3B45"],
      attrs: ["root|data-lite-motion: (none) -> "],
      sheets: ["+ style data-pack=cyberspec"],
    });
  });
});
