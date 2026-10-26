// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MonitorProfile, Placement } from "@/lib/layout";
import type { DashboardModule } from "@/modules/types";
import { HOLD_MS, useLoadedProfile } from "@/widgets/preload";

type P = Pick<MonitorProfile, "id" | "pages">;
const screen = (id: string, module: string): P => ({ id, pages: [{ id: "p", name: "P", placements: [{ id: "z", module } as Placement] }] });

/** A module whose chunk resolves when `release` is called. */
function pending(id: string) {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return { mod: { id, preload: () => done } as DashboardModule, release };
}

describe("useLoadedProfile", () => {
  it("keeps a kiosk's screen up until the next one's widgets are in", async () => {
    const weather = pending("Weather");
    const mods = [weather.mod];
    const a = screen("a", "Clock");
    const b = screen("b", "Weather");
    const { result, rerender } = renderHook(({ wanted }) => useLoadedProfile(wanted, mods, true), { initialProps: { wanted: a } });
    expect(result.current).toBe(a);
    rerender({ wanted: b });
    expect(result.current).toBe(a);
    await act(async () => weather.release());
    expect(result.current).toBe(b);
  });

  it("draws the first screen, a change to the shown screen, and anything before the server's config at once", () => {
    const weather = pending("Weather");
    const a = screen("a", "Weather");
    const edited = { ...a, pages: [] };
    const { result, rerender } = renderHook(({ wanted, hold }) => useLoadedProfile(wanted, [weather.mod], hold), { initialProps: { wanted: a, hold: true } });
    expect(result.current).toBe(a);
    rerender({ wanted: edited, hold: true });
    expect(result.current).toBe(edited);
    rerender({ wanted: screen("c", "Weather"), hold: false });
    expect(result.current.id).toBe("c");
  });

  it("switches anyway when a chunk never answers", async () => {
    vi.useFakeTimers();
    const stuck = pending("Weather");
    const a = screen("a", "Clock");
    const b = screen("b", "Weather");
    const { result, rerender } = renderHook(({ wanted }) => useLoadedProfile(wanted, [stuck.mod], true), { initialProps: { wanted: a } });
    rerender({ wanted: b });
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));
    expect(result.current).toBe(b);
    vi.useRealTimers();
  });
});
