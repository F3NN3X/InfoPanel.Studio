import { describe, expect, it } from "vitest";
import { driveIconOf, driveIconsOfSetting, iconFileOf, lucideNameOf, normalizeDriveIcons, normalizeIconSource } from "@/lib/effects/icon";

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
