// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/assets";
import type { LibraryItem } from "@/lib/library";
import { LooseUploads, canvasHashes, looseAssets } from "@/components/library/loose-uploads";

const api = vi.hoisted(() => ({ listAssets: vi.fn(), unusedAssets: vi.fn() }));
const lib = vi.hoisted(() => ({ getLibraryItem: vi.fn() }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const id = (c: string) => `${c.repeat(64)}.png`;
const asset = (c: string): Asset => ({ id: id(c), url: `/api/assets/${id(c)}`, type: "image/png", kind: "image", size: 1, mtime: 1 });
const item = { id: "i", kind: "image", name: "a", createdAt: "", updatedAt: "", files: [id("a")], meta: {}, copies: [] } as LibraryItem;

afterEach(cleanup);

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

describe("LooseUploads", () => {
  it("is hidden when every upload is an item", async () => {
    api.listAssets.mockResolvedValue([asset("a")]);
    const { container } = render(<LooseUploads items={[item]} config={noCanvas} ready onImport={vi.fn()} onResult={vi.fn()} />);
    await waitFor(() => expect(api.listAssets).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("offers a review of the loose ones with a count; Add imports the selected", async () => {
    api.listAssets.mockResolvedValue([asset("a"), asset("b"), asset("c")]);
    api.unusedAssets.mockResolvedValue([asset("b"), asset("c")]);
    const onImport = vi.fn().mockResolvedValue({ added: 2, duplicates: 0, failed: 0 });
    const onResult = vi.fn();
    const { findByText, getByText, findByRole } = render(<LooseUploads items={[item]} config={noCanvas} ready onImport={onImport} onResult={onResult} />);
    await findByText(/2 uploaded files aren't in My library/);
    fireEvent.click(getByText("Review…"));
    fireEvent.click(await findByRole("button", { name: "Select all" }));
    fireEvent.click(getByText("Add to My library"));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("Added 2 uploaded files to My library"));
    expect(onImport.mock.calls[0][0].map((a: Asset) => a.id)).toEqual([id("b"), id("c")]);
  });

  it("does not offer the frames of a gauge whose data the list left out", async () => {
    api.listAssets.mockResolvedValue([asset("b")]);
    lib.getLibraryItem.mockResolvedValue({ data: { frames: [{ id: id("b"), name: "0.png" }] } });
    const big = { ...item, id: "g", kind: "gauge", files: [], dataSize: 300000 } as LibraryItem;
    const { container } = render(<LooseUploads items={[big]} config={noCanvas} ready onImport={vi.fn()} onResult={vi.fn()} />);
    await waitFor(() => expect(lib.getLibraryItem).toHaveBeenCalledWith("g"));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe("");
  });

  it("waits for the library list", () => {
    api.listAssets.mockClear();
    render(<LooseUploads items={[]} config={noCanvas} ready={false} onImport={vi.fn()} onResult={vi.fn()} />);
    expect(api.listAssets).not.toHaveBeenCalled();
  });
});
