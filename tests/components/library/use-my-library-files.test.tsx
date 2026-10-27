// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/assets";
import type { LibraryItem } from "@/lib/library";
import { useMyLibrary } from "@/components/library/use-my-library";

const ID = `${"a".repeat(64)}.png`;
const PNG = new Uint8Array(32).map((_, i) => [0x89, 0x50, 0x4e, 0x47][i] ?? 0);
const asset: Asset = { id: ID, url: `/api/assets/${ID}`, type: "image/png", kind: "image", size: PNG.length, mtime: 1 };
const stored = { id: "lib_1", kind: "image", name: "wall.png", createdAt: "", updatedAt: "", files: [ID], meta: {}, copies: [] } as LibraryItem;

const api = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  unusedAssets: vi.fn(),
  deleteAsset: vi.fn(async () => {}),
  listLibrary: vi.fn(),
  createLibraryItem: vi.fn(),
  deleteLibraryItem: vi.fn(async () => {}),
  readMeta: vi.fn(async () => ({ type: "png", width: 64, height: 64 })),
}));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), uploadBytes: api.uploadBytes, unusedAssets: api.unusedAssets, deleteAsset: api.deleteAsset }));
vi.mock("@/lib/library", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listLibrary: api.listLibrary,
  createLibraryItem: api.createLibraryItem,
  deleteLibraryItem: api.deleteLibraryItem,
}));
vi.mock("@/lib/my-library/decode", () => ({ readMeta: api.readMeta }));

const config = { panelPresets: [], stylePresets: [] };
const mount = async (server: LibraryItem[]) => {
  api.listLibrary.mockResolvedValue(server);
  const hook = renderHook(() => useMyLibrary(config));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob([PNG], { type: "image/png" }))));
  api.createLibraryItem.mockImplementation(async (i: Partial<LibraryItem>) => ({ ...i, id: "new", createdAt: "", updatedAt: "", copies: [] }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useMyLibrary.importAssets (adopting an upload)", () => {
  it("keeps the stored file as it is: no upload, the same id, a readable name", async () => {
    const { result } = await mount([]);
    expect(await result.current.importAssets([asset])).toEqual({ added: 1, duplicates: 0, failed: 0 });
    expect(api.uploadBytes).not.toHaveBeenCalled();
    expect(api.createLibraryItem.mock.calls[0][0]).toMatchObject({ kind: "image", name: "Upload aaaaaaaa.png", files: [ID], meta: { hash: "a".repeat(64) } });
    await waitFor(() => expect(result.current.items.some((i) => i.id === "new")).toBe(true));
  });

  it("adds a file once: a second run finds the item that holds it", async () => {
    const { result } = await mount([]);
    await result.current.importAssets([asset]);
    expect(await result.current.importAssets([asset])).toEqual({ added: 0, duplicates: 1, failed: 0 });
    expect(api.createLibraryItem).toHaveBeenCalledOnce();
  });

  it("never touches an item that already holds the file (its name and data stay)", async () => {
    const { result } = await mount([stored]);
    expect(await result.current.importAssets([asset])).toEqual({ added: 0, duplicates: 1, failed: 0 });
    expect(api.createLibraryItem).not.toHaveBeenCalled();
    expect(result.current.items.find((i) => i.id === "lib_1")?.name).toBe("wall.png");
  });

  it("counts a file it can't read as failed and goes on", async () => {
    const { result } = await mount([]);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("gone"));
    expect(await result.current.importAssets([asset, { ...asset, id: `${"b".repeat(64)}.png` }])).toEqual({ added: 1, duplicates: 0, failed: 1 });
  });
});

describe("useMyLibrary.remove (a used file stays)", () => {
  it("keeps an image a screen uses: the item stays and nothing is deleted", async () => {
    const { result } = await mount([stored]);
    expect(await result.current.remove(stored, () => `{"src":"/api/assets/${ID}"}`)).toEqual({ deleted: 0, kept: 0, refused: "used" });
    expect(api.deleteLibraryItem).not.toHaveBeenCalled();
    expect(api.deleteAsset).not.toHaveBeenCalled();
    expect(result.current.items.some((i) => i.id === "lib_1")).toBe(true);
  });

  it("removes an image nothing uses, with its file", async () => {
    api.unusedAssets.mockResolvedValue([{ id: ID }]);
    const { result } = await mount([stored]);
    expect(await result.current.remove(stored, () => "")).toEqual({ deleted: 1, kept: 0 });
    expect(api.deleteLibraryItem).toHaveBeenCalledWith("lib_1");
    expect(api.deleteAsset).toHaveBeenCalledWith(ID);
  });
});
