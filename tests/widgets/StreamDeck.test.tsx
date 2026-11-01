// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS } from "@/widgets/StreamDeck/layout";
import type { StreamDeckState } from "@/lib/streamdeck";

const mocks = vi.hoisted(() => ({ state: null as StreamDeckState | null, press: vi.fn(), act: vi.fn() }));

// A skin's fonts load from Google Fonts, which happy-dom refuses (loudly).
vi.mock("@/widgets/core/fonts", () => ({ ensureSkinFonts: () => undefined }));

vi.mock("@/lib/streamdeck", async (original) => ({
  ...(await original<typeof import("@/lib/streamdeck")>()),
  useStreamDeck: () => mocks.state,
  deckPress: mocks.press,
  deckAct: mocks.act,
}));

import { streamDeckRefusal } from "@/lib/streamdeck";
import StreamDeck from "@/widgets/StreamDeck";

const deck = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "IPStudio",
  cols: 5,
  rows: 3,
  status: "ready" as const,
  page: { current: 0, total: 2 },
  keys: [
    { index: 0, title: "Mute", icon: "v1" },
    { index: 1, title: "Scene", icon: null },
  ],
  ...extra,
});
const state = (d: Record<string, unknown> = {}, extra: Partial<StreamDeckState> = {}): StreamDeckState => ({ enabled: true, pairingCode: "AB12CD", devices: [deck(d)], ...extra });

