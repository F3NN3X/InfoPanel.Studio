// @vitest-environment happy-dom
// Grid ↔ Free in the studio (one-editor SPEC §6, acceptance 9) and Made for (§5.1): a switch is one undo step that
// redo restores, the Layout control and the page tab menu offer it, and Made for is one choice of two.
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useConfigHistory } from "@/hooks/use-config-history";
import { CANVAS_ID, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { switchLayout } from "@/lib/page-layout";
import { isFreePage } from "@/lib/free-pages";
import { LayoutControl, ToGridDialog } from "@/components/studio/layout-control";
import { MadeForControl } from "@/components/studio/made-for-control";
import { layoutOf, pageMenuEntries } from "@/components/studio/page-tabs";
import { ITEM_TILES } from "@/components/studio/add-tiles";
import { PALETTE } from "@/lib/infopanel/editor/create";

const screenProfile: MonitorProfile = {
  id: "s1", name: "Desk", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill",
  pages: [{ id: "pg", name: "Main", placements: [
    { id: "clock", module: "Clock", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { face: "digital" } },
    { id: "weather", module: "Weather", colStart: 2, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true },
  ] }],
};
const start = { version: 14, activeProfile: "auto", profiles: [screenProfile], theme: {}, radius: 0.5 } as unknown as DashboardConfig;

function useStudio() {
  const [config, setConfig] = useState(start);
  const history = useConfigHistory(config, setConfig);
  const flip = (to: "grid" | "free") =>
    history.set((c) => {
      const r = switchLayout(c, "s1", "pg", to);
      return "refused" in r ? c : r.config;
    });
  return { config, history, flip };
}

describe("a layout switch", () => {
  it("is one undo step each way, and redo restores it (acceptance 9)", () => {
    const { result } = renderHook(useStudio);
    const page = () => result.current.config.profiles[0].pages[0];
    act(() => result.current.flip("free"));
    expect(isFreePage(result.current.config.profiles[0], page())).toBe(true);
    act(() => result.current.flip("grid"));
    expect(page().placements.map((z) => z.id)).toEqual(["clock", "weather"]);
    act(() => result.current.history.undo());
    expect(isFreePage(result.current.config.profiles[0], page())).toBe(true);
    act(() => result.current.history.undo());
    expect(page()).toEqual(screenProfile.pages[0]);
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.redo());
    expect(isFreePage(result.current.config.profiles[0], page())).toBe(true);
    expect(page().placements[0].module).toBe(CANVAS_ID);
  });
});

describe("the Layout control", () => {
  it("switches to the other layout only, and says what the switch does", () => {
    const onChange = vi.fn();
    render(<LayoutControl layout="grid" onChange={onChange} />);
    expect(screen.getByText(/Grid → Free keeps every widget exactly where it is/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Grid/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /Free/ }));
    expect(onChange).toHaveBeenCalledWith("free");
  });

  it("is off while the page's content isn't loaded", () => {
    render(<LayoutControl layout="free" onChange={vi.fn()} disabled="This page's content isn't loaded yet." />);
    expect(screen.getByRole("radio", { name: /Grid/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("This page's content isn't loaded yet.")).toBeTruthy();
  });

  it("asks before a Free → Grid that makes a free area, with Don't ask again", () => {
    const onConfirm = vi.fn();
    render(<ToGridDialog parts={3} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText(/3 parts overlap or are InfoPanel items/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Don't ask again" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Grid" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});

describe("the page tab menu", () => {
  it("has Layout ▸ Grid / Free, the current one checked and picking it a no-op", () => {
    const layout = vi.fn();
    const noop = () => {};
    const entries = pageMenuEntries(screenProfile.pages, { rename: noop, icon: noop, duplicate: noop, remove: noop, settings: noop, layout }, "grid");
    const sub = entries.find((e) => e !== "separator" && e.id === "layout");
    if (!sub || sub === "separator" || !sub.submenu) throw new Error("no Layout submenu");
    const [grid, free] = sub.submenu as Exclude<(typeof sub.submenu)[number], "separator">[];
    expect([grid.label, free.label]).toEqual(["Grid", "Free"]);
    expect(grid.icon).toBeTruthy();
    grid.onSelect?.();
    free.onSelect?.();
    expect(layout).toHaveBeenCalledTimes(1);
    expect(layout).toHaveBeenCalledWith("free");
    // Without a layout action the submenu isn't offered.
    expect(pageMenuEntries(screenProfile.pages, { rename: noop, icon: noop, duplicate: noop, remove: noop, settings: noop }).some((e) => e !== "separator" && e.id === "layout")).toBe(false);
    // Read from the page's shape (v15 keeps no flag): one canvas spanning the grid is Free, anything else Grid.
    const canvasZone = { id: "c", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 3, visible: true };
    expect(layoutOf({ cols: 4, rows: 3 }, { placements: [canvasZone] })).toBe("free");
    expect(layoutOf({ cols: 4, rows: 3 }, { placements: [{ ...canvasZone, colSpan: 3 }] })).toBe("grid");
    expect(layoutOf({ cols: 4, rows: 3 }, { placements: [] })).toBe("grid");
  });
});

describe("Made for", () => {
  it("reads unset as Studio panels and picks InfoPanel too", async () => {
    const onChange = vi.fn();
    render(<MadeForControl value={undefined} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Made for: Studio panels" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /InfoPanel too/ }));
    expect(onChange).toHaveBeenCalledWith("infopanel");
  });
});

it("offers every InfoPanel item kind in Add as the palette has them, in its order", () => {
  expect(ITEM_TILES.map((t) => t.data)).toEqual(PALETTE.map((p) => p.kind));
});
