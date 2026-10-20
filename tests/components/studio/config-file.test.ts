import { afterEach, describe, expect, it, vi } from "vitest";

const desktop = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}));
vi.mock("@/lib/desktop", () => desktop);

import { pushConfig } from "@/lib/dashboard-server";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { exportConfigFile, importConfigText, startConfigImport } from "@/components/studio/config-file";

afterEach(() => {
  desktop.isTauri.mockReturnValue(true);
  desktop.openTextFile.mockReset();
  desktop.saveTextFile.mockReset();
  vi.restoreAllMocks();
});

describe("desktop export", () => {
  it("saves through the native dialog", () => {
    desktop.saveTextFile.mockResolvedValue(true);
    const config = defaultConfig();
    exportConfigFile(config);
    expect(desktop.saveTextFile).toHaveBeenCalledWith(
      "infopanel-studio-config.json",
      JSON.stringify(config, null, 2)
    );
  });
});

describe("desktop import", () => {
  it("loads the picked file through mergeConfig as one change", async () => {
    desktop.openTextFile.mockResolvedValue(JSON.stringify(defaultConfig()));
    const onLoad = vi.fn();
    startConfigImport(null, onLoad);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    expect(onLoad.mock.calls[0][0].profiles.length).toBeGreaterThan(0);
  });

  it("does nothing when the dialog is cancelled", async () => {
    desktop.openTextFile.mockResolvedValue(null);
    const onLoad = vi.fn();
    startConfigImport(null, onLoad);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("rejects a file without profiles", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onLoad = vi.fn();
    importConfigText("{}", onLoad);
    importConfigText("not json", onLoad);
    expect(onLoad).not.toHaveBeenCalled();
  });
});

describe("browser import", () => {
  it("clicks the file input and never opens the native dialog", () => {
    desktop.isTauri.mockReturnValue(false);
    const input = { click: vi.fn() } as unknown as HTMLInputElement;
    startConfigImport(input, vi.fn());
    expect(input.click).toHaveBeenCalledTimes(1);
    expect(desktop.openTextFile).not.toHaveBeenCalled();
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
    const onLoad = vi.fn();
    importConfigText(JSON.stringify(withZone({ canvas: stored })), onLoad);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    const loaded = onLoad.mock.calls[0][0] as DashboardConfig;
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
    const onLoad = vi.fn();
    importConfigText(JSON.stringify(withZone({ canvasRef: "cnv_0123456789abcdef0123456789abcdef" })), onLoad);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    exportConfigFile(onLoad.mock.calls[0][0]);
    const written = JSON.parse(desktop.saveTextFile.mock.calls[0][1]) as DashboardConfig;
    expect(written.profiles[0].pages[0].placements[0].canvas).toEqual(stored);
    expect(written.profiles[0].pages[0].placements[0]).not.toHaveProperty("canvasRef");
  });

  it("imports refs that can't be loaded but names their zones, and then won't export them", async () => {
    server();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onLoad = vi.fn();
    const onError = vi.fn();
    importConfigText(JSON.stringify(withZone({ canvasRef: "cnv_ffffffffffffffffffffffffffffffff" })), onLoad, onError);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith("Imported, but no canvas could be loaded for Main display › Main › z");
    const exportError = vi.fn();
    exportConfigFile(onLoad.mock.calls[0][0], exportError);
    expect(desktop.saveTextFile).not.toHaveBeenCalled();
    expect(exportError).toHaveBeenCalledWith("Not exported: canvas not loaded for Main display › Main › z");
  });

  it("tells the user why an import failed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    importConfigText("{}", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith("Not imported: Missing profiles");
  });
});
