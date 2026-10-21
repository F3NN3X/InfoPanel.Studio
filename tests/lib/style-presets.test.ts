import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { deleteStylePreset, duplicateStylePreset, matchingStyle, renameStylePreset, updateStylePreset } from "@/lib/style-presets";

const config = (): DashboardConfig => ({
  ...defaultConfig(),
  stylePresets: [
    { id: "a", name: "Glassy", settings: { surface: "glass" } },
    { id: "b", name: "Glassy red", settings: { surface: "glass", accent: "#f00" } },
    { id: "c", name: "Nothing", settings: {} },
  ],
});

describe("updateStylePreset", () => {
  it("overwrites the settings in place, keeping the id, name and the other Styles", () => {
    const next = updateStylePreset(config(), "a", { surface: "matte-dark", radius: "8" });
    expect(next.stylePresets![0]).toEqual({ id: "a", name: "Glassy", settings: { surface: "matte-dark", radius: "8" } });
    expect(next.stylePresets!.slice(1)).toEqual(config().stylePresets!.slice(1));
  });

  it("does not hold on to the settings object it was given", () => {
    const settings = { surface: "glass" };
    const next = updateStylePreset(config(), "a", settings);
    expect(next.stylePresets![0].settings).not.toBe(settings);
  });
});

describe("renameStylePreset / duplicateStylePreset / deleteStylePreset", () => {
  it("renames one Style", () => {
    expect(renameStylePreset(config(), "b", "Red").stylePresets!.map((p) => p.name)).toEqual(["Glassy", "Red", "Nothing"]);
  });

  it("duplicates right after the original with its own settings object", () => {
    const next = duplicateStylePreset(config(), "a", "a2").stylePresets!;
    expect(next.map((p) => [p.id, p.name])).toEqual([["a", "Glassy"], ["a2", "Glassy copy"], ["b", "Glassy red"], ["c", "Nothing"]]);
    expect(next[1].settings).toEqual(next[0].settings);
    expect(next[1].settings).not.toBe(next[0].settings);
  });

  it("deletes one, and the last leaves no list", () => {
    expect(deleteStylePreset(config(), "a").stylePresets!.map((p) => p.id)).toEqual(["b", "c"]);
    const one = { ...config(), stylePresets: [{ id: "a", name: "A", settings: { surface: "glass" } }] };
    expect(deleteStylePreset(one, "a").stylePresets).toBeUndefined();
  });
});

describe("matchingStyle", () => {
  const list = config().stylePresets!;

  it("finds the Style whose keys the look holds, the most specific first", () => {
    expect(matchingStyle(list, { surface: "glass" })?.id).toBe("a");
    expect(matchingStyle(list, { surface: "glass", accent: "#f00", radius: "4" })?.id).toBe("b");
  });

  it("matches nothing for a different value, or for a Style with no keys", () => {
    expect(matchingStyle(list, { surface: "matte-dark" })).toBeUndefined();
    expect(matchingStyle([list[2]], { surface: "glass" })).toBeUndefined();
  });
});
