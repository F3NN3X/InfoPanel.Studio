import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import { toFlat } from "@/widgets/data-adapter";
import { filterDisks, formatTemp, readSystem, readSystemFlat } from "@/lib/system-metrics";

const s = (value: number, unit: string, name: string) => ({ value, unit, name });
const GPU = "libre.nvidia_geforce_rtx_5090";
const CPU = "libre.amd_ryzen_9_9950x3d";

// Shapes from a live Data API (LibreHardwareMonitor on a 9950X3D + RTX 5090).
const live = {
  "system.cpu.load": s(29.6, "%", "CPU Load"),
  "system.ram.load": s(80.7, "%", "RAM Load"),
  [`${CPU}_cpu_total`]: s(26.9, "%", "AMD Ryzen 9 9950X3D CPU Total"),
  [`${CPU}_cpu_core_max`]: s(51.8, "%", "AMD Ryzen 9 9950X3D CPU Core Max"),
  [`${CPU}_core__tctl_tdie`]: s(0, "°C", "AMD Ryzen 9 9950X3D Core (Tctl/Tdie)"),
  [`${CPU}_package`]: s(0, "W", "AMD Ryzen 9 9950X3D Package"),
  [`${GPU}_gpu_core`]: s(40.2, "°C", "NVIDIA GeForce RTX 5090 GPU Core"),
  [`${GPU}_gpu_core_load`]: s(48, "%", "NVIDIA GeForce RTX 5090 GPU Core"),
  [`${GPU}_gpu_core_clock`]: s(2700, "MHz", "NVIDIA GeForce RTX 5090 GPU Core"),
  [`${GPU}_gpu_package`]: s(170.1, "W", "NVIDIA GeForce RTX 5090 GPU Package"),
  [`${GPU}_gpu_power`]: s(29.7, "%", "NVIDIA GeForce RTX 5090 GPU Power"),
  [`${GPU}_gpu_memory`]: s(32.5, "%", "NVIDIA GeForce RTX 5090 GPU Memory"),
  [`${GPU}_gpu_memory_clock`]: s(14001, "MHz", "NVIDIA GeForce RTX 5090 GPU Memory"),
  [`${GPU}_gpu_memory_used`]: s(10589, "", "NVIDIA GeForce RTX 5090 GPU Memory Used"),
  [`${GPU}_gpu_memory_total`]: s(32607, "", "NVIDIA GeForce RTX 5090 GPU Memory Total"),
  [`${GPU}_gpu_memory_junction`]: s(64, "°C", "NVIDIA GeForce RTX 5090 GPU Memory Junction"),
  [`${GPU}_gpu_fan_1`]: s(1942, "RPM", "NVIDIA GeForce RTX 5090 GPU Fan 1"),
  [`${GPU}_gpu_fan_1_control`]: s(55, "%", "NVIDIA GeForce RTX 5090 GPU Fan 1"),
  [`${GPU}_gpu_fan_2`]: s(1946, "RPM", "NVIDIA GeForce RTX 5090 GPU Fan 2"),
  [`${GPU}_gpu_fan_2_control`]: s(57, "%", "NVIDIA GeForce RTX 5090 GPU Fan 2"),
  "libre.total_memory_memory_used": s(51.4, "GB", "Total Memory Memory Used"),
  "libre.total_memory_memory_available": s(12.3, "GB", "Total Memory Memory Available"),
  "libre.virtual_memory_memory": s(83.9, "%", "Virtual Memory Memory"),
  "libre.virtual_memory_memory_used": s(80, "GB", "Virtual Memory Memory Used"),
  "libre.virtual_memory_memory_available": s(15.4, "GB", "Virtual Memory Memory Available"),
  // Out of order on purpose: threads sort numerically (#2 before #10).
  [`${CPU}_cpu_core__10`]: s(60, "%", "AMD Ryzen 9 9950X3D CPU Core #10"),
  [`${CPU}_cpu_core__1`]: s(74, "%", "AMD Ryzen 9 9950X3D CPU Core #1"),
  [`${CPU}_cpu_core__2`]: s(0, "%", "AMD Ryzen 9 9950X3D CPU Core #2"),
  // Two drives, one with the doubled variants LibreHardwareMonitor also emits.
  "libre.kingston_sfyrd2000g_used_space": s(46.8, "%", "KINGSTON SFYRD2000G Used Space"),
  "libre.kingston_sfyrd2000g_used_space_load": s(73.7, "%", "KINGSTON SFYRD2000G Used Space"),
  "libre.kingston_sfyrd2000g_temperature__2": s(63.9, "°C", "KINGSTON SFYRD2000G Temperature #2"),
  "libre.kingston_sfyrd2000g_temperature__2_temperature": s(55.9, "°C", "KINGSTON SFYRD2000G Temperature #2"),
  "libre.kingston_sfyrd2000g_composite_temperature": s(53, "°C", "KINGSTON SFYRD2000G Composite Temperature"),
  "libre.kingston_sfyrd2000g_read_rate": s(429543, "KB/s", "KINGSTON SFYRD2000G Read Rate"),
  "libre.kingston_sfyrd2000g_read_rate_throughput": s(3334294, "KB/s", "KINGSTON SFYRD2000G Read Rate"),
  "libre.kingston_sfyrd2000g_write_rate": s(0, "KB/s", "KINGSTON SFYRD2000G Write Rate"),
  "libre.kingston_sfyrd2000g_life": s(87, "%", "KINGSTON SFYRD2000G Life"),
  "libre.kingston_sfyrd2000g_total_space": s(2000.4, "GB", "KINGSTON SFYRD2000G Total Space"),
  "libre.kingston_sfyrd2000g_free_space": s(1064.2, "GB", "KINGSTON SFYRD2000G Free Space"),
  "libre.wdc_wds100t2b0a_00sm50_used_space": s(81.6, "%", "WDC WDS100T2B0A-00SM50 Used Space"),
  "libre.wdc_wds100t2b0a_00sm50_composite_temperature": s(0, "°C", "WDC WDS100T2B0A-00SM50 Composite Temperature"),
  // Not drives: network adapters and the Data API's own drive plugin.
  "libre.wifi_3_download_speed": s(12, "KB/s", "WiFi 3 Download Speed"),
  "libre.ethernet_data_downloaded": s(5, "GB", "Ethernet Data Downloaded"),
  "plugins.drive-info-plugin.c.used_space": s(891940, "MB", "C: · Used Space"),
};

