import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IconSource } from "@/lib/effects/icon";
import { withElementFile } from "@/lib/infopanel/canvas-edit";
import { elementOf } from "@/lib/infopanel/elements/apply";
import { newComposite } from "@/lib/infopanel/elements/create";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { normalizeElement } from "@/lib/infopanel/elements/spec";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import type { LibraryItem } from "@/lib/library";
import { filesToDrop, removeBlocked, removeItem } from "@/components/library/remove-item";

const api = vi.hoisted(() => ({
  deleteAsset: vi.fn(async () => {}),
  unusedAssets: vi.fn(async () => [] as { id: string }[]),
  deleteLibraryItem: vi.fn(async () => {}),
  getLibraryItem: vi.fn(),
}));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), deleteAsset: api.deleteAsset, unusedAssets: api.unusedAssets }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), deleteLibraryItem: api.deleteLibraryItem, getLibraryItem: api.getLibraryItem }));

const id = (c: string) => `${c.repeat(64)}.png`;
const item = (over: Partial<LibraryItem> = {}) => ({ id: "i", kind: "image", name: "a", createdAt: "", updatedAt: "", files: [id("a")], meta: {}, copies: [], ...over }) as LibraryItem;

beforeEach(() => vi.clearAllMocks());

describe("filesToDrop", () => {
  it("keeps only unused files the studio's config doesn't name", () => {
    const unused = [{ id: id("a") }, { id: id("b") }];
    expect(filesToDrop([id("a"), id("b"), id("c")], unused, `{"src":"/api/assets/${id("b")}"}`)).toEqual([id("a")]);
  });

  it("names each file once", () => {
    expect(filesToDrop([id("a"), id("a")], [{ id: id("a") }], "")).toEqual([id("a")]);
  });
});

