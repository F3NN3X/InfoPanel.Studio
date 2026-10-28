import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import { builtinItems, configItems, isBuiltinItem } from "@/lib/my-library/config-items";
import { panelPresets } from "@/lib/panelPresets";
import {
  buildIndex,
  cardTag,
  collectionCounts,
  collectionItems,
  flagOf,
  hintOf,
  isConfigItem,
  usedByScreen,
} from "@/lib/my-library/model";

const config = {
  panelPresets: [],
  stylePresets: [{ id: "s1", name: "Hot readout", settings: {} }],
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

  it("shows saved and built-in Styles, and no Theme, palette or skin", () => {
    expect(items.some((i) => ["theme", "skin", "island"].includes(i.kind))).toBe(false);
    expect(items.filter((i) => i.kind === "style").map((i) => i.name)).toEqual(["Hot readout", ...BUILTIN_STYLES.map((s) => s.name)]);
  });

  it("carries a Style's settings as data", () => {
    expect(items.find((i) => i.name === "Matte dark")?.data).toMatchObject({ settings: { surface: "matte-dark" } });
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
    expect(cardTag(items.find((i) => i.name === "Frosted")!)).toEqual({ text: "Built-in", builtin: true });
    expect(cardTag(items.find((i) => i.name === "Hot readout")!)).toEqual({ text: "Saved", builtin: false });
    expect(cardTag(file({ kind: "video" }))).toEqual({ text: "Video", builtin: false });
    expect(cardTag(file({ kind: "canvas" }))).toEqual({ text: "Imported", builtin: false });
  });
});

describe("builtinItems", () => {
  const template = { id: "general", name: "General", size: { width: 1920, height: 1080 } } as never;

  it("lists every built-in panel, then the screen templates once their catalog loads", () => {
    const now = builtinItems();
    expect(now.filter((i) => i.kind === "panel")).toHaveLength(panelPresets.length);
    expect(now.some((i) => i.kind === "template" || i.kind === "skin" || i.kind === "island")).toBe(false);
    const later = builtinItems({ templates: [template] });
    expect(later.find((i) => i.kind === "template")).toMatchObject({ name: "General", meta: { width: 1920, height: 1080 } });
  });

  it("are built-ins: tagged so, never flagged Not used, sorted into their own collections", () => {
    const items = builtinItems({ templates: [template] });
    const index = buildIndex(items);
    for (const item of items) {
      expect(isBuiltinItem(item)).toBe(true);
      expect(isConfigItem(item)).toBe(true);
      expect(cardTag(item)).toEqual({ text: "Built-in", builtin: true });
      expect(flagOf(item, index)).toBeNull();
    }
    const counts = collectionCounts(index);
    expect(counts.templates).toBe(1);
    expect(counts.unused).toBe(0);
  });

});

describe("type collections", () => {
  const items = [...configItems(config), file({ id: "i", kind: "image" }), file({ id: "v", kind: "video" }), file({ id: "s", kind: "svg" }), file({ id: "f", kind: "font" })];
  const index = buildIndex(items);

  it("counts Styles, and Media as every image, video and SVG", () => {
    const counts = collectionCounts(index);
    expect(counts.styles).toBe(1 + BUILTIN_STYLES.length);
    expect(counts.media).toBe(3);
    expect(counts.fonts).toBe(1);
    expect(collectionItems("media", index).map((i) => i.id)).toEqual(["i", "v", "s"]);
  });

  it("gives each type collection its hint, and a Media sub-kind Media's", () => {
    expect(hintOf("styles")).toBe("A Style is one widget’s look. Apply from a widget’s Style tab.");
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
