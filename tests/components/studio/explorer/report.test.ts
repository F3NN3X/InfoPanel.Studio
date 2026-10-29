import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/desktop", () => ({
  isTauri: () => true,
  saveTextFile: vi.fn(async () => true),
  appInfo: async () => ({
    version: "1.3.1-beta.2",
    channel: "beta",
    buildDate: "2026-10-29",
    webview: "141.0",
    os: "Windows 11 Pro (build 26300)",
    paths: { settingsFile: "C:\\Users\\alice\\settings.json", dataDir: "C:\\Users\\alice\\data", logsDir: "C:\\Users\\alice\\logs" },
  }),
}));
vi.mock("@/components/studio/first-run/commands", () => ({
  infopanelLocal: async () => ({
    dataDir: "C:\\Users\\alice\\AppData\\Local\\InfoPanel",
    settings: true,
    dataApi: { enabled: true, address: "192.168.1.40", port: 3921 },
    profiles: [{ guid: "g", name: "Alice's profile", file: "C:\\Users\\alice\\p.xml", bytes: 1, modified: 0 }],
    process: { pid: 4242, exe: "C:\\Users\\alice\\InfoPanel.exe" },
    exe: "C:\\Users\\alice\\InfoPanel.exe",
    version: "1.4.0",
    setup: false,
  }),
}));
vi.mock("@/lib/catalog", () => ({
  refreshCatalog: async () => {},
  getCatalog: () => ({ status: "ready", fetchedAt: 1, sources: { plugins: [] }, sensors: { "libre.x_cpu_total": { value: 5, unit: "%", name: "X CPU Total" } } }),
}));

const { buildReport } = await import("@/components/studio/explorer/report");

describe("buildReport", () => {
  it("keeps the versions and counts, and leaves the folders, the exe, the profiles' names and addresses behind", async () => {
    const text = await buildReport(null, "http://127.0.0.1:3921");
    expect(text).toContain("InfoPanel Studio 1.3.1-beta.2 (beta channel, built 2026-10-29), desktop app");
    expect(text).toContain("Version: 1.4.0, running");
    expect(text).toContain("Data API switch: on, port 3921");
    expect(text).toContain("Profiles: 1");
    expect(text).toContain("libre.x_cpu_total | X CPU Total | 5 %");
    for (const secret of ["alice", "Alice", "192.168", "4242", "InfoPanel.exe", "AppData"]) expect(text, secret).not.toContain(secret);
  });
});