describe("removeItem", () => {
  it("deletes the item, then its unused file", async () => {
    api.unusedAssets.mockResolvedValue([{ id: id("a") }]);
    expect(await removeItem(item(), () => "")).toEqual({ deleted: 1, kept: 0 });
    expect(api.deleteLibraryItem).toHaveBeenCalledWith("i");
    expect(api.deleteAsset).toHaveBeenCalledWith(id("a"));
    expect(api.deleteLibraryItem.mock.invocationCallOrder[0]).toBeLessThan(api.unusedAssets.mock.invocationCallOrder[0]);
  });

  it("keeps a file something still uses", async () => {
    api.unusedAssets.mockResolvedValue([]);
    expect(await removeItem(item(), () => "")).toEqual({ deleted: 0, kept: 0 });
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("drops a gauge's frames, loading data left out of the list", async () => {
    api.getLibraryItem.mockResolvedValue({ data: { frames: [{ id: id("b") }, { id: id("c") }] } });
    api.unusedAssets.mockResolvedValue([{ id: id("b") }, { id: id("c") }]);
    expect(await removeItem(item({ kind: "gauge", files: [], dataSize: 10 }), () => "")).toEqual({ deleted: 2, kept: 0 });
    expect(api.deleteAsset.mock.calls.map((c) => (c as unknown[])[0])).toEqual([id("b"), id("c")]);
  });

  it("asks for nothing more when the item holds no file", async () => {
    expect(await removeItem(item({ kind: "panel", files: [] }), () => "")).toEqual({ deleted: 0, kept: 0 });
    expect(api.unusedAssets).not.toHaveBeenCalled();
  });

  it("deletes no file when the item delete fails", async () => {
    api.deleteLibraryItem.mockRejectedValueOnce(new Error("nope"));
    await expect(removeItem(item(), () => "")).rejects.toThrow("nope");
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("keeps a file the live config names, read after the item is gone", async () => {
    api.unusedAssets.mockResolvedValue([{ id: id("a") }]);
    let live = "";
    api.deleteLibraryItem.mockImplementationOnce(async () => {
      live = `/api/assets/${id("a")}`;
    });
    expect(await removeItem(item(), () => live)).toEqual({ deleted: 0, kept: 0 });
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("counts a file whose delete fails, and still deletes the others", async () => {
    api.unusedAssets.mockResolvedValue([{ id: id("a") }, { id: id("b") }]);
    api.deleteAsset.mockRejectedValueOnce(new Error("busy"));
    expect(await removeItem(item({ files: [id("a"), id("b")] }), () => "")).toEqual({ deleted: 1, kept: 1 });
    expect(api.deleteAsset).toHaveBeenCalledTimes(2);
  });

  it("reports the files kept when the unused scan fails", async () => {
    api.unusedAssets.mockRejectedValueOnce(new Error("down"));
    expect(await removeItem(item(), () => "")).toEqual({ deleted: 0, kept: 1 });
  });
});

describe("removeBlocked: a file item stays while its file is in use", () => {
  it("refuses an image a profile still uses (the server's scan)", async () => {
    api.unusedAssets.mockResolvedValue([]);
    expect(await removeBlocked(item(), () => "")).toBe("used");
  });

  it("refuses a video the studio's unsaved config names", async () => {
    api.unusedAssets.mockResolvedValue([{ id: id("a") }]);
    expect(await removeBlocked(item({ kind: "video" }), () => `{"src":"/api/assets/${id("a")}"}`)).toBe("used");
  });

  it("refuses when the use check fails: nothing is known to be free", async () => {
    api.unusedAssets.mockRejectedValueOnce(new Error("down"));
    expect(await removeBlocked(item({ kind: "svg" }), () => "")).toBe("unchecked");
  });

  it("lets an unused file go", async () => {
    api.unusedAssets.mockResolvedValue([{ id: id("a") }]);
    expect(await removeBlocked(item(), () => "")).toBeNull();
  });

  it("never blocks a gauge, panel, profile or font: removeItem keeps their used files", async () => {
    for (const kind of ["gauge", "panel", "canvas", "font"] as const) expect(await removeBlocked(item({ kind }), () => "")).toBeNull();
    expect(api.unusedAssets).not.toHaveBeenCalled();
  });
});

describe("an icon used only by a Drives tile", () => {
  // The icon is picked for one drive and joins the canvas's files; nothing else names it.
  const hash = "d".repeat(64);
  const iconId = `${hash}.png`;
  const canvasWith = () => {
    const stored = newStored({ name: "Drives", width: 800, height: 480 });
    const profile = readStored(stored).profile;
    const drives = newComposite("drives", profile, defaultPalette(profile), [], 0, 0);
    const make = (source: IconSource) => normalizeElement({ ...elementOf(drives), icons: { "Drive 1": source } });
    return withElementFile(stored, profile, [drives], "0", { name: "disk.png", hash, type: "png", size: 8 }, make)!;
  };
  /** What the server's `?unused=1` answers: the files whose hash no stored canvas text names. */
  const unusedBy = (canvas: unknown) => (JSON.stringify(canvas).includes(hash) ? [] : [{ id: iconId }]);

  it("is kept when the Library item goes: the canvas names its file", async () => {
    const canvas = canvasWith();
    expect(JSON.stringify(canvas)).toContain(hash);
    api.unusedAssets.mockResolvedValue(unusedBy(canvas));
    expect(await removeItem(item({ files: [iconId] }), () => "")).toEqual({ deleted: 0, kept: 0 });
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("is kept while the studio's unsaved config names it, even if the saved canvas doesn't yet", async () => {
    api.unusedAssets.mockResolvedValue([{ id: iconId }]);
    expect(await removeItem(item({ files: [iconId] }), () => JSON.stringify({ zones: [{ canvas: canvasWith() }] }))).toEqual({ deleted: 0, kept: 0 });
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("is deleted once the Drives tile no longer has it", async () => {
    api.unusedAssets.mockResolvedValue(unusedBy({ assets: [] }));
    expect(await removeItem(item({ files: [iconId] }), () => "")).toEqual({ deleted: 1, kept: 0 });
  });
});
