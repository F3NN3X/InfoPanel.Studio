// @vitest-environment happy-dom
// A grid page on a screen made for InfoPanel (one-editor SPEC §5.3, §5.5, §8): the Export check lists each zone and
// sends the export through the conversion, a widget's On InfoPanel choice lands on its zone for the Convert dialog
// to start from, and an InfoPanel item dropped on the grid goes into the free area made for it.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridCheckPanel, GridOnInfoPanel } from "@/components/infopanel/grid-export";
import { ToastProvider } from "@/components/ui/toast";
import { HostedEditor } from "@tests/components/infopanel/edit/hosted-editor";
import { withCanvas } from "@/components/studio/import-actions";
import { startChoices } from "@/lib/infopanel/export/native-choices";
import { readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { cellBox } from "@/lib/free-pages";
import { freeArea } from "@/lib/page-layout";
import type { DashboardConfig, Placement, ProfileView } from "@/lib/layout";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const weather: Placement = { id: "w", module: "Weather", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true };
const view = { id: "s", name: "Desk", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", placements: [weather], pageId: "pg" } as ProfileView;

describe("the Export check on a grid page", () => {
  it("lists the zones, says the page converts, and sends Review and Export to the conversion", () => {
    const onConvert = vi.fn();
    const onSelect = vi.fn();
    render(<GridCheckPanel profile={view} nameOf={() => "Weather"} onSelect={onSelect} onConvert={onConvert} onClose={vi.fn()} />);
    expect(screen.getByText(/This page will be converted when you export/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Becomes a picture" }).textContent).toContain("Weather");
    fireEvent.click(screen.getByRole("button", { name: "Review conversion…" }));
    fireEvent.click(screen.getByRole("button", { name: "Export .infopanel" }));
    expect(onConvert).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /^Weather/ }));
    expect(onSelect).toHaveBeenCalledWith("w");
  });

  it("closes on Esc", () => {
    const onClose = vi.fn();
    render(<GridCheckPanel profile={view} nameOf={() => "Weather"} onSelect={vi.fn()} onConvert={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("a grid widget's On InfoPanel choice", () => {
  it("stores its rule on the zone, which the Convert dialog then starts from", () => {
    const onSettings = vi.fn();
    render(<GridOnInfoPanel zone={{ ...weather, settings: { units: "metric" } }} name="Weather" onSettings={onSettings} />);
    const note = screen.getByRole("note", { name: "On InfoPanel" });
    expect(note.textContent).toContain("On InfoPanel: becomes a picture");
    fireEvent.click(within(note).getByRole("radio", { name: "Snapshot" }));
    const settings = onSettings.mock.calls[0][0];
    expect(settings).toEqual({ units: "metric", $onInfoPanel: "snapshot" });
    expect(startChoices(settings)).toEqual({ zone: "snapshot" });
  });
});

describe("an InfoPanel item dropped on a grid cell", () => {
  it("makes a free area the cell's size that the editor opens on with the item added", () => {
    const area = freeArea(view, { colStart: 3, rowStart: 2, colSpan: 1, rowSpan: 1 }) as Placement & { canvas: StoredCanvas };
    const box = cellBox(view, area);
    expect(area).toMatchObject({ module: "infopanel", colStart: 3, rowStart: 2, colSpan: 1, rowSpan: 1 });
    expect(area.canvas.profile).toMatchObject({ Width: Math.round(box.width), Height: Math.round(box.height) });
    const config = { profiles: [{ id: "s", name: "Desk", pages: [{ id: "pg", name: "Main", placements: [weather, area] }] }] } as unknown as DashboardConfig;
    const setConfig = vi.fn();
    render(
      <ToastProvider>
        <HostedEditor zone={area} setConfig={setConfig} history={{ canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() }} onDone={vi.fn()} profileId="s" initialAdd={{ data: "Text" }} />
      </ToastProvider>,
    );
    const [update] = setConfig.mock.calls[0];
    const next = update(withCanvas(config, area.id, area.canvas)) as DashboardConfig;
    expect(readStored(next.profiles[0].pages[0].placements[1].canvas).items.map((i) => i.kind)).toEqual(["Text"]);
    expect(setConfig).toHaveBeenCalledTimes(1);
  });
});
