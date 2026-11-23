import { describe, expect, it } from "vitest";
import { filterLooks, GALLERY_IDS, galleryLooks, lookName, lookPreset } from "@/components/studio/look-gallery-model";
import { SAMPLE_PRESET_GROUPS } from "@/lib/screen-templates/sample-presets";
import { DEFAULT_THEME } from "@/lib/theme";
import { loadLook } from "@/looks";
import type { Look } from "@/looks/look";

const SAMPLES = SAMPLE_PRESET_GROUPS.flatMap((g) => g.presets);
const all = async () => (await Promise.all(GALLERY_IDS.map(loadLook))).filter((l): l is Look => l !== undefined);

describe("the Look gallery", () => {
  it("lists Classic, the 13 skins and the 13 samples, never the hidden default Look", async () => {
    const list = galleryLooks(await all(), SAMPLES);
    expect(list).toHaveLength(27);
    expect(list[0].id).toBe("classic");
    expect(GALLERY_IDS).not.toContain("default");
    for (const l of list) expect(l.tags.length, l.id).toBeGreaterThan(0);
  });

  it("applies a Look's id only as widget style, with a sample's colours, corners and page", async () => {
    const list = galleryLooks(await all(), SAMPLES);
    const paper = list.find((l) => l.id === "paper")!.preset;
    const sample = SAMPLES.find((p) => p.id === "builtin:look-paper")!;
    expect(paper).toMatchObject({ id: "builtin:look-paper", style: { lookId: "paper" }, theme: sample.theme, radius: sample.radius, background: sample.background });
    expect(Object.keys(paper.style)).toEqual(["lookId"]);
    expect(lookPreset({ id: "hud", name: "HUD", description: "" })).toMatchObject({ style: { lookId: "hud" }, theme: DEFAULT_THEME });
    expect(lookPreset({ id: "hud", name: "HUD", description: "" }).background).toBeUndefined();
  });

  it("filters by tag and search", async () => {
    const list = galleryLooks(await all(), SAMPLES);
    expect(filterLooks(list, "light").map((l) => l.id)).toEqual(["field-kit", "tape-86", "paper"]);
    expect(filterLooks(list, "all", "neon").every((l) => l.tags.includes("neon") || /neon/i.test(l.name + l.description))).toBe(true);
    expect(filterLooks(list, "retro", "zzz")).toEqual([]);
  });

  it("names a Look without loading it", () => {
    expect([lookName(undefined), lookName("nope"), lookName("default"), lookName("hud"), lookName("term")]).toEqual(["Classic", "Classic", "Classic", "HUD", "Term"]);
  });
});
