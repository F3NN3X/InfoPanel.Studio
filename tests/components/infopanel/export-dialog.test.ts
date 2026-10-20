import { afterEach, describe, expect, it, vi } from "vitest";

const { isTauri, saveBinaryFile } = vi.hoisted(() => ({ isTauri: vi.fn(), saveBinaryFile: vi.fn() }));
vi.mock("@/lib/desktop", () => ({ isTauri, saveBinaryFile }));

import { download } from "@/components/infopanel/export-dialog";

const bytes = new Uint8Array([1, 2, 3]);

function stubBrowser() {
  const click = vi.fn();
  vi.stubGlobal("document", { createElement: vi.fn(() => ({ click })) });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  return click;
}

afterEach(() => {
  vi.unstubAllGlobals();
  isTauri.mockReset();
  saveBinaryFile.mockReset();
});

describe("download", () => {
  it("downloads in a browser without touching the desktop bridge", async () => {
    isTauri.mockReturnValue(false);
    const click = stubBrowser();
    await download("a.infopanel", bytes, "application/octet-stream");
    expect(click).toHaveBeenCalledOnce();
    expect(saveBinaryFile).not.toHaveBeenCalled();
  });

  it("saves natively in the desktop app, keeping the double extension for zips", async () => {
    isTauri.mockReturnValue(true);
    saveBinaryFile.mockResolvedValue(true);
    const click = stubBrowser();
    await download("p.canvas.zip", bytes, "application/zip");
    await download("p.infopanel", bytes, "application/octet-stream");
    expect(saveBinaryFile).toHaveBeenNthCalledWith(1, "p.canvas.zip", "zip", bytes);
    expect(saveBinaryFile).toHaveBeenNthCalledWith(2, "p.infopanel", "infopanel", bytes);
    expect(click).not.toHaveBeenCalled();
  });

  it("does nothing more when the user cancels", async () => {
    isTauri.mockReturnValue(true);
    saveBinaryFile.mockResolvedValue(false);
    const click = stubBrowser();
    await download("a.infopanel", bytes, "application/octet-stream");
    expect(click).not.toHaveBeenCalled();
  });

  it("logs an error and falls back to the browser download", async () => {
    isTauri.mockReturnValue(true);
    saveBinaryFile.mockRejectedValue(new Error("boom"));
    const click = stubBrowser();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await download("a.infopanel", bytes, "application/octet-stream");
    expect(log).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
