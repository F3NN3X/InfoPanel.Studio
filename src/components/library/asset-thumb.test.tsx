// @vitest-environment happy-dom
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import type { LibraryItem } from "@/lib/library";
import { AssetThumb } from "./asset-thumb";

const full = vi.hoisted(() => ({ getLibraryItem: vi.fn() }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), ...full }));

const FRAME = `${"a".repeat(64)}.png`;
const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: "g1", kind: "gauge", name: "Ring", createdAt: "", updatedAt: "1", files: [], meta: {}, copies: [], ...over,
});
const spec = { vector: STARTERS[0].gauge, min: 0, max: 100, animationSpeed: 0 };

describe("AssetThumb gauge", () => {
  it("draws a vector gauge as an svg, not the icon", () => {
    const { container } = render(<AssetThumb item={item({ data: spec })} />);
    expect(container.querySelector("svg.lucide")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows the first frame of an image sequence", () => {
    const { container } = render(<AssetThumb item={item({ files: [FRAME], data: { frames: [{ id: FRAME, name: "0.png" }], min: 0, max: 100, animationSpeed: 0 } })} />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("falls back to the icon without data", () => {
    const { container } = render(<AssetThumb item={item({})} />);
    expect(container.querySelector("svg.lucide")).not.toBeNull();
  });

  it("fetches a large item's spec lazily", async () => {
    full.getLibraryItem.mockResolvedValue(item({ data: spec }));
    const { container } = render(<AssetThumb item={item({ dataSize: 90000 })} />);
    expect(container.querySelector("svg.lucide")).not.toBeNull();
    await waitFor(() => expect(container.querySelector("svg.lucide")).toBeNull());
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
