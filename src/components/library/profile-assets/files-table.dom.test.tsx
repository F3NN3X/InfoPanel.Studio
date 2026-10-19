// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { assetKey, usesOf, type AssetFile, type Doc } from "@/lib/infopanel/assets/assets";
import { findingsOf } from "@/lib/infopanel/assets/stored-doc";
import { FilesTable } from "./files-table";

const file = (name: string, byte: number, url?: string): AssetFile => ({
  name,
  bytes: new Uint8Array([byte]),
  hash: String(byte).repeat(64).slice(0, 64),
  type: "png",
  width: 8,
  height: 8,
  origin: "export",
  ...(url ? { url } : {}),
});

const frames = [file("fan_000.png", 1, "/api/assets/1.png"), file("fan_001.png", 2, "/api/assets/2.png"), file("fan_002.png", 3, "/api/assets/3.png")];
const tile = file("tile.png", 4, "/api/assets/4.png");
const doc: Doc = { items: [], assets: new Map([...frames, tile, file("logo.png", 5)].map((f) => [assetKey(f.name), f])) };

function view(over: Partial<Parameters<typeof FilesTable>[0]> = {}) {
  const onUse = vi.fn();
  render(
    <FilesTable
      doc={doc}
      found={findingsOf(doc)}
      uses={usesOf(doc.items)}
      filter={null}
      tiledOnly={false}
      tiledSrc="/api/assets/4.png"
      useBlocked={undefined}
      disabled={false}
      onUse={onUse}
      onSelectUses={vi.fn()}
      onSave={vi.fn()}
      onReplace={vi.fn()}
      onRemove={vi.fn()}
      {...over}
    />,
  );
  return { onUse };
}

describe("profile files table", () => {
  it("collapses a numbered frame series into one row with a frame count, and expands it", () => {
    view();
    expect(screen.getByText("3 frames")).toBeTruthy();
    expect(screen.queryByText("fan_001.png")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /fan/ }));
    expect(screen.getByText("fan_001.png")).toBeTruthy();
    expect(screen.getByText("tile.png")).toBeTruthy();
  });

  it("marks the file used as the tiled page background", () => {
    view();
    const row = screen.getByText("tile.png").closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText("Tiled")).toBeTruthy();
    expect(within(screen.getByText("logo.png").closest('[role="row"]') as HTMLElement).queryByText("Tiled")).toBeNull();
  });

  it("filters to the tiled file", () => {
    view({ tiledOnly: true });
    expect(screen.getByText("tile.png")).toBeTruthy();
    expect(screen.queryByText("logo.png")).toBeNull();
    expect(screen.queryByText("3 frames")).toBeNull();
  });

  it("Use for selection applies a stored file, and is off with the reason when nothing takes it or the file has no URL", () => {
    const { onUse } = view();
    fireEvent.click(screen.getByRole("button", { name: "Use tile.png for selection" }));
    expect(onUse).toHaveBeenCalledWith(tile);
    expect((screen.getByRole("button", { name: "Use logo.png for selection" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows why Use for selection is off", () => {
    view({ useBlocked: "Select an image widget on the canvas first" });
    const button = screen.getByRole("button", { name: "Use tile.png for selection" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Select an image widget on the canvas first");
  });
});
