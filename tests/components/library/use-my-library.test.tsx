// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFont } from "@tests/lib/infopanel/__fixtures__/builders";
import { useMyLibrary } from "@/components/library/use-my-library";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { ITEM_FORMAT } from "@/lib/my-library/item-format";

const HASH = "a".repeat(64);
const api = vi.hoisted(() => ({
  uploadBytes: vi.fn(async () => ({ id: `${"a".repeat(64)}.ttf`, url: "", type: "other", size: 0 })),
  listLibrary: vi.fn(async () => []),
  createLibraryItem: vi.fn(async (body: { name: string; files: string[] }) => ({ id: "i1", kind: "font", copies: [], ...body })),
  updateLibraryItem: vi.fn(async (id: string, patch: object) => ({ id, kind: "gauge", name: id, files: [], copies: [], ...patch })),
}));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), uploadBytes: api.uploadBytes }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), listLibrary: api.listLibrary, createLibraryItem: api.createLibraryItem, updateLibraryItem: api.updateLibraryItem }));

const config = { panelPresets: [], stylePresets: [] };
const fontFile = () => new File([buildFont({ 1: "Orbitron", 2: "Regular" }).slice()], "Orbitron-Regular.ttf");

beforeEach(() => vi.clearAllMocks());

describe("useMyLibrary.addFiles", () => {
  it("uploads a dropped font once and records the item", async () => {
    const { result } = renderHook(() => useMyLibrary(config));
    result.current.addFiles([fontFile()]);
    await waitFor(() => expect(api.createLibraryItem).toHaveBeenCalledOnce());
    expect(api.uploadBytes).toHaveBeenCalledOnce();
  });

  it("does not upload a file Get a font already stored: the library only records the item", async () => {
    const { result } = renderHook(() => useMyLibrary(config));
    const file = fontFile();
    result.current.addFiles([file], new Map([[file, `${HASH}.ttf`]]));
    await waitFor(() => expect(api.createLibraryItem).toHaveBeenCalledOnce());
    expect(api.uploadBytes).not.toHaveBeenCalled();
    expect(api.createLibraryItem.mock.calls[0][0]).toMatchObject({ kind: "font", name: "Orbitron", files: [`${HASH}.ttf`], meta: { hash: HASH } });
  });
});

describe("useMyLibrary.updateFormat", () => {
  const gauge = (id: string, data: unknown) => ({ id, kind: "gauge" as const, name: id, createdAt: "", updatedAt: "", files: [], meta: {}, copies: [], data });

  it("updates each older item in turn, shows it and its backup, and names the ones it couldn't read", async () => {
    const { result } = renderHook(() => useMyLibrary(config));
    await waitFor(() => expect(api.listLibrary).toHaveBeenCalled());
    const good = gauge("ring", { vector: STARTERS[0].gauge });
    let out: Awaited<ReturnType<typeof result.current.updateFormat>> | undefined;
    await act(async () => {
      out = await result.current.updateFormat([good, gauge("broken", {})]);
    });
    expect(out).toEqual({ updated: 1, failed: ["broken"] });
    expect(api.createLibraryItem).toHaveBeenCalledOnce();
    expect(api.updateLibraryItem).toHaveBeenCalledWith("ring", expect.objectContaining({ meta: { formatVersion: ITEM_FORMAT } }));
    expect(result.current.items.map((i) => i.id)).toEqual(expect.arrayContaining(["ring", "i1"]));
  });
});
