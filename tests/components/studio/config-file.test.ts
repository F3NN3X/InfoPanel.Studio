import { afterEach, describe, expect, it, vi } from "vitest";

const desktop = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}));
vi.mock("@/lib/desktop", () => desktop);

import { pushConfig } from "@/lib/dashboard-server";
import { CONFIG_VERSION, defaultConfig, type DashboardConfig } from "@/lib/layout";
import { configPayload, exportConfigFile, readConfigText } from "@/components/studio/config-file";

afterEach(() => {
  desktop.isTauri.mockReturnValue(true);
  desktop.openTextFile.mockReset();
  desktop.saveTextFile.mockReset();
  vi.restoreAllMocks();
});

describe("desktop export", () => {
  it("saves through the native dialog", async () => {
    desktop.saveTextFile.mockResolvedValue(true);
    const config = defaultConfig();
    await exportConfigFile(config);
    expect(desktop.saveTextFile).toHaveBeenCalledWith(
      "infopanel-studio-config.json",
      JSON.stringify(config, null, 2)
    );
  });
});

describe("a cancelled Save As", () => {
  it("reports false, so a backup that was cancelled is not taken for one that was written", async () => {
    desktop.saveTextFile.mockResolvedValue(false);
    expect(await exportConfigFile(defaultConfig())).toBe(false);
    desktop.saveTextFile.mockRejectedValue(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await exportConfigFile(defaultConfig())).toBe(false);
  });
});

describe("reading a config file", () => {
  it("loads the text through mergeConfig", async () => {
    const { config, missing } = await readConfigText(JSON.stringify(defaultConfig()));
    expect(config.profiles.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("rejects a file without profiles, or that is not JSON", async () => {
    await expect(readConfigText("{}")).rejects.toThrow("Not a Studio config");
    await expect(readConfigText("not json")).rejects.toThrow();
  });

  it("rejects profiles that are not screens (no id, no pages) or a config without a version", async () => {
    await expect(readConfigText(JSON.stringify({ profiles: [{ x: 1 }] }))).rejects.toThrow("Not a Studio config");
    await expect(readConfigText(JSON.stringify({ version: 10, profiles: [{ x: 1 }] }))).rejects.toThrow("Not a Studio config");
    await expect(readConfigText(JSON.stringify({ profiles: defaultConfig().profiles }))).rejects.toThrow("Not a Studio config");
  });

  it("refuses a config from a newer build, which mergeConfig would downgrade", async () => {
    const newer = { ...defaultConfig(), version: CONFIG_VERSION + 1 };
    await expect(readConfigText(JSON.stringify(newer))).rejects.toThrow("newer version");
  });
});

describe("the export payload", () => {
  it("is exactly the text the file holds, which Copy JSON copies", async () => {
    desktop.saveTextFile.mockResolvedValue(true);
    const config = defaultConfig();
    const payload = configPayload(config);
    if ("error" in payload) throw new Error(payload.error);
    expect(await exportConfigFile(config)).toBe(true);
    expect(desktop.saveTextFile).toHaveBeenCalledWith(payload.name, payload.text);
  });
});

describe("canvases in config files", () => {
  const stored = { format: "infopanel-canvas", version: 1, source: { name: "ARCv2" }, items: [] };
  const withZone = (zone: Record<string, unknown>): DashboardConfig => {
    const c = defaultConfig();
    const placement = { id: "z", module: "infopanel-canvas", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...zone };
    return { ...c, profiles: [{ ...c.profiles[0], pages: [{ ...c.profiles[0].pages[0], placements: [placement] }] }] } as DashboardConfig;
  };
  const files = new Map<string, string>();
  const server = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/canvases") {
          files.set("cnv_0123456789abcdef0123456789abcdef", String(init?.body));
          return new Response(JSON.stringify({ id: "cnv_0123456789abcdef0123456789abcdef" }));
        }
        const file = files.get(url.slice("/api/canvases/".length));
        if (file) return new Response(file);
        if (url === "/api/config") return new Response(JSON.stringify({ ok: true }));
        return new Response(null, { status: 404 });
      })
    );
  afterEach(() => vi.unstubAllGlobals());

  it("imports a file with its canvases inline, and the push lifts them into the store", async () => {
    server();
    const { config: loaded } = await readConfigText(JSON.stringify(withZone({ canvas: stored })));
    expect(loaded.profiles[0].pages[0].placements[0].canvas).toEqual(stored);
    await pushConfig(loaded);
    const post = vi.mocked(fetch).mock.calls.find(([u]) => u === "/api/config")!;
    const pushed = JSON.parse(String(post[1]?.body)) as DashboardConfig;
    expect(pushed.profiles[0].pages[0].placements[0]).toMatchObject({ canvasRef: "cnv_0123456789abcdef0123456789abcdef" });
    expect(pushed.profiles[0].pages[0].placements[0]).not.toHaveProperty("canvas");
  });

  it("loads the refs of a copied server config, so an export carries the canvases inline", async () => {
    server();
    files.set("cnv_0123456789abcdef0123456789abcdef", JSON.stringify(stored));
    desktop.saveTextFile.mockResolvedValue(true);
    const { config } = await readConfigText(JSON.stringify(withZone({ canvasRef: "cnv_0123456789abcdef0123456789abcdef" })));
    await exportConfigFile(config);
    const written = JSON.parse(desktop.saveTextFile.mock.calls[0][1]) as DashboardConfig;
    expect(written.profiles[0].pages[0].placements[0].canvas).toEqual(stored);
    expect(written.profiles[0].pages[0].placements[0]).not.toHaveProperty("canvasRef");
  });

  it("imports refs that can't be loaded but names their zones, and then won't export them", async () => {
    server();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, missing } = await readConfigText(JSON.stringify(withZone({ canvasRef: "cnv_ffffffffffffffffffffffffffffffff" })));
    expect(missing).toEqual(["Main display › Main › z"]);
    const exportError = vi.fn();
    expect(await exportConfigFile(config, exportError)).toBe(false);
    expect(desktop.saveTextFile).not.toHaveBeenCalled();
    expect(exportError).toHaveBeenCalledWith("Not exported: canvas not loaded for Main display › Main › z");
  });
});
