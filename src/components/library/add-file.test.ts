import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { autoTags } from "@/lib/my-library/model";
import { addFileToLibrary } from "./add-file";

const mocks = vi.hoisted(() => ({ createLibraryItem: vi.fn(), uploadBytes: vi.fn(), readMeta: vi.fn() }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), createLibraryItem: mocks.createLibraryItem }));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), uploadBytes: mocks.uploadBytes }));
vi.mock("@/lib/my-library/decode", () => ({ readMeta: mocks.readMeta }));

const ID = `${"a".repeat(64)}.png`;
const PNG = new Uint8Array(32).map((_, i) => [0x89, 0x50, 0x4e, 0x47][i] ?? 0);
const file = () => new File([PNG], "wall.png", { type: "image/png" });
const held = { id: "old", kind: "image", name: "wall", createdAt: "", updatedAt: "", files: [ID], meta: {}, copies: [] } as LibraryItem;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readMeta.mockResolvedValue({ type: "png", width: 1920, height: 1080 });
  mocks.createLibraryItem.mockImplementation(async (i) => ({ ...i, id: "new", createdAt: "", updatedAt: "", copies: [] }));
});

describe("addFileToLibrary", () => {
  it("creates an item with the media meta, so a wide image is a Background", async () => {
    const r = await addFileToLibrary(file(), [], ID);
    expect(r.state).toBe("done");
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
    const made = mocks.createLibraryItem.mock.calls[0][0];
    expect(made).toMatchObject({ kind: "image", name: "wall.png", files: [ID], meta: { width: 1920, height: 1080 } });
    expect(autoTags("image", made.meta)).toContain("Background");
  });

  it("reuses the item that already holds the asset", async () => {
    const r = await addFileToLibrary(file(), [held], ID);
    expect(r).toEqual({ state: "duplicate", item: held });
    expect(mocks.createLibraryItem).not.toHaveBeenCalled();
  });

  it("refuses what the library does not take", async () => {
    const r = await addFileToLibrary(new File([new Uint8Array(8)], "x.bin"), [], ID);
    expect(r.state).toBe("error");
  });
});
