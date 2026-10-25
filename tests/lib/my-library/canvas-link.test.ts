import { describe, expect, it } from "vitest";
import { filesToDrop } from "@/components/library/remove-item";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, defaultConfig, type DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { canvasFiles, canvasItem, canvasMeta, canvasUpdate, copyOfProfile, linkedItem, unplacedProfiles } from "@/lib/my-library/canvas-link";

const HASH = "a".repeat(64);
const PHOTO = `${HASH}.png`;

const profile = (name: string, withFile = true): StoredCanvas => ({
  ...newStored({ name, width: 800, height: 480, now: new Date("2026-10-25T10:00:00Z") }),
  assets: withFile ? [{ name: "photo.png", hash: HASH, type: "png", size: 10 }] : [],
});

const asItem = (id: string, input: ReturnType<typeof canvasItem>, copies: LibraryItem["copies"] = []): LibraryItem => ({
  id,
  kind: "canvas",
  name: input.name,
  createdAt: "t",
  updatedAt: "t",
  files: input.files ?? [],
  meta: input.meta ?? {},
  copies,
  data: input.data,
});

const configWith = (...canvases: { zone: string; canvas: StoredCanvas }[]): DashboardConfig => {
  const base = defaultConfig();
  const [first] = base.profiles;
  const page = first.pages[0];
  const placements = canvases.map(({ zone, canvas }) => ({ id: zone, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvas }));
  return { ...base, profiles: [{ ...first, pages: [{ ...page, placements }] }] };
};

describe("InfoPanel profiles in the Library", () => {
  it("saves a profile, then an update replaces its data, files and meta and keeps the link", () => {
    const first = profile("Desk");
    const saved = asItem("lib1", canvasItem(first, "Desk"));
    expect(saved).toMatchObject({ kind: "canvas", files: [PHOTO], meta: { width: 800, height: 480, items: 0, sourceName: "Desk", importedAt: first.source.importedAt } });
    // The placed profile is found by the source it was saved with.
    expect(linkedItem([saved], first, "zone-1")).toBe(saved);

    const edited: StoredCanvas = { ...first, assets: [], profile: { ...first.profile, Width: 1024 }, items: [{ kind: "Text" } as never] };
    const patch = canvasUpdate(saved, edited);
    expect(patch.data).toBe(edited);
    // The file the edit no longer uses is dropped from the item; its meta follows the data.
    expect(patch.files).toEqual([]);
    expect(patch.meta).toMatchObject({ width: 1024, items: 1, sourceName: "Desk", importedAt: first.source.importedAt });
    expect(linkedItem([{ ...saved, ...patch } as LibraryItem], edited, "zone-1")).toBeDefined();
  });

  it("keeps an earlier file id the profile still uses, and adds the kept screenshot", () => {
    const stored = { ...profile("Desk"), screenshot: `${"b".repeat(64)}.png` };
    expect(canvasFiles(stored, [`${HASH}.webp`])).toEqual([PHOTO, `${HASH}.webp`, stored.screenshot]);
  });

  it("finds an older item (no source in its meta) by the zone it was copied to", () => {
    const old = asItem("old", { kind: "canvas", name: "Old", meta: { width: 1, height: 1 } }, [{ profileId: "p", zoneId: "z-old" }]);
    expect(linkedItem([old], profile("Other"), "z-old")).toBe(old);
    expect(linkedItem([old], profile("Other"), "z-none")).toBeUndefined();
  });

  it("lists only the saved profiles that aren't placed in this dashboard", () => {
    const placed = profile("Placed");
    const spare = profile("Spare");
    const items = [asItem("a", canvasItem(placed, "Placed")), asItem("b", canvasItem(spare, "Spare")), { ...asItem("c", canvasItem(spare, "A font")), kind: "font" as const }];
    expect(unplacedProfiles(items, configWith({ zone: "z1", canvas: placed })).map((i) => i.id)).toEqual(["b"]);
    expect(unplacedProfiles(items, configWith()).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("makes a copy that is its own profile, not the item it copies", () => {
    const original = profile("Desk");
    const copy = copyOfProfile(original, "Desk 2", new Date("2026-10-26T00:00:00Z"));
    expect(copy.source).toMatchObject({ name: "Desk 2", origin: "new", importedAt: "2026-10-26T00:00:00.000Z" });
    expect(copy.profile.Guid).not.toBe(original.profile.Guid);
    expect(canvasMeta(copy).sourceName).toBe("Desk 2");
    expect(linkedItem([asItem("a", canvasItem(original, "Desk"))], copy, "z")).toBeUndefined();
  });

  it("never deletes a file a placed, Library-linked profile still uses when the item is removed", () => {
    const placed = profile("Desk");
    const item = asItem("lib1", canvasItem(placed, "Desk"));
    const config = configWith({ zone: "z1", canvas: placed });
    const unused = [{ id: PHOTO }];
    // The asset store's own scan calls the file unused (the zone is not saved yet); the live config still names it.
    expect(filesToDrop(item.files, unused, JSON.stringify(config))).toEqual([]);
    // Once no placed profile uses it, it goes with the item.
    expect(filesToDrop(item.files, unused, JSON.stringify(configWith()))).toEqual([PHOTO]);
  });
});
