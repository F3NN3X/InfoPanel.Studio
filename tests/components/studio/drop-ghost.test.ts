import { describe, expect, it } from "vitest";
import { libraryItemOf, moduleDropSize } from "@/components/studio/drop-ghost";
import { DND_MIME, DND_MIME_SETTINGS } from "@/components/studio/studio-modules";

const drag = (data: Record<string, string>) => (type: string) => data[type] ?? "";
const grid = { cols: 12, rows: 6 };

describe("libraryItemOf", () => {
  it("carries a view's settings, keeping only the module's own keys", () => {
    const settings = JSON.stringify({ view: "minimal", showStats: false, nope: 1 });
    expect(libraryItemOf(drag({ [DND_MIME]: "Weather", [DND_MIME_SETTINGS]: settings }))).toEqual({ kind: "module", id: "Weather", settings: { view: "minimal", showStats: false } });
  });

  it("drops settings that do not parse or name no key, and still refuses an unknown module", () => {
    expect(libraryItemOf(drag({ [DND_MIME]: "Weather", [DND_MIME_SETTINGS]: "{oops" }))).toEqual({ kind: "module", id: "Weather" });
    expect(libraryItemOf(drag({ [DND_MIME]: "Weather", [DND_MIME_SETTINGS]: '{"nope":1}' }))).toEqual({ kind: "module", id: "Weather" });
    expect(libraryItemOf(drag({ [DND_MIME]: "NoSuchWidget", [DND_MIME_SETTINGS]: '{"view":"x"}' }))).toBeNull();
  });
});

describe("moduleDropSize", () => {
  it("takes the named view's size, else the widget's", () => {
    expect(moduleDropSize("GameSpotlight", grid, { spotlightLayout: "ticker" })).toEqual({ cols: 4, rows: 1 });
    expect(moduleDropSize("GameSpotlight", grid)).toEqual({ cols: 4, rows: 2 });
  });
});
