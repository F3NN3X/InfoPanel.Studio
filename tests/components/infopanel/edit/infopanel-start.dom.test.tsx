// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfoPanelStart } from "@/components/infopanel/edit/infopanel-start";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { canvasItem } from "@/lib/my-library/canvas-link";

const placed = newStored({ name: "Desk", width: 800, height: 480, now: new Date("2026-10-25T10:00:00Z") });
const spare = newStored({ name: "Spare", width: 1920, height: 480, now: new Date("2026-10-25T11:00:00Z") });
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas: placed } as Placement & { canvas: StoredCanvas };
const config = { profiles: [{ id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] }] } as unknown as DashboardConfig;

const item = (id: string, stored: StoredCanvas): LibraryItem => {
  const input = canvasItem(stored, stored.source.name);
  return { id, kind: "canvas", name: input.name, createdAt: "t", updatedAt: "t", files: [], meta: input.meta ?? {}, copies: [] };
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([item("lib-placed", placed), item("lib-spare", spare)]), { status: 200 }))));
});

describe("the InfoPanel start view", () => {
  it("lists the Library profiles that aren't placed here, and opens one", async () => {
    const onOpenLibrary = vi.fn();
    render(<InfoPanelStart config={config} onOpen={vi.fn()} onOpenLibrary={onOpenLibrary} onNew={vi.fn()} onImport={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "In your Library" })).toBeTruthy();
    // The placed one is under "In this dashboard" only.
    expect(screen.getAllByText("Desk")).toHaveLength(1);
    fireEvent.click(screen.getByText("Spare"));
    expect(onOpenLibrary).toHaveBeenCalledWith(expect.objectContaining({ id: "lib-spare" }));
  });
});
