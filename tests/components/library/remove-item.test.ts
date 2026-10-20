import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { filesToDrop, removeItem } from "@/components/library/remove-item";

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
