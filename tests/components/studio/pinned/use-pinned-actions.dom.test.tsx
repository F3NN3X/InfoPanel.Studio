// @vitest-environment happy-dom
// Pin here on a selection of three page widgets (the owner's "3 in a row", config v21): one step moves all three into the
// pinned layer on their cells, the page keeps the rest, and one Undo puts the three back on the page as they were.
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NO_PIN, usePinnedActions } from "@/components/studio/pinned/use-pinned-actions";
import { useConfigHistory } from "@/hooks/use-config-history";
import { CANVAS_ID, defaultConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";

const zone = (id: string, col: number, row = 1) => ({ id, module: "Clock", colStart: col, rowStart: row, colSpan: 1, rowSpan: 1, visible: true });

const start = (): DashboardConfig => {
  const base = defaultConfig();
  const screen: MonitorProfile = {
    ...base.profiles[0],
    id: "s",
    cols: 4,
    rows: 3,
    pages: [
      { id: "a", name: "A", placements: [zone("w1", 1), zone("w2", 2), zone("w3", 3), zone("w4", 1, 2)] },
      { id: "b", name: "B", placements: [] },
    ],
  };
  return { ...base, activeProfile: "s", profiles: [screen] };
};

function useHarness(onPinnedHere: () => void, toast: (text: string) => void = vi.fn(), from: () => DashboardConfig = start) {
  const [config, setConfig] = useState(from);
  const history = useConfigHistory(config, setConfig);
  const stored = config.profiles[0];
  const actions = usePinnedActions({
    stored,
    page: stored.pages[0],
    updateStored: (fn, key) => history.set((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === stored.id ? fn(p) : p)) }), key),
    view: NO_PIN,
    setView: vi.fn(),
    setPinnedOn: vi.fn(),
    onPlaced: vi.fn(),
    onPinnedHere,
    toast,
  });
  return { config, history, actions };
}

describe("Pin here on a multi-selection", () => {
  it("pins three widgets in place as one undo step, and Undo puts them back", async () => {
    const onPinnedHere = vi.fn();
    const { result } = renderHook(() => useHarness(onPinnedHere));
    const before = result.current.config;

    act(() => result.current.actions.pinHere(["w1", "w2", "w3"]));
    await waitFor(() => expect(result.current.config.profiles[0].pinned?.items).toHaveLength(3));

    const after = result.current.config.profiles[0];
    expect(after.pages[0].placements.map((p) => p.id)).toEqual(["w4"]);
    expect(after.pinned?.items.map((it) => [it.placement.id, it.at])).toEqual([
      ["w1", { colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1 }],
      ["w2", { colStart: 2, rowStart: 1, colSpan: 1, rowSpan: 1 }],
      ["w3", { colStart: 3, rowStart: 1, colSpan: 1, rowSpan: 1 }],
    ]);
    expect(after.pinned?.items.every((it) => it.show === "all")).toBe(true);
    // the selection is cleared (the widgets left the page), and the change is one step
    expect(onPinnedHere).toHaveBeenCalledTimes(1);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.config.profiles[0]).toEqual(before.profiles[0]);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("pins nothing for a selection with no widget it can pin", async () => {
    const { result } = renderHook(() => useHarness(vi.fn()));
    act(() => result.current.actions.pinHere(["nope"]));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.config.profiles[0].pinned).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });
});

describe("Pin here against pins and canvas pages", () => {
  const withPinAt2 = (): DashboardConfig => {
    const c = start();
    const pin = { id: "held", at: { colStart: 2, rowStart: 1, colSpan: 1, rowSpan: 1 }, show: "all" as const, visible: true, placement: { id: "h", module: "Clock" } };
    return { ...c, profiles: [{ ...c.profiles[0], pinned: { items: [pin] } }] };
  };

  it("pins the widgets that fit and says which one stays", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useHarness(vi.fn(), toast, withPinAt2));
    act(() => result.current.actions.pinHere(["w1", "w2"]));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith("1 pinned; Clock stays: its cells are pinned already");
    expect(result.current.config.profiles[0].pinned?.items.map((it) => it.placement.id)).toEqual(["h", "w1"]);
    expect(result.current.config.profiles[0].pages[0].placements.map((p) => p.id)).toEqual(["w2", "w3", "w4"]);
  });

  it("pins nothing, and says so, when every cell is held", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useHarness(vi.fn(), toast, withPinAt2));
    act(() => result.current.actions.pinHere(["w2"]));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Clock stays: its cells are pinned already"));
    expect(result.current.history.canUndo).toBe(false);
  });

  it("hides the layer on a page that is one canvas, and the toast says so", async () => {
    const toast = vi.fn();
    const canvasPage = () => {
      const c = start();
      const canvas = { id: "cv", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 3, visible: true };
      return { ...c, profiles: [{ ...c.profiles[0], pages: [c.profiles[0].pages[0], { id: "b", name: "Imported", placements: [canvas] }] }] };
    };
    const { result } = renderHook(() => useHarness(vi.fn(), toast, canvasPage));
    act(() => result.current.actions.pinHere(["w1"]));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatch(/Hidden on Imported: it's one canvas/);
    expect(result.current.config.profiles[0].pages.map((p) => p.hidePinned ?? false)).toEqual([false, true]);
  });
});
