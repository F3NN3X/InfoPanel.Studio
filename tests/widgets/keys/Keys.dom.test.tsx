// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacementKeysContext } from "@/components/placement-keys";
import { RailHostContext, type RailHost } from "@/components/rail-host";
import { EMPTY_EXTRAS, type Extras } from "@/lib/extras";
import { DOUBLE_TAP_MS, HOLD_MS } from "@/lib/gesture";
import type { KeySlot } from "@/lib/keys";
import type { TouchAction, TouchGesture } from "@/lib/pinned";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));
vi.mock("@/lib/extras", async (original) => {
  const real = await original<typeof import("@/lib/extras")>();
  return { ...real, extras: { subscribe: () => () => {}, getState: () => mocks.extras ?? real.EMPTY_EXTRAS } };
});

import Keys from "@/widgets/keys/Keys";

// The Keys widget (pinned layer P7, the `keys` fixture): a key's tap, hold and double tap run their actions from a finger
// and from the keyboard, its corner says what more it does, and a folder opens its own keys.

const run = vi.fn<(a: TouchAction, g?: TouchGesture) => void>();
const host = { pages: [], current: "", profile: { id: "p", name: "P", index: 0 }, lock: null, alerts: [], run } as RailHost;

const RUN: TouchAction = { op: "run", command: "notepad.exe" };
const PAGE: TouchAction = { op: "page", to: "next" };
const MIC: TouchAction = { op: "obs", body: { op: "mic" } };

const KEYS: KeySlot[] = [
  { id: "notes", name: "Notes", icon: { from: "set", name: "file-text" }, touch: { tap: RUN, hold: PAGE } },
  { id: "shot", name: "Screenshot", series: 1, touch: { doubleTap: RUN } },
  { id: "mic", name: "Mic", touch: { tap: MIC } },
  { id: "apps", name: "Apps", keys: [{ id: "calc", name: "Calc", touch: { tap: PAGE } }] },
];

const draw = (keys: readonly KeySlot[] | undefined, h: RailHost | null = host) =>
  render(
    <RailHostContext.Provider value={h}>
      <PlacementKeysContext.Provider value={keys}>
        <Keys data={{}} />
      </PlacementKeysContext.Provider>
    </RailHostContext.Provider>
  );

const down = (el: HTMLElement) => fireEvent.pointerDown(el, { clientX: 5, clientY: 5 });
const up = (el: HTMLElement) => fireEvent.pointerUp(el, { clientX: 5, clientY: 5 });
const tap = (el: HTMLElement) => (down(el), up(el));
const key = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  vi.useFakeTimers();
  mocks.extras = null;
  run.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the Keys widget", () => {
  it("names each key with what more it does, and marks a hold with one dot and a double tap with two", () => {
    const { container } = draw(KEYS);
    expect(key("Notes").getAttribute("aria-label")).toBe("Notes, hold for more");
    expect(key("Screenshot").getAttribute("aria-label")).toBe("Screenshot, double tap for more");
    expect(key("Apps").getAttribute("aria-label")).toBe("Apps, opens a folder");
    expect(container.querySelector('[data-key="notes"] [data-key-mark="hold"]')?.children).toHaveLength(1);
    expect(container.querySelector('[data-key="shot"] [data-key-mark="double"]')?.children).toHaveLength(2);
    expect(container.querySelector('[data-key="mic"] [data-key-mark]')).toBeNull();
    // a key that only acts announces no pressed state
    expect(key("Notes").getAttribute("aria-pressed")).toBeNull();
  });

  it("runs a tap, a hold and a double tap, each with the gesture that ran it", () => {
    draw(KEYS);
    tap(key("Notes"));
    // a key with no double tap runs its tap on the lift
    expect(run).toHaveBeenLastCalledWith(RUN, "tap");
    down(key("Notes"));
    act(() => vi.advanceTimersByTime(HOLD_MS));
    up(key("Notes"));
    expect(run).toHaveBeenLastCalledWith(PAGE, "hold");
    tap(key("Screenshot"));
    tap(key("Screenshot"));
    expect(run).toHaveBeenLastCalledWith(RUN, "doubleTap");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("gives the keyboard every gesture: Enter for a tap, held for a hold, twice for a double tap", () => {
    draw(KEYS);
    const press = (el: HTMLElement, hold = 0) => {
      fireEvent.keyDown(el, { key: "Enter" });
      if (hold) act(() => vi.advanceTimersByTime(hold));
      fireEvent.keyUp(el, { key: "Enter" });
    };
    press(key("Notes"));
    expect(run).toHaveBeenLastCalledWith(RUN, "tap");
    press(key("Notes"), HOLD_MS);
    expect(run).toHaveBeenLastCalledWith(PAGE, "hold");
    fireEvent.keyDown(key("Screenshot"), { key: " " });
    fireEvent.keyUp(key("Screenshot"), { key: " " });
    fireEvent.keyDown(key("Screenshot"), { key: " " });
    fireEvent.keyUp(key("Screenshot"), { key: " " });
    expect(run).toHaveBeenLastCalledWith(RUN, "doubleTap");
    // a key held down repeats nothing
    fireEvent.keyDown(key("Mic"), { key: "Enter" });
    fireEvent.keyDown(key("Mic"), { key: "Enter", repeat: true });
    fireEvent.keyUp(key("Mic"), { key: "Enter" });
    act(() => vi.advanceTimersByTime(DOUBLE_TAP_MS + 1));
    expect(run.mock.calls.filter(([a]) => a === MIC)).toHaveLength(1);
  });

  it("opens a folder with a tap, runs its keys, and goes back with Back", () => {
    draw(KEYS);
    tap(key("Apps"));
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Notes/ })).toBeNull();
    tap(key("Calc"));
    expect(run).toHaveBeenLastCalledWith(PAGE, "tap");
    tap(key("Back"));
    expect(key("Notes")).toBeTruthy();
  });

  it("lights a key whose tap mutes the OBS mic while it is muted", () => {
    mocks.extras = { ...EMPTY_EXTRAS, obs: { ...EMPTY_EXTRAS.obs, mic: { name: "Mic", muted: true, level: 0 } } } as Extras;
    draw(KEYS);
    expect(key("Mic").getAttribute("aria-pressed")).toBe("true");
  });

  it("draws the sample without a screen, and says there are none on a screen with none stored", () => {
    draw(undefined, null);
    expect(key("Explorer")).toBeTruthy();
    tap(key("Explorer"));
    cleanup();
    draw(undefined, host);
    expect(screen.getByText(/No keys yet/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
});
