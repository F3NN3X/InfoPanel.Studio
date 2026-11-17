// @vitest-environment happy-dom
// Pin here on a selection of three page widgets (the owner's "3 in a row", config v21): one step moves all three into the
// pinned layer on their cells, the page keeps the rest, and one Undo puts the three back on the page as they were.
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NO_PIN, usePinnedActions } from "@/components/studio/pinned/use-pinned-actions";
import { useConfigHistory } from "@/hooks/use-config-history";
import { defaultConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";

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

function useHarness(onPinnedHere: () => void) {
  const [config, setConfig] = useState(start);
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
    toast: vi.fn(),
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
