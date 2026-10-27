import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import { THEME_PRESETS } from "@/lib/theme";
import { builtinItems, configItems, isBuiltinItem } from "@/lib/my-library/config-items";
import { panelPresets } from "@/lib/panelPresets";
import { SKIN_PACKS } from "@/widgets/core/theme";
import {
  buildIndex,
  cardTag,
  collectionCounts,
  collectionItems,
  flagOf,
  hintOf,
  isConfigItem,
  sortItems,
  usedByScreen,
} from "@/lib/my-library/model";

const config = {
  panelPresets: [],
  stylePresets: [{ id: "s1", name: "Hot readout", settings: {} }],
  appearancePresets: [{ id: "t1", name: "Night shift", description: "", theme: "ocean" as const, radius: 0.5, style: {} }],
};

const file = (over: Partial<LibraryItem>): LibraryItem => ({
  id: "lib_1",
  kind: "image",
  name: "bg.png",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  files: [`${"a".repeat(64)}.png`],
  meta: {},
  copies: [],
  ...over,
});

describe("configItems", () => {
  const items = configItems(config);

  it("shows saved Themes and Styles with the built-in palettes and Styles", () => {
    expect(items.filter((i) => i.kind === "theme").map((i) => i.name)).toEqual(["Night shift", ...THEME_PRESETS.map((t) => t.label)]);
    expect(items.filter((i) => i.kind === "style").map((i) => i.name)).toEqual(["Hot readout", ...BUILTIN_STYLES.map((s) => s.name)]);
  });

  it("gives a theme card its swatches, and carries a Style's settings as data", () => {
    const theme = items.find((i) => i.name === "Night shift")!;
    expect(theme.meta.swatch).toHaveLength(3);
    expect(items.find((i) => i.name === "Dark")?.data).toMatchObject({ settings: { surface: "matte-dark" } });
  });

  it("are all read-only stand-ins: never removed from the Library, never flagged Unused", () => {
    const index = buildIndex(items);
    for (const item of items) {
      expect(isConfigItem(item)).toBe(true);
      expect(flagOf(item, index)).toBeNull();
    }
    expect(isConfigItem(file({}))).toBe(false);
  });

  it("tags the built-ins muted and the rest by what they are", () => {
    expect(cardTag(items.find((i) => i.name === "Zinc")!)).toEqual({ text: "Built-in", builtin: true });
    expect(cardTag(items.find((i) => i.name === "Hot readout")!)).toEqual({ text: "Saved", builtin: false });
    expect(cardTag(file({ kind: "video" }))).toEqual({ text: "Video", builtin: false });
    expect(cardTag(file({ kind: "canvas" }))).toEqual({ text: "Imported", builtin: false });
  });
});

describe("builtinItems", () => {
  const look = { id: "glass:ice", name: "Glass · Ice", description: "", theme: "ocean" as const, radius: 0.75, style: {} };
  const template = { id: "general", name: "General", size: { width: 1920, height: 1080 } } as never;

  it("lists every skin and built-in panel, then the looks and templates once their catalog loads", () => {
    const now = builtinItems();
    expect(now.filter((i) => i.kind === "skin")).toHaveLength(SKIN_PACKS.length);
    expect(now.filter((i) => i.kind === "panel")).toHaveLength(panelPresets.length);
    expect(now.some((i) => i.kind === "template" || i.kind === "theme")).toBe(false);
    const later = builtinItems({ looks: [look], templates: [template] });
    expect(later.find((i) => i.kind === "theme")).toMatchObject({ name: "Glass · Ice", data: look });
    expect(later.find((i) => i.kind === "template")).toMatchObject({ name: "General", meta: { width: 1920, height: 1080 } });
  });

  it("sort below the user's own items and the palettes, each catalog in its own order", () => {
    const all = sortItems([...configItems(config), ...builtinItems({ looks: [look, { ...look, id: "glass:b", name: "Glass · B" }] })], "recent");
    const themes = all.filter((i) => i.kind === "theme").map((i) => i.name);
    expect(themes.slice(0, -2).sort()).toEqual(["Night shift", ...THEME_PRESETS.map((t) => t.label)].sort());
    expect(themes.slice(-2)).toEqual(["Glass · Ice", "Glass · B"]);
    expect(all.filter((i) => i.kind === "skin")[0].id).toBe(`builtin-skin:${SKIN_PACKS[0].name}`);
  });

  it("are built-ins: tagged so, never flagged Not used, sorted into their own collections", () => {
    const items = builtinItems({ looks: [look], templates: [template] });
    const index = buildIndex(items);
    for (const item of items) {
      expect(isBuiltinItem(item)).toBe(true);
      expect(isConfigItem(item)).toBe(true);
      expect(cardTag(item)).toEqual({ text: "Built-in", builtin: true });
      expect(flagOf(item, index)).toBeNull();
    }
    const counts = collectionCounts(index);
    expect(counts.skins).toBe(SKIN_PACKS.length);
    expect(counts.templates).toBe(1);
    expect(counts.themes).toBe(1);
    expect(counts.unused).toBe(0);
  });

  it("gives a skin the widget style Theme › Start from writes", () => {
    const tui = builtinItems().find((i) => i.id === "builtin-skin:tui")!;
    expect(tui.name).toBe("TUI");
    expect(tui.data).toMatchObject({ settings: { skin: "tui", surface: "auto" } });
  });
});

describe("type collections", () => {
  const items = [...configItems(config), file({ id: "i", kind: "image" }), file({ id: "v", kind: "video" }), file({ id: "s", kind: "svg" }), file({ id: "f", kind: "font" })];
  const index = buildIndex(items);

  it("counts Themes, and Media as every image, video and SVG", () => {
    const counts = collectionCounts(index);
    expect(counts.themes).toBe(1 + THEME_PRESETS.length);
    expect(counts.styles).toBe(1 + BUILTIN_STYLES.length);
    expect(counts.media).toBe(3);
    expect(counts.fonts).toBe(1);
    expect(collectionItems("media", index).map((i) => i.id)).toEqual(["i", "v", "s"]);
  });

  it("gives each type collection its hint, and a Media sub-kind Media's", () => {
    expect(hintOf("themes")).toBe("A Theme is a whole look. Apply one in Theme at any scope.");
    expect(hintOf("videos")).toBe(hintOf("media"));
    expect(hintOf("recent")).toBeUndefined();
  });
});

describe("usedByScreen", () => {
  it("keeps what has a placed copy in the screen, and none of the stand-ins", () => {
    const a = file({ id: "a", copies: [{ profileId: "bar" }] });
    const b = file({ id: "b", copies: [{ profileId: "panel" }, { profileId: "bar" }] });
    const c = file({ id: "c", copies: [{ profileId: "panel" }] });
    const used = usedByScreen([a, b, c, ...configItems(config)], "bar");
    expect(used.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
