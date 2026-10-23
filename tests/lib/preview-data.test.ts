import { describe, expect, it, vi } from "vitest";
import { isFrozen, parsePreviewData, PreviewSnapshot, type SnapshotDeps } from "@/lib/preview-data";
import type { SensorMap } from "@/modules/types";

const reading = (value: number) => ({ value, unit: "%" });

function snapshot(over: Partial<SnapshotDeps> = {}) {
  const deps: SnapshotDeps = { current: () => ({}), fetchAll: vi.fn(async () => ({ "cpu.load": reading(10) }) as SensorMap), now: () => 1000, ...over };
  return { snap: new PreviewSnapshot(deps), deps };
}

describe("the preview data setting", () => {
  it("reads its three values and falls back to live", () => {
    expect(parsePreviewData("frozen")).toBe("frozen");
    expect(parsePreviewData("frozenWhenUnfocused")).toBe("frozenWhenUnfocused");
    expect(parsePreviewData("live")).toBe("live");
    // Unset or unknown: the default.
    expect(parsePreviewData(null)).toBe("frozenWhenUnfocused");
    expect(parsePreviewData("paused")).toBe("frozenWhenUnfocused");
  });

  it("freezes per the setting, after the unfocused delay for frozenWhenUnfocused, and a session override wins", () => {
    expect(isFrozen("live", null, true)).toBe(false);
    expect(isFrozen("frozen", null, false)).toBe(true);
    expect(isFrozen("frozenWhenUnfocused", null, false)).toBe(false);
    expect(isFrozen("frozenWhenUnfocused", null, true)).toBe(true);
    expect(isFrozen("frozen", "live", false)).toBe(false);
    expect(isFrozen("live", "frozen", false)).toBe(true);
  });
});

describe("PreviewSnapshot", () => {
  it("takes the page's values over one complete read, and says when", async () => {
    const { snap } = snapshot({ current: () => ({ "gpu.load": reading(50) }) });
    await snap.take();
    expect(snap.getState()).toEqual({ values: { "cpu.load": reading(10), "gpu.load": reading(50) }, takenAt: 1000, status: "ready" });
  });

  it("shows no data when there is none in time, and a refresh tries again", async () => {
    let answer: SensorMap | null = null;
    const { snap } = snapshot({ fetchAll: async () => answer });
    await snap.take();
    expect(snap.getState().status).toBe("empty");
    answer = { "cpu.load": reading(5) };
    await snap.take();
    expect(snap.getState()).toMatchObject({ status: "ready", values: { "cpu.load": reading(5) } });
  });

  it("refresh replaces the values; between refreshes they hold", async () => {
    let n = 10;
    const { snap } = snapshot({ fetchAll: async () => ({ "cpu.load": reading(n) }) });
    await snap.take();
    n = 90;
    expect(snap.getState().values["cpu.load"]).toEqual(reading(10));
    await snap.take();
    expect(snap.getState().values["cpu.load"]).toEqual(reading(90));
  });

  it("adds a sensor a new zone binds, once, without moving the others", async () => {
    let calls = 0;
    const { snap } = snapshot({
      fetchAll: async (): Promise<SensorMap> => {
        calls++;
        return calls === 1 ? { "cpu.load": reading(10) } : { "cpu.load": reading(99), "fan.rpm": reading(1200) };
      },
    });
    await snap.take();
    snap.ensure(["fan.", "cpu.load"]);
    snap.ensure(["fan."]);
    await vi.waitFor(() => expect(snap.getState().values["fan.rpm"]).toEqual(reading(1200)));
    expect(snap.getState().values["cpu.load"]).toEqual(reading(10));
    expect(calls).toBe(2);
    // Already asked: no further reads, even when the Data API doesn't have it.
    snap.ensure(["fan.", "nope."]);
    snap.ensure(["nope."]);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(3);
  });

  it("notifies subscribers on each change", async () => {
    const { snap } = snapshot();
    const seen = vi.fn();
    snap.subscribe(seen);
    await snap.take();
    expect(seen.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