beforeEach(() => {
  mocks.state = state();
  mocks.press.mockReset();
  mocks.act.mockReset();
  streamDeckRefusal.set(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const keys = () => screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") !== null);

describe("StreamDeck", () => {
  it("draws the device's grid, each key's icon from its version, and the page row", () => {
    render(<StreamDeck data={{}} device="d1" />);
    expect(keys()).toHaveLength(15);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/streamdeck/icon?device=d1&index=0&v=v1");
    expect(img?.getAttribute("draggable")).toBe("false");
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("draws its keys in the skin, not its frame, and plainly for a key style it doesn't know", () => {
    // A chosen skin brings its own surface into the look (`withSkinSurface`); the frame doesn't take it.
    const { rerender } = render(<StreamDeck data={{}} device="d1" skin="cyber" look={{ skin: "cyber", surface: "cyber" }} />);
    expect(keys()).toHaveLength(15);
    expect(keys()[0].getAttribute("data-key-style")).toBe("auto");
    expect(keys()[0].style.clipPath).toContain("polygon");
    expect((document.querySelector("[data-wp-tier]") as HTMLElement).style.clipPath).toBe("");
    rerender(<StreamDeck data={{}} device="d1" skin="cyber" keyStyle="gone-surface" />);
    expect(keys()[0].className).toContain("bg-white/[0.06]");
  });

  it("says what is missing instead of a grid", () => {
    const { rerender } = render(<StreamDeck data={{}} />);
    expect(screen.getByText("Pick or create a device")).toBeTruthy();
    mocks.state = state({}, { enabled: false });
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(screen.getByText("Turn on Stream Deck in Settings › Connections")).toBeTruthy();
    mocks.state = state({ status: "absent" });
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(screen.getByText("The Stream Deck app isn't running")).toBeTruthy();
    mocks.state = state({ status: "pairing" });
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(screen.getByText("Pairing code AB12CD")).toBeTruthy();
    expect(screen.getByText("Confirm it in the Stream Deck app")).toBeTruthy();
  });

  it("presses on pointer down and releases on pointer up, once, on a deck with one page", () => {
    mocks.state = state({ page: { current: 0, total: 1 } });
    render(<StreamDeck data={{}} device="d1" />);
    const key = keys()[1];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0 });
    expect(mocks.press).toHaveBeenCalledWith("d1", 1, true);
    expect(key.getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerUp(key, { pointerId: 1 });
    fireEvent.lostPointerCapture(key, { pointerId: 1 });
    expect(mocks.press.mock.calls).toEqual([["d1", 1, true], ["d1", 1, false]]);
    expect(key.getAttribute("aria-pressed")).toBe("false");
  });

  it("still releases the key when the pointer is cancelled or the widget goes away mid-press", () => {
    mocks.state = state({ page: { current: 0, total: 1 } });
    const { unmount } = render(<StreamDeck data={{}} device="d1" />);
    const [a, b] = keys();
    fireEvent.pointerDown(a, { pointerId: 1, button: 0 });
    fireEvent.pointerCancel(a, { pointerId: 1 });
    fireEvent.pointerDown(b, { pointerId: 2, button: 0 });
    unmount();
    expect(mocks.press.mock.calls).toEqual([["d1", 0, true], ["d1", 0, false], ["d1", 1, true], ["d1", 1, false]]);
  });

  it("lets go of a held key when the grid goes away under it, and the same pointer presses again after", () => {
    mocks.state = state({ page: { current: 0, total: 1 } });
    const { rerender } = render(<StreamDeck data={{}} device="d1" />);
    fireEvent.pointerDown(keys()[0], { pointerId: 1, button: 0 });
    mocks.state = state({ status: "absent", page: { current: 0, total: 1 } });
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(mocks.press.mock.calls).toEqual([["d1", 0, true], ["d1", 0, false]]);
    mocks.state = state({ page: { current: 0, total: 1 } });
    rerender(<StreamDeck data={{}} device="d1" />);
    fireEvent.pointerDown(keys()[1], { pointerId: 1, button: 0 });
    act(() => streamDeckRefusal.set(true));
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(mocks.press.mock.calls.slice(2)).toEqual([["d1", 1, true], ["d1", 1, false]]);
  });

  it("lets go of a key the pointer leaves", () => {
    mocks.state = state({ page: { current: 0, total: 1 } });
    render(<StreamDeck data={{}} device="d1" />);
    const key = keys()[0];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0 });
    fireEvent.pointerLeave(key, { pointerId: 1 });
    fireEvent.pointerUp(key, { pointerId: 1 });
    expect(mocks.press.mock.calls).toEqual([["d1", 0, true], ["d1", 0, false]]);
  });

  it("turns the page on a swipe without pressing the key it started on", () => {
    vi.useFakeTimers();
    render(<StreamDeck data={{}} device="d1" />);
    const key = keys()[0];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(key, { pointerId: 1, clientX: 180, clientY: 51 });
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    fireEvent.pointerUp(key, { pointerId: 1, clientX: 100, clientY: 55 });
    expect(mocks.act).toHaveBeenCalledWith({ op: "page", device: "d1", to: "next" });
    expect(mocks.press).not.toHaveBeenCalled();
    expect(key.getAttribute("aria-pressed")).toBe("false");
    // A fast swipe with no move events in between is still a swipe.
    fireEvent.pointerDown(key, { pointerId: 2, button: 0, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(key, { pointerId: 2, clientX: 200, clientY: 50 });
    expect(mocks.press).not.toHaveBeenCalled();
  });

  it("where a swipe can turn pages, a tap presses on lift and a hold presses after the wait, each released once", () => {
    vi.useFakeTimers();
    render(<StreamDeck data={{}} device="d1" />);
    const key = keys()[1];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0, clientX: 100, clientY: 50 });
    expect(mocks.press).not.toHaveBeenCalled();
    fireEvent.pointerUp(key, { pointerId: 1, clientX: 106, clientY: 52 });
    expect(mocks.press.mock.calls).toEqual([["d1", 1, true], ["d1", 1, false]]);
    expect(mocks.act).not.toHaveBeenCalled();
    mocks.press.mockClear();
    fireEvent.pointerDown(key, { pointerId: 2, button: 0, clientX: 100, clientY: 50 });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(mocks.press.mock.calls).toEqual([["d1", 1, true]]);
    // Moving after the press went out doesn't drop it; the release still comes.
    fireEvent.pointerMove(key, { pointerId: 2, clientX: 160, clientY: 50 });
    fireEvent.pointerUp(key, { pointerId: 2, clientX: 160, clientY: 50 });
    fireEvent.lostPointerCapture(key, { pointerId: 2 });
    expect(mocks.press.mock.calls).toEqual([["d1", 1, true], ["d1", 1, false]]);
  });

  it("swipes with the page row hidden", () => {
    render(<StreamDeck data={{}} device="d1" showPages={false} />);
    const key = keys()[0];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0, clientX: 200, clientY: 50 });
    fireEvent.pointerUp(key, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(mocks.act).toHaveBeenCalledWith({ op: "page", device: "d1", to: "next" });
  });

  it("does not swipe when it is turned off, and sends nothing from a read-only screen", () => {
    const { rerender } = render(<StreamDeck data={{}} device="d1" swipe={false} />);
    const key = keys()[0];
    fireEvent.pointerDown(key, { pointerId: 1, button: 0, clientX: 200, clientY: 50 });
    fireEvent.pointerUp(key, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(mocks.act).not.toHaveBeenCalled();
    act(() => streamDeckRefusal.set(true));
    rerender(<StreamDeck data={{}} device="d1" />);
    expect(screen.getByTitle("Read-only on this screen")).toBeTruthy();
  });
});
