// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
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

});
