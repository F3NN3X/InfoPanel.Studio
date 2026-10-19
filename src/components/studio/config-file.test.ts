import { afterEach, describe, expect, it, vi } from "vitest";

const desktop = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}));
vi.mock("@/lib/desktop", () => desktop);

import { defaultConfig } from "@/lib/layout";
import { exportConfigFile, importConfigText, startConfigImport } from "./config-file";

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