describe("readSystem", () => {
  const r = readSystem(live);

  it("reads the GPU by key suffix and unit", () => {
    expect(r.gpu).toMatchObject({
      name: "NVIDIA GeForce RTX 5090",
      load: 48,
      temp: 40.2,
      power: 170.1,
      clock: 2700,
    });
    expect(r.gpu.vram.load).toBe(32.5);
    expect(r.gpu.vram.used).toBeCloseTo(10.34, 2);
    expect(r.gpu.vram.total).toBeCloseTo(31.84, 2);
  });

  it("prefers the Data API's own loads and hides unreadable (0) temps and power", () => {
    expect(r.cpu).toMatchObject({ name: "AMD Ryzen 9 9950X3D", load: 29.6, temp: undefined, power: undefined });
    expect(r.ram).toMatchObject({ load: 80.7, used: 51.4, total: 51.4 + 12.3 });
  });

  it("falls back to libre loads and derives percentages", () => {
    const fallback = readSystem({
      [`${CPU}_cpu_total`]: s(26.9, "%", "x"),
      [`${GPU}_gpu_memory_used`]: s(8192, "", "x"),
      [`${GPU}_gpu_memory_total`]: s(16384, "", "x"),
      "libre.total_memory_memory_used": s(16, "GB", "x"),
      "libre.total_memory_memory_available": s(16, "GB", "x"),
    });
    expect(fallback.cpu.load).toBe(26.9);
    expect(fallback.gpu.vram.load).toBe(50);
    expect(fallback.ram.load).toBe(50);
  });

  it("keeps a real 0 % load", () => {
    expect(readSystem({ [`${GPU}_gpu_core_load`]: s(0, "%", "x") }).gpu.load).toBe(0);
  });

  it("reads Intel's CPU package temperature and power, never the GPU's", () => {
    const intel = readSystem({
      "libre.intel_core_i9_14900k_cpu_package": s(71, "°C", "Intel Core i9-14900K CPU Package"),
      "libre.intel_core_i9_14900k_package": s(120, "W", "Intel Core i9-14900K Package"),
      [`${GPU}_gpu_package`]: s(300, "W", "x"),
    });
    expect(intel.cpu.temp).toBe(71);
    expect(intel.cpu.power).toBe(120);
    expect(intel.gpu.power).toBe(300);
  });

  it("lists every thread's load in numeric order, keeping real zeros", () => {
    expect(r.cpu.cores).toEqual([74, 0, 60]);
  });

  it("reads the GPU's hotspot, memory clock and power limit", () => {
    expect(r.gpu.hotspot).toBe(64);
    expect(r.gpu.memClock).toBe(14001);
    // The % sensor, not the Watts one.
    expect(r.gpu.powerLimit).toBe(29.7);
    expect(r.gpu.power).toBe(170.1);
  });

  it("averages the fans' speed and duty, ignoring stopped ones", () => {
    expect(r.gpu.fanRpm).toBe(1944);
    expect(r.gpu.fanPct).toBe(56);
    const parked = readSystem({
      [`${GPU}_gpu_core_load`]: s(1, "%", "x"),
      [`${GPU}_gpu_fan_1`]: s(0, "RPM", "x"),
      [`${GPU}_gpu_fan_1_control`]: s(0, "%", "x"),
    });
    expect(parked.gpu.fanRpm).toBeUndefined();
    expect(parked.gpu.fanPct).toBeUndefined();
  });

  it("reads the page file and derives its total", () => {
    expect(r.ram.page).toEqual({ load: 83.9, used: 80, total: 80 + 15.4 });
    expect(readSystem({}).ram.page).toBeUndefined();
  });

  it("derives a page file percentage when the % sensor is missing", () => {
    const page = readSystem({
      "libre.virtual_memory_memory_used": s(30, "GB", "x"),
      "libre.virtual_memory_memory_available": s(10, "GB", "x"),
    }).ram.page;
    expect(page?.load).toBe(75);
  });

  describe("disks", () => {
    it("lists one entry per drive with a name derived from the sensor", () => {
      expect(r.disks.map((d) => d.name)).toEqual(["KINGSTON SFYRD2000G", "WDC WDS100T2B0A-00SM50"]);
    });

    it("reads each metric from the plain sensor, not the doubled variants", () => {
      expect(r.disks[0]).toEqual({
        id: "libre.kingston_sfyrd2000g",
        name: "KINGSTON SFYRD2000G",
        used: 46.8,
        temp: 63.9,
        read: 429543,
        write: 0,
        life: 87,
        total: 2000.4,
        free: 1064.2,
      });
    });

    it("falls back to the composite temperature and hides an unreadable (0) one", () => {
      const nvme = readSystem({
        "libre.x_nvme_used_space": s(10, "%", "X NVMe Used Space"),
        "libre.x_nvme_composite_temperature": s(48, "°C", "X NVMe Composite Temperature"),
      });
      expect(nvme.disks[0].temp).toBe(48);
      expect(r.disks[1].temp).toBeUndefined();
    });

    it("excludes network adapters and the drive plugin", () => {
      expect(r.disks).toHaveLength(2);
      expect(readSystem({ "libre.wifi_3_download_speed": s(12, "KB/s", "WiFi 3") }).disks).toEqual([]);
    });

    it("filters by comma-separated name substrings, case-insensitively", () => {
      expect(filterDisks(r.disks, "")).toHaveLength(2);
      expect(filterDisks(r.disks, "king").map((d) => d.name)).toEqual(["KINGSTON SFYRD2000G"]);
      expect(filterDisks(r.disks, " wdc , nope ").map((d) => d.name)).toEqual(["WDC WDS100T2B0A-00SM50"]);
      expect(filterDisks(r.disks, "nope")).toEqual([]);
    });
  });

  it("returns empty readings without hardware data", () => {
    expect(readSystem({})).toEqual({
      cpu: { cores: [], name: undefined, load: undefined, temp: undefined, power: undefined },
      gpu: {
        name: undefined,
        load: undefined,
        temp: undefined,
        power: undefined,
        clock: undefined,
        vram: { load: undefined, used: undefined, total: undefined },
        hotspot: undefined,
        fanRpm: undefined,
        fanPct: undefined,
        memClock: undefined,
        powerLimit: undefined,
      },
      ram: { load: undefined, used: undefined, total: undefined, page: undefined },
      disks: [],
    });
  });
});

