import { describe, expect, it } from "vitest";
import type { ApiSources } from "@/lib/catalog";
import type { DashboardConfig } from "@/lib/layout";
import { addressText, listedKeys, troubleshootingReport, type ReportInput } from "@/lib/troubleshooting-report";
import type { SensorMap } from "@/modules/types";

const s = (value: number, unit: string, name: string) => ({ value, unit, name });
const I = "libre.intel_core_i9_14900k";

const sensors: SensorMap = {
  "system.cpu.load": s(20, "%", "CPU Load"),
  "system.bridge.time": { text: "19:30:00", unit: "", name: "Data API Time" },
  [`${I}_cpu_total`]: s(20, "%", "Intel Core i9-14900K CPU Total"),
  [`${I}_cpu_package`]: s(71, "°C", "Intel Core i9-14900K CPU Package"),
  [`${I}_cpu_package_power`]: s(120.456, "W", "Intel Core i9-14900K CPU Package"),
  [`${I}_cpu_core__1_clock`]: s(5000, "MHz", "Intel Core i9-14900K CPU Core #1"),
  "libre.kingston_volumes": { text: "C: Alice's games", unit: "", name: "KINGSTON Volumes" },
  // a renamed adapter: its keys and names carry the name
  "libre.alices_wifi_download_speed": s(1200, "B/s", "Alice's WiFi Download Speed"),
  "libre.alices_wifi_upload_speed": s(300, "B/s", "Alice's WiFi Upload Speed"),
  "libre.alices_wifi_data_uploaded": s(2, "GB", "Alice's WiFi Data Uploaded"),
  "hwinfo.cpu_package_power": s(118, "W", "CPU Package Power"),
  "plugins.spotify.now.track": { text: "Secret Song", unit: "", name: "Track" },
  "plugins.calendar.today.next": { text: "Dentist at 3", unit: "", name: "Next event" },
  "push.mytool.value": s(5, "", "Pushed by Alice"),
};

const sources: ApiSources = {
  plugins: [
    { id: "spotify", name: "Spotify of Alice", containers: [{ id: "now", name: "Now", entries: [{ id: "track", name: "Track" }] }] },
    { id: "calendar", name: "Calendar", containers: [{ id: "today", name: "Alice's calendar", entries: [{ id: "next", name: "Next event" }] }] },
  ] as never,
  hwinfo: [],
};

const config = {
  version: 16,
  activeProfile: "p1",
  dataApiUrl: "http://192.168.1.40:3921",
  profiles: [
    {
      id: "p1",
      name: "Alice's desk",
      width: 1920,
      height: 480,
      pages: [
        { id: "g1", name: "Gaming page", placements: [{ id: "z1", module: "CpuMonitor", name: "Alice's CPU", settings: { title: "Alice" } }, { id: "z2", module: "CpuMonitor" }, { id: "z3", module: "infopanel" }] },
        { id: "g2", name: "Work", placements: [{ id: "z4", module: "Text", settings: { text: "Hello Alice" } }] },
      ],
    },
  ],
} as unknown as DashboardConfig;

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  now: new Date("2026-10-29T19:30:00Z"),
  app: { version: "1.3.1-beta.2", channel: "beta", buildDate: "2026-10-29", webview: "141.0", os: "Windows 11 Pro (build 26300)" },
  apiBase: "http://127.0.0.1:3921",
  reach: { ok: true, ms: 12 },
  infopanel: { version: "1.4.0", running: true, dataApi: { enabled: true, port: 3921 }, profiles: 3 },
  sensors,
  sources,
  config,
  ...over,
});

describe("troubleshootingReport", () => {
  const text = troubleshootingReport(input());

  it("holds nothing personal: names, text values, plugin entries, adapters or another PC's address", () => {
    for (const secret of ["Alice", "alices", "Secret Song", "Dentist", "Gaming page", "Work", "192.168", "19:30:00", "Hello", "mytool"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(troubleshootingReport(input({ apiBase: "http://192.168.1.40:3921" }))).not.toContain("192.168");
  });

  it("says what the widgets read, by role", () => {
    expect(text).toContain("CPU: Intel Core i9-14900K · load 20 %, temp 71 °C, power 120.46 W, clock 5000 MHz");
    expect(text).toContain(`- cpuPower: ${I}_cpu_package_power = 120.46 W`);
    expect(text).not.toContain("- cpuClock:");
  });

  it("counts the sources, plugins, adapters and widget kinds", () => {
    expect(text).toContain("Readings: 14 (system 2, libre 8, hwinfo 1, plugins 2, pushed 1)");
    expect(text).toContain("- spotify: 1 containers, 1 entries, 1 readings");
    expect(text).toContain("Network adapters: 1");
    expect(text).toContain("1 screens, 2 pages, config version 16");
    expect(text).toContain("InfoPanel canvases: 1");
    expect(text).toContain("Widgets: CpuMonitor 2, Text 1");
  });

  it("lists the hardware readings with their values, a text one without it", () => {
    expect(text).toContain(`${I}_cpu_package | Intel Core i9-14900K CPU Package | 71 °C`);
    expect(text).toContain("hwinfo.cpu_package_power | CPU Package Power | 118 W");
    expect(text).toContain("libre.kingston_volumes | KINGSTON Volumes | (text)");
  });

  it("says what it could not read", () => {
    const bare = troubleshootingReport(input({ app: null, infopanel: null, reach: { ok: false }, sensors: {}, sources: null, config: null }));
    expect(bare).toContain("InfoPanel Studio in a browser");
    expect(bare).toContain("Not read (a browser, or another PC).");
    expect(bare).toContain("Answering: no");
    expect(bare).toContain("- none found");
    expect(bare).toContain("## Hardware readings (0)");
  });
});

describe("addressText", () => {
  it("names this PC for loopback and leaves another PC's address out", () => {
    expect(addressText("http://127.0.0.1:3921")).toBe("this PC, port 3921");
    expect(addressText("http://localhost:3921")).toBe("this PC, port 3921");
    expect(addressText("http://[::1]:3921")).toBe("this PC, port 3921");
    expect(addressText("http://desk-pc.local:3921")).toBe("another PC, port 3921");
    expect(addressText("nope")).toBe("not a valid address");
  });
});

describe("listedKeys", () => {
  it("keeps hardware readings and drops adapters, plugins and pushed values", () => {
    expect(listedKeys(sensors)).not.toContain("libre.alices_wifi_data_uploaded");
    expect(listedKeys(sensors).every((k) => /^(libre|hwinfo|system)\./.test(k))).toBe(true);
  });
});
