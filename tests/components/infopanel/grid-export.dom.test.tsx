// @vitest-environment happy-dom
// A grid page on a screen made for InfoPanel (one-editor SPEC §5.3, §5.5, §8): the Export check lists each zone and
// sends the export through the conversion, a widget's On InfoPanel choice lands on its zone for the Convert dialog
// to start from. An InfoPanel item added to the page is an item placement (`grid-item-add.test.ts`).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridBadge, GridCheckPanel, GridOnInfoPanel } from "@/components/infopanel/grid-export";
import { startChoices } from "@/lib/infopanel/export/native-choices";
import type { Placement, ProfileView } from "@/lib/layout";

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

  it("takes Esc before the studio's shortcuts, which take it on the window too, but leaves it to a dialog over it", () => {
    const studioKeys = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener("keydown", studioKeys);
    try {
      const onClose = vi.fn();
      render(<GridCheckPanel profile={view} nameOf={() => "Weather"} onSelect={vi.fn()} onConvert={vi.fn()} onClose={onClose} />);
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      const dialog = document.body.appendChild(document.createElement("div"));
      dialog.setAttribute("role", "dialog");
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      dialog.remove();
    } finally {
      window.removeEventListener("keydown", studioKeys);
    }
  });
});

describe("a grid zone's badge", () => {
  it("shows its status as a Studio widget", () => {
    const { container, rerender } = render(<GridBadge zone={weather} name="Weather" />);
    expect(container.querySelector('[data-testid="canvas-badge"]')?.getAttribute("data-status")).toBe("pic");
    rerender(<GridBadge zone={{ ...weather, module: "Clock" }} name="Clock" />);
    expect(container.querySelector('[data-testid="canvas-badge"]')?.getAttribute("data-status")).toBe("ok");
    rerender(<GridBadge zone={{ ...weather, settings: { $onInfoPanel: "leave" } }} name="Weather" />);
    expect(screen.getByLabelText("Left out")).toBeTruthy();
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
