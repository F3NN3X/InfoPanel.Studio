import { describe, expect, it } from "vitest";
import { detect, diskName, diskShort, firstDisk, fmtDate, fmtRate, rateParts } from "@/widgets/core/data";

describe("fmtRate", () => {
  it("reads the rate sensors as bytes per second and scales them (decimal prefixes)", () => {
    expect(fmtRate(0)).toBe("0 B/s");
    expect(fmtRate(512)).toBe("512 B/s");
    expect(fmtRate(217_662)).toBe("218 KB/s");
    expect(fmtRate(3_276_000)).toBe("3.28 MB/s");
    expect(fmtRate(107_450_768)).toBe("107 MB/s"); // an Ethernet max: ~860 Mb/s, not 102 GB/s
    expect(fmtRate(2_330_114_048)).toBe("2.33 GB/s");
    expect(fmtRate(NaN)).toBe("–");
  });

  it("rateParts scales the number and unit apart, so a tile never rounds a KB/s reading to 0 MB/s", () => {
    expect(rateParts(13_500)).toEqual({ text: "13.5", unit: "KB/s" });
    expect(rateParts(3_276_000)).toEqual({ text: "3.28", unit: "MB/s" });
    expect(rateParts(0)).toEqual({ text: "0", unit: "B/s" });
  });

});

describe("identical drives", () => {
  // The Data API numbers the second and later drives of one model ("KINGSTON SFYRD2000G #2" → `__2`).
  const data = {
    "libre.kingston_sfyrd2000g_power_on_hours": "13171 h",
    "libre.kingston_sfyrd2000g__2_power_on_hours": "13172 h",
    "libre.kingston_sfyrd2000g__3_power_on_hours": "13172 h",
    "libre.samsung_ssd_980_power_on_hours": "5 h",
  };

  it("are found as separate drives", () => {
    expect(detect(data, /^libre\.(.+)_power_on_hours$/)).toHaveLength(4);
  });

  it("are named with their instance, and a model number is not mistaken for one", () => {
    expect(diskName("kingston_sfyrd2000g__2")).toBe("Kingston SFYRD2000G #2");
    expect(diskShort("kingston_sfyrd2000g__3")).toBe("Kingston #3");
    expect(diskShort("kingston_sfyrd2000g")).toBe("Kingston");
    expect(diskName("samsung_ssd_980")).toBe("Samsung SSD 980");
  });

  it("default to a model's first drive", () => {
    expect(firstDisk(["wdc_x__2", "kingston_y", "wdc_x"])).toBe("kingston_y");
    expect(firstDisk(["wdc_x__2"])).toBe("wdc_x__2");
    expect(firstDisk([])).toBeUndefined();
  });
});

describe("fmtDate", () => {
  const d = new Date(2026, 9, 26); // Monday
  it("writes each style through the given locale", () => {
    expect(fmtDate(d, "short", "en-US")).toBe("Mon, Oct 26");
    expect(fmtDate(d, "weekday", "en-US")).toBe("Mon");
    expect(fmtDate(d, "long", "en-US")).toBe("October 26, 2026");
  });
  it("follows another locale and treats an empty one as the browser's", () => {
    expect(fmtDate(d, "weekday", "de-DE")).toBe("Mo");
    expect(fmtDate(d, "weekday", "")).toBe(fmtDate(d, "weekday"));
  });
});
