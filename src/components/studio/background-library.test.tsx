// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { BackgroundLibrary, backgroundsOf } from "./background-library";

const lib = vi.hoisted(() => ({ listLibrary: vi.fn() }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

const id = (c: string, ext: string) => `${c.repeat(64)}.${ext}`;
const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: "x", kind: "image", name: "x", createdAt: "", updatedAt: "1", files: [], meta: {}, copies: [], ...over,
});
const wide = { width: 1920, height: 1080 };
const items = [
  item({ id: "bg", name: "Wide", files: [id("a", "jpg")], meta: wide }),
  item({ id: "icon", name: "Icon", files: [id("b", "png")], meta: { width: 64, height: 64 } }),
  item({ id: "tagged", name: "Tagged", files: [id("c", "png")], meta: { width: 100, height: 100, tags: ["Background"] } }),
  item({ id: "vid", kind: "video", name: "Loop", files: [id("d", "mp4")], meta: wide }),
  item({ id: "svg", kind: "svg", name: "Template", files: [id("e", "svg")], meta: wide }),
];

afterEach(cleanup);

describe("backgroundsOf", () => {
  it("keeps only Backgrounds of the kind", () => {
    expect(backgroundsOf(items, "image").map((i) => i.id)).toEqual(["bg", "tagged"]);
    expect(backgroundsOf(items, "video").map((i) => i.id)).toEqual(["vid"]);
  });
});

describe("BackgroundLibrary", () => {
  it("lists the backgrounds and picks one", async () => {
    lib.listLibrary.mockResolvedValue(items);
    const onPick = vi.fn();
    const { getByTitle, findByTitle, queryByTitle } = render(<BackgroundLibrary kind="image" value={undefined} onPick={onPick} />);
    fireEvent.click(getByTitle("Backgrounds from My library"));
    fireEvent.click(await findByTitle("Wide"));
    expect(queryByTitle("Icon")).toBeNull();
    expect(onPick).toHaveBeenCalledWith(`/api/assets/${id("a", "jpg")}`);
  });

  it("says there are none and opens the Library", async () => {
    lib.listLibrary.mockResolvedValue([items[1]]);
    const onOpen = vi.fn();
    const { getByTitle, findByText, getByText } = render(<BackgroundLibrary kind="image" value={undefined} onPick={vi.fn()} onOpenLibrary={onOpen} />);
    fireEvent.click(getByTitle("Backgrounds from My library"));
    await findByText(/No background images yet/);
    await waitFor(() => expect(getByText("Open Library")).toBeTruthy());
    fireEvent.click(getByText("Open Library"));
    expect(onOpen).toHaveBeenCalled();
  });
});
