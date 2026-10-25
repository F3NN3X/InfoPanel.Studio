import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { storeItems, withElementFile, type DroppedFile } from "@/lib/infopanel/canvas-edit.ts";
import { applyElement, badgeOf, elementOf, syncElements } from "@/lib/infopanel/elements/apply.ts";
import { staleElements } from "@/lib/infopanel/elements/bake.ts";
import { driveTile, newComposite, newElement } from "@/lib/infopanel/elements/create.ts";
import { detectDrives } from "@/lib/infopanel/elements/drives.ts";
import { normalizeElement, type DrivesSpec, type IconSpec } from "@/lib/infopanel/elements/spec.ts";
import { elementSvg } from "@/lib/infopanel/elements/svg.ts";
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import type { DisplayItem, GroupItem, ImageItem } from "@/lib/infopanel/schema.ts";
import type { DataApiValue } from "@/lib/infopanel/sensors.ts";
import { elementExport } from "../export/element-cases.ts";
import { palette, profile } from "./fixture.ts";

const hash = "c".repeat(64);
const file: DroppedFile = { name: "disk.png", hash, type: "png", size: 10, width: 32, height: 32 };

const drive = (n: number, name: string): Record<string, DataApiValue> => ({
  [`used${n}`]: { value: 40, unit: "%", name: `${name} Used Space`, ref: `libre:/nvme/${n}/load/${50 + n}` },
  [`free${n}`]: { value: 900, unit: "GB", name: `${name} Free Space`, ref: `libre:/nvme/${n}/data/${3 + n}` },
  [`temp${n}`]: { value: 44, unit: "°C", name: `${name} Composite Temperature`, ref: `libre:/nvme/${n}/temperature/0` },
});
const found = detectDrives({ ...drive(2, "Disk A"), ...drive(3, "Disk B") });

/** The Drives element over `order` of the found drives. */
const drivesOf = (order: number[], icons?: DrivesSpec["icons"]): GroupItem => {
  const g = newComposite("drives", profile, palette, order.map((i) => found[i]), 0, 0);
  return applyElement({ ...g, element: { ...elementOf(g)!, ...(icons ? { icons } : {}) } } as unknown as DisplayItem) as GroupItem;
};
const iconOfTile = (g: GroupItem, tile: number) => (g.DisplayItems[tile] as GroupItem).DisplayItems[1] as ImageItem & { element: IconSpec };

describe("an Icon element showing your file", () => {
  const icon = newElement("icon", profile, palette);
  const mine = applyElement({ ...icon, element: { ...elementOf(icon)!, source: { asset: hash, file: "disk.png" } } } as unknown as DisplayItem) as ImageItem;

  it("is a plain Image of the canvas file, native in the export and never baked", () => {
    expect(mine).toMatchObject({ kind: "Image", Type: "FILE", FilePath: "disk.png", RelativePath: true });
    expect(badgeOf(mine)?.kind).toBe("native");
    expect(staleElements([mine])).toEqual([]);
  });

  it("goes back to a baked lucide icon when the file is cleared, without a stale baked record", () => {
    const baked = { ...mine, elementBaked: "old" } as unknown as DisplayItem;
    const cleared = applyElement({ ...baked, element: { ...elementOf(mine)!, source: undefined } } as unknown as DisplayItem);
    expect(badgeOf(cleared)?.kind).toBe("baked");
    expect(staleElements([cleared])).toEqual(["0"]);
  });

  it("draws a chosen lucide source instead of its own name, and the spec drops what is invalid", () => {
    expect(elementSvg({ ...(elementOf(icon) as IconSpec), source: { lucide: "zap" } }, 24, 24)).toBe(elementSvg({ ...(elementOf(icon) as IconSpec), name: "zap" }, 24, 24));
    expect(normalizeElement({ ...elementOf(icon), source: { asset: "nope" } })).not.toHaveProperty("source");
  });
});

describe("Drives with an icon per drive", () => {
  const icons = { "/nvme/3": { asset: hash, file: "disk.png" } };

  it("puts the file on the drive it belongs to, and keeps the stock icon on the others", () => {
    const g = drivesOf([0, 1], icons);
    expect(iconOfTile(g, 1)).toMatchObject({ Type: "FILE", FilePath: "disk.png", RelativePath: true });
    expect(iconOfTile(g, 0).element).not.toHaveProperty("source");
    expect(iconOfTile(g, 0).FilePath).not.toBe("disk.png");
  });

  it("keeps each icon with its drive when the drives come back in another order", () => {
    const g = drivesOf([1, 0], icons);
    expect(iconOfTile(g, 0).FilePath).toBe("disk.png");
    expect(iconOfTile(g, 1).FilePath).not.toBe("disk.png");
    // The same after finding the drives again: new tiles, same element spec.
    const again = syncElements([{ ...g, DisplayItems: [1, 0].map((i) => driveTile(profile, palette, found[i], i + 1)) }])[0] as GroupItem;
    expect(iconOfTile(again, 0).FilePath).toBe("disk.png");
  });

  it("falls back to the drive's name when its id isn't known (HWiNFO)", () => {
    const g = drivesOf([0, 1], { "Disk A": { lucide: "zap" } });
    expect(iconOfTile(g, 0).element.source).toEqual({ lucide: "zap" });
  });

  it("survives the stored form: the icons on the spec and each tile's drive id", () => {
    const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: "Icons", width: 800, height: 480 }), profile, [drivesOf([0, 1], icons)])));
    const [back] = readStored(stored).items as GroupItem[];
    expect((elementOf(back) as DrivesSpec).icons).toEqual(icons);
    expect((back.DisplayItems[1] as GroupItem & { driveId?: string }).driveId).toBe("/nvme/3");
    expect(iconOfTile(syncElements([back])[0] as GroupItem, 1).FilePath).toBe("disk.png");
  });

  it("is written sparse: no icons key when none are set", () => {
    expect(elementOf(drivesOf([0, 1]))).not.toHaveProperty("icons");
  });
});

describe("a file chosen for an element", () => {
  const stored = newStored({ name: "Icons", width: 800, height: 480 });
  const drives = drivesOf([0, 1]);

  it("joins the canvas's files once, so the Library sees it as used, and the tile reads it", () => {
    const make = (source: Parameters<Parameters<typeof withElementFile>[5]>[0]) => normalizeElement({ ...elementOf(drives), icons: { "/nvme/2": source } });
    const next = withElementFile(stored, profile, [drives], "0", file, make)!;
    expect(next.assets.map((a) => [a.name, a.hash])).toEqual([["disk.png", hash]]);
    const again = withElementFile(next, profile, readStored(JSON.parse(JSON.stringify(next))).items, "0", file, make)!;
    expect(again.assets).toHaveLength(1);
    expect(JSON.stringify(next)).toContain(hash);
    expect(iconOfTile(readStored(JSON.parse(JSON.stringify(next))).items[0] as GroupItem, 0).FilePath).toBe("disk.png");
  });

  it("changes nothing when the spec is declined", () => {
    expect(withElementFile(stored, profile, [drives], "0", file, () => null)).toBeNull();
  });
});

describe("the export", () => {
  it("carries the icon file, and the Image reads it relatively", async () => {
    const out = await elementExport(profile);
    const back = await loadExport(entriesFromZip(out.bytes));
    expect([...back.assets.keys()]).toContain("drive-icon.png");
    const tile = (back.items[5] as GroupItem).DisplayItems[0] as GroupItem;
    expect(tile.DisplayItems[1]).toMatchObject({ kind: "Image", FilePath: "drive-icon.png", RelativePath: true });
  });
});
