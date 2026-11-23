// @vitest-environment happy-dom
// The Add list's widget row: "N presets" (N > 1) opens a row for each preset, and a click on one adds that preset.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCatalog } from "@/components/studio/add-catalog";
import { AddTileGrid, TILE_COLS } from "@/components/studio/add-tile-grid";
import { addSections, widgetTile } from "@/components/studio/add-tiles";
import { loadWidgetPresets } from "@/components/studio/widget-presets";

const catalog = addCatalog(undefined, await loadWidgetPresets());
const pick = (...ids: string[]) => catalog.widget.filter((w) => ids.includes(w.id)).map(widgetTile);

afterEach(cleanup);

function grid(ids: string[]) {
  const onAdd = vi.fn();
  const sections = addSections({ widgets: pick(...ids), segment: "widgets", chip: "All", query: "", recent: [] });
  render(<AddTileGrid sections={sections} onAdd={onAdd} onHover={() => {}} onDragStart={() => {}} />);
  return onAdd;
}

describe("AddTileGrid presets", () => {
  it("shows N presets on a widget with a choice, none on a widget without, and the rows only once opened", () => {
    grid(["Weather", "Clock"]);
    expect(screen.getByTestId("add-presets-toggle").textContent).toContain("6 presets");
    expect(screen.getAllByTestId("add-presets-toggle")).toHaveLength(1);
    expect(screen.queryAllByTestId("add-preset")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("add-presets-toggle"));
    expect(screen.getAllByTestId("add-preset").map((b) => b.textContent)).toEqual(["Now3×2", "Forecast4×1", "Minimal3×2", "Glance3×2", "Week5×2"]);
  });

  it("adds the preset's row, not the widget, and opening the list adds nothing", () => {
    const onAdd = grid(["Weather"]);
    fireEvent.click(screen.getByTestId("add-presets-toggle"));
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Minimal"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].widget.drop).toEqual({ kind: "module", id: "Weather", settings: { view: "minimal", showForecast: false, showStats: false, showFeels: false } });
  });
});

describe("AddTileGrid columns", () => {
  it("draws as many tracks as the panel's arrow keys step through", () => {
    grid(["Weather", "Clock"]);
    const tracks = document.querySelector<HTMLElement>("[data-add-grid]")!.style.gridTemplateColumns;
    expect(tracks).toBe("minmax(0, 1fr)");
    expect(TILE_COLS).toBe(1);
  });
});
