import { afterEach, describe, expect, it, vi } from "vitest";
import { filesToDrop } from "@/components/library/remove-item";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { defaultConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { canvasItem, componentItem, linkedItem, unplacedProfiles } from "@/lib/my-library/canvas-link";
import { isComponent, isProfileItem, rolesOf } from "@/lib/my-library/component-meta";
import { recordCopy } from "@/lib/my-library/copies";
import { COLLECTIONS, buildIndex, collectionItems } from "@/lib/my-library/model";

const updateLibraryItem = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), updateLibraryItem }));

afterEach(() => vi.clearAllMocks());

const HASH = "c".repeat(64);
const stored = (name: string): StoredCanvas => ({
  ...newStored({ name, width: 200, height: 80, now: new Date("2026-10-25T10:00:00Z") }),
  assets: [{ name: "icon.png", hash: HASH, type: "png", size: 4 }],
});
const asItem = (id: string, input: ReturnType<typeof canvasItem>, copies: LibraryItem["copies"] = []): LibraryItem =>
  ({ id, kind: "canvas", name: input.name, createdAt: "t", updatedAt: "t", files: input.files ?? [], meta: input.meta ?? {}, copies, data: input.data }) as LibraryItem;

describe("a component in the Library", () => {
  const comp = asItem("c1", componentItem(stored("Gauge pair"), "Gauge pair", { "libre:/x|CPU": "cpu.load" }));
  const profile = asItem("p1", canvasItem(stored("Desk"), "Desk"));

  it("is a canvas flagged in its meta, with its roles and files", () => {
    expect(comp).toMatchObject({ kind: "canvas", files: [`${HASH}.png`], meta: { component: true, width: 200, height: 80 } });
    expect(isComponent(comp)).toBe(true);
    expect(isProfileItem(comp)).toBe(false);
    expect(isProfileItem(profile)).toBe(true);
    expect(rolesOf(comp)).toEqual({ "libre:/x|CPU": "cpu.load" });
    expect(rolesOf(profile)).toEqual({});
  });

  it("is in the Components collection and not in InfoPanel profiles", () => {
    const index = buildIndex([comp, profile]);
    expect(COLLECTIONS.some((c) => c.id === "components")).toBe(true);
    expect(collectionItems("components", index).map((i) => i.id)).toEqual(["c1"]);
    expect(collectionItems("canvases", index).map((i) => i.id)).toEqual(["p1"]);
  });

  it("is never listed as an unplaced profile, nor taken for the profile of a placed canvas", () => {
    expect(unplacedProfiles([comp, profile], defaultConfig()).map((i) => i.id)).toEqual(["p1"]);
    expect(linkedItem([comp], stored("Gauge pair"), "z")).toBeUndefined();
  });

  it("counts a placed copy", async () => {
    await recordCopy(comp, { profileId: "p", zoneId: "z", itemPath: "3", label: "Desk › Gauge pair" });
    expect(updateLibraryItem).toHaveBeenCalledWith("c1", { copies: [expect.objectContaining({ profileId: "p", zoneId: "z", itemPath: "3" })] });
  });

  it("keeps its files while a canvas that placed it names them, and frees them once none does", () => {
    const unused = [{ id: `${HASH}.png` }];
    const placedCanvas = JSON.stringify({ zones: [{ canvas: { assets: [{ name: "icon (2).png", hash: HASH }] } }] });
    expect(filesToDrop(comp.files, unused, placedCanvas)).toEqual([]);
    expect(filesToDrop(comp.files, unused, "{}")).toEqual([`${HASH}.png`]);
  });
});