describe("readSystemFlat", () => {
  const flat = toFlat(live as SensorMap);
  const f = readSystemFlat(flat);

  it("reads the same values from the templates' flat data, without sensor names", () => {
    const r = readSystem(live);
    expect(f).toEqual({
      ...r,
      cpu: { ...r.cpu, name: undefined },
      gpu: { ...r.gpu, name: undefined },
      disks: r.disks.map((d) => ({ ...d, name: d.id.replace(/^libre\./, "") })),
    });
  });

  it("memoises per data identity", () => {
    expect(readSystemFlat(flat)).toBe(f);
  });

  it("takes hardware and drive names from the sensor names when given", () => {
    const names = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.name]));
    const named = readSystemFlat(flat, names);
    const r = readSystem(live);
    expect(named.cpu.name).toBe(r.cpu.name);
    expect(named.gpu.name).toBe(r.gpu.name);
    expect(named.disks.map((d) => d.name)).toEqual(r.disks.map((d) => d.name));
    expect(readSystemFlat(flat, names)).toBe(named);
    expect(readSystemFlat(flat).cpu.name).toBeUndefined();
  });

  it("filters slug-named drives by hardware-name substrings, ignoring punctuation", () => {
    expect(filterDisks(f.disks, "WDS100T2B0A-00SM50").map((d) => d.id)).toEqual(["libre.wdc_wds100t2b0a_00sm50"]);
    expect(filterDisks(f.disks, "KINGSTON").map((d) => d.id)).toEqual(["libre.kingston_sfyrd2000g"]);
    expect(filterDisks(f.disks, " - ")).toHaveLength(2);
    // punctuation in a term stays exact against real names: "C:" does not loosen to "c"
    expect(filterDisks([{ ...f.disks[0], name: "Crucial CT1000" }, { ...f.disks[1], name: "Local Disk (C:)" }], "C:").map((d) => d.name)).toEqual(["Local Disk (C:)"]);
  });

  it("ignores text values and keys outside libre / system", () => {
    expect(readSystemFlat({ "libre.x_cpu_total": "n/a", "plugins.y_cpu_total": "50 %" }).cpu.load).toBeUndefined();
    expect(readSystemFlat({ "libre.x_cpu_total": "50 %" }).cpu.load).toBe(50);
    expect(readSystemFlat({ "libre.x_cpu_total": " x" }).cpu.load).toBeUndefined();
    expect(readSystemFlat({ "libre.x_cpu_total": "0x10 %" }).cpu.load).toBeUndefined();
  });
});

describe("formatTemp", () => {
  it("formats Celsius, rounding to the chosen decimals", () => {
    expect(formatTemp(63.85, "c")).toBe("64°C");
    expect(formatTemp(63.85, "c", 1)).toBe("63.9°C");
  });

  it("converts to Fahrenheit", () => {
    expect(formatTemp(0, "f")).toBe("32°F");
    expect(formatTemp(100, "f")).toBe("212°F");
    expect(formatTemp(40.2, "f", 1)).toBe("104.4°F");
  });
});
