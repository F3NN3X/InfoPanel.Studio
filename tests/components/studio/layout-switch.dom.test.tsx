// @vitest-environment happy-dom
// Grid ↔ Free (one-editor SPEC §6): the stored switch stays one undo step that redo restores, but Edit v3 (SPEC §1,
// acceptance 5) has one kind of page, so no UI offers it: not the page tab menu, not the page inspector, which shows
// GRID with Snap items to grid instead (§10.1). Made for (§5.1) is one choice of two.
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useConfigHistory } from "@/hooks/use-config-history";
import { CANVAS_ID, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { switchLayout } from "@/lib/page-layout";
import { isFreePage } from "@/lib/free-pages";
import { MadeForControl } from "@/components/studio/made-for-control";
import { pageMenuEntries } from "@/components/studio/page-tabs";
import { PageInspector } from "@/components/studio/page-inspector";
import { THEME_PRESETS } from "@/lib/theme";
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

describe("no Grid / Free anywhere (acceptance 5)", () => {
  it("the page tab menu has no Layout entry, whatever the page holds", () => {
    const noop = () => {};
    const entries = pageMenuEntries(screenProfile.pages, { rename: noop, icon: noop, duplicate: noop, remove: noop, settings: noop });
    const ids = entries.map((e) => (e === "separator" ? "-" : e.id));
    expect(ids).toEqual(["rename", "icon", "duplicate", "delete", "-", "settings"]);
  });

  it("the page inspector shows GRID with Snap items to grid and no layout choice", () => {
    const onSnapItems = vi.fn();
    const onGrid = vi.fn();
    const config = { ...start, theme: THEME_PRESETS[0].tokens } as DashboardConfig;
    render(
      <PageInspector
        profile={screenProfile}
        page={screenProfile.pages[0]}
        inherit={{ config, setConfig: vi.fn(), navigateTo: vi.fn() }}
        onRename={vi.fn()}
        onIcon={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onShowOnKiosks={vi.fn()}
        onSnapItems={onSnapItems}
        onSize={vi.fn()}
        onGrid={onGrid}
        onGap={vi.fn()}
      />,
    );
    expect(screen.getByText("Page · Main")).toBeTruthy();
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    const snap = screen.getByRole("switch", { name: "Snap items to grid" });
    expect(snap.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Widgets always snap to cells and never overlap/)).toBeTruthy();
    fireEvent.click(snap);
    expect(onSnapItems).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("radio", { name: /Grid|Free/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/free area|Layout/i);
    const cols = screen.getByRole("textbox", { name: "Columns" });
    fireEvent.change(cols, { target: { value: "6" } });
    fireEvent.blur(cols);
    expect(onGrid).toHaveBeenCalledWith(6, 3);
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
