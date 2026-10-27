// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/assets";
import type { LibraryItem } from "@/lib/library";
import { canvasHashes, looseAssets, uploadName, useAdoptUploads, type AdoptUploadsOptions } from "@/components/library/adopt-uploads";

const api = vi.hoisted(() => ({ listAssets: vi.fn() }));
const lib = vi.hoisted(() => ({ getLibraryItem: vi.fn() }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const id = (c: string) => `${c.repeat(64)}.png`;
const asset = (c: string): Asset => ({ id: id(c), url: `/api/assets/${id(c)}`, type: "image/png", kind: "image", size: 1, mtime: 1 });
const item = { id: "i", kind: "image", name: "a", createdAt: "", updatedAt: "", files: [id("a")], meta: {}, copies: [] } as LibraryItem;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const noCanvas = { profiles: [] };
const withCanvas = (z: object) => ({ profiles: [{ pages: [{ placements: [z] }] }] }) as never;

describe("looseAssets", () => {
  it("keeps the assets no item holds", () => {
    expect(looseAssets([asset("a"), asset("b")], [item], new Set()).map((a) => a.id)).toEqual([id("b")]);
  });

  it("drops fonts and other kinds", () => {
    const font = { ...asset("f"), kind: "font" } as unknown as Asset;
    expect(looseAssets([font], [], new Set())).toEqual([]);
  });

  it("drops assets a canvas's table, supplied font or screenshot carries", () => {
    const cfg = withCanvas({ canvas: { assets: [{ hash: "b".repeat(64) }], fonts: [{ supplied: { hash: "c".repeat(64) } }], screenshot: id("d") } });
    const set = canvasHashes(cfg)!;
    expect(looseAssets([asset("b"), asset("c"), asset("d"), asset("e")], [], set).map((a) => a.id)).toEqual([id("e")]);
  });

  it("drops a gauge's frames and a saved canvas's files", () => {
    const gauge = { ...item, id: "g", kind: "gauge", files: [], data: { frames: [{ id: id("b"), name: "0.png" }] } } as LibraryItem;
    const canvas = { ...item, id: "c", kind: "canvas", files: [id("a"), id("c")] } as LibraryItem;
    expect(looseAssets([asset("b"), asset("c"), asset("e")], [gauge, canvas], new Set()).map((a) => a.id)).toEqual([id("e")]);
  });

  it("keeps a page background's image and an unreferenced one", () => {
    const cfg = { profiles: [{ background: { type: "image", src: `/api/assets/${id("b")}` }, pages: [{ placements: [{ module: "clock" }] }] }] } as never;
    expect(looseAssets([asset("b"), asset("e")], [], canvasHashes(cfg)).map((a) => a.id)).toEqual([id("b"), id("e")]);
  });

  it("drops the frames a Custom gauge zone keeps", () => {
    const cfg = withCanvas({ module: "CustomGauge", settings: { frames: JSON.stringify([{ id: id("b"), name: "0.png" }]) } });
    expect(looseAssets([asset("b"), asset("e")], [], canvasHashes(cfg)).map((a) => a.id)).toEqual([id("e")]);
    expect(canvasHashes(withCanvas({ settings: { frames: "not json" } }))).toEqual(new Set());
  });

  it("offers nothing while a canvas is not loaded", () => {
    expect(canvasHashes(withCanvas({ canvasRef: "x" }))).toBeNull();
    expect(looseAssets([asset("e")], [], null)).toEqual([]);
  });
});

describe("useAdoptUploads", () => {
  const adopted = (r: { added: number }) => vi.fn().mockResolvedValue({ added: r.added, duplicates: 0, failed: 0 });
  const mount = (props: Partial<AdoptUploadsOptions> & Pick<AdoptUploadsOptions, "adopt">) =>
    renderHook((p: AdoptUploadsOptions) => useAdoptUploads(p), { initialProps: { items: [item], config: noCanvas, ready: true, ...props } });
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it("brings the uploads no item holds into My library, once, and says how many", async () => {
    api.listAssets.mockResolvedValue([asset("a"), asset("b"), asset("c")]);
    const adopt = adopted({ added: 2 });
    const onAdopted = vi.fn();
    const { rerender } = mount({ adopt, onAdopted });
    await waitFor(() => expect(adopt).toHaveBeenCalledOnce());
    expect(adopt.mock.calls[0][0].map((a: Asset) => a.id)).toEqual([id("b"), id("c")]);
    await waitFor(() => expect(onAdopted).toHaveBeenCalledWith(2));
    // A re-render before the new items arrive (or after a failed add) doesn't try the same files again.
    rerender({ items: [item], config: noCanvas, ready: true, adopt, onAdopted });
    await settle();
    expect(adopt).toHaveBeenCalledOnce();
  });

  it("is idempotent: with every upload an item there is nothing to adopt", async () => {
    api.listAssets.mockResolvedValue([asset("a"), asset("b")]);
    const adopt = adopted({ added: 0 });
    const held = { ...item, id: "j", files: [id("b")] };
    mount({ adopt, items: [item, held] });
    await waitFor(() => expect(api.listAssets).toHaveBeenCalled());
    await settle();
    expect(adopt).not.toHaveBeenCalled();
  });

  it("names an adopted upload from its stored id, keeping the extension", () => {
    expect(uploadName({ id: id("1") })).toBe("Upload 11111111.png");
    expect(uploadName({ id: "abcdef0123" })).toBe("Upload abcdef01");
  });

  it("never takes the frames of a gauge whose data the list left out", async () => {
    api.listAssets.mockResolvedValue([asset("b")]);
    lib.getLibraryItem.mockResolvedValue({ data: { frames: [{ id: id("b"), name: "0.png" }] } });
    const big = { ...item, id: "g", kind: "gauge", files: [], dataSize: 300000 } as LibraryItem;
    const adopt = adopted({ added: 0 });
    mount({ adopt, items: [big] });
    await waitFor(() => expect(lib.getLibraryItem).toHaveBeenCalledWith("g"));
    await settle();
    expect(adopt).not.toHaveBeenCalled();
  });

  it("adopts nothing while a gauge's data won't load (its frames are unknown)", async () => {
    api.listAssets.mockResolvedValue([asset("b")]);
    lib.getLibraryItem.mockRejectedValue(new Error("down"));
    const big = { ...item, id: "g", kind: "gauge", files: [], dataSize: 300000 } as LibraryItem;
    const adopt = adopted({ added: 0 });
    mount({ adopt, items: [big] });
    await waitFor(() => expect(lib.getLibraryItem).toHaveBeenCalled());
    await settle();
    expect(adopt).not.toHaveBeenCalled();
  });

  it("waits for the library list", async () => {
    const adopt = adopted({ added: 0 });
    mount({ adopt, items: [], ready: false });
    await settle();
    expect(api.listAssets).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
  });
});
