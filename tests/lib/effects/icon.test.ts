import { describe, expect, it } from "vitest";
import { driveIconOf, driveIconsOfSetting, fitIcon, iconFileOf, lucideNameOf, normalizeDriveIcons, normalizeIconSource } from "@/lib/effects/icon";

const hash = "a".repeat(64);

describe("icon sources", () => {
  it("takes a lucide name or a file, and nothing else", () => {
    expect(normalizeIconSource({ lucide: "hard-drive" })).toEqual({ lucide: "hard-drive" });
    expect(normalizeIconSource({ asset: hash, file: "disk.png" })).toEqual({ asset: hash, file: "disk.png" });
    expect(normalizeIconSource({ asset: `${hash}.svg` })).toEqual({ asset: `${hash}.svg` });
    for (const bad of [null, "x", {}, { lucide: "Not Valid" }, { asset: "abc" }, { asset: hash, file: "../x.png" }, { asset: hash, file: "a\\b.png" }, { asset: hash, file: "" }]) {
      expect(normalizeIconSource(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("keeps per-drive icons sparse: invalid entries go, and none left is undefined", () => {
    expect(normalizeDriveIcons({ "/nvme/2": { lucide: "cpu" }, "/nvme/3": { asset: "bad" } })).toEqual({ "/nvme/2": { lucide: "cpu" } });
    expect(normalizeDriveIcons({ "/nvme/3": 5 })).toBeUndefined();
    expect(normalizeDriveIcons([])).toBeUndefined();
  });

  it("finds a drive's icon by id, else by name, and never through the prototype", () => {
    const icons = { "/nvme/2": { lucide: "cpu" }, "Disk B": { lucide: "zap" } };
    expect(driveIconOf(icons, "/nvme/2", "Disk A")).toEqual({ lucide: "cpu" });
    expect(driveIconOf(icons, "hwinfo:-1/0", "Disk B")).toEqual({ lucide: "zap" });
    expect(driveIconOf(icons, "/nvme/9", "constructor")).toBeNull();
    expect(driveIconOf(undefined, "/nvme/2", "Disk A")).toBeNull();
  });

  it("fits a file into the icon box aspect-fit and centred, at the extremes", () => {
    const box = { x: 10, y: 20, w: 40, h: 40 };
    const file = (width: number, height: number) => ({ asset: hash, file: "a.png", width, height });
    expect(fitIcon(file(400, 100), box)).toEqual({ x: 10, y: 35, w: 40, h: 10 });
    expect(fitIcon(file(100, 400), box)).toEqual({ x: 25, y: 20, w: 10, h: 40 });
    expect(fitIcon(file(4000, 1), box)).toEqual({ x: 10, y: 40, w: 40, h: 1 });
    expect(fitIcon(file(40, 40), box)).toEqual(box);
    // Fitting a fitted box changes nothing, so a re-derived element doesn't shrink.
    const wide = fitIcon(file(400, 100), box);
    expect(fitIcon(file(400, 100), wide)).toEqual(wide);
    // No known size, or a lucide icon: the whole box.
    expect(fitIcon({ asset: hash, file: "a.png" }, box)).toEqual(box);
    expect(fitIcon({ lucide: "cpu" }, box)).toEqual(box);
    expect(normalizeIconSource({ asset: hash, file: "a.png", width: 0, height: 5 })).toEqual({ asset: hash, file: "a.png" });
  });

  it("names the canvas file of a user's file only, and reads a setting's JSON safely", () => {
    expect(iconFileOf({ asset: hash, file: "disk.png" })).toBe("disk.png");
    expect(iconFileOf({ asset: `${hash}.png` })).toBeNull();
    expect(iconFileOf({ lucide: "cpu" })).toBeNull();
    expect(lucideNameOf({ name: "cpu", source: { lucide: "zap" } })).toBe("zap");
    expect(lucideNameOf({ name: "cpu", source: { asset: hash, file: "a.png" } })).toBe("cpu");
    expect(driveIconsOfSetting(JSON.stringify({ c: { asset: `${hash}.png` } }))).toEqual({ c: { asset: `${hash}.png` } });
    expect([driveIconsOfSetting(""), driveIconsOfSetting("{nope"), driveIconsOfSetting(4)]).toEqual([undefined, undefined, undefined]);
  });
});
