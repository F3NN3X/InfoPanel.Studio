// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS, EMPTY_TWITCH, EMPTY_YOUTUBE, type Extras } from "@/lib/extras";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));

vi.mock("@/widgets/time-hooks", async (original) => ({
  ...(await original<typeof import("@/widgets/time-hooks")>()),
  useExtras: () => mocks.extras,
}));

import StreamStats from "@/widgets/stream-stats/StreamStats";

const live = (obs: Partial<Extras["obs"]> = {}, more: Partial<Extras> = {}): Extras => ({
  ...EMPTY_EXTRAS,
  obs: { ...EMPTY_EXTRAS.obs, configured: true, connected: true, streaming: true, uptime: 3725, kbps: 6000, fps: 60, ...obs },
  ...more,
});

const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

beforeEach(() => {
  mocks.extras = live();
  vi.stubGlobal("ResizeObserver", box(420, 300));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StreamStats", () => {
  it("draws the bitrate, frame rate and uptime with a Live word", () => {
    const { container } = render(<StreamStats data={{}} />);
    expect(container.textContent).toContain("6,000");
    expect(container.textContent).toContain("kbps");
    expect(container.textContent).toContain("60");
    expect(container.textContent).toContain("1:02:05");
    expect(container.textContent).toContain("Live");
  });

  it("says Offline, with dashes, when OBS is connected but not streaming", () => {
    mocks.extras = live({ streaming: false, kbps: 0, fps: 0 });
    const { container } = render(<StreamStats data={{}} />);
    expect(container.textContent).toContain("Offline");
    expect(container.textContent).not.toContain("kbps");
  });

  it("says OBS is not connected", () => {
    mocks.extras = EMPTY_EXTRAS;
    render(<StreamStats data={{}} />);
    expect(screen.getByText("OBS not connected")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("adds the viewers of both platforms, and leaves the stat out with none signed in or when turned off", () => {
    mocks.extras = live({}, { twitch: { ...EMPTY_TWITCH, signedIn: true, viewers: 1200 }, youtube: { ...EMPTY_YOUTUBE, signedIn: true, viewers: 34 } });
    const { container, rerender } = render(<StreamStats data={{}} />);
    expect(container.textContent).toContain("Viewers");
    expect(container.textContent).toContain("1,234");
    rerender(<StreamStats data={{}} showViewers={false} />);
    expect(container.textContent).not.toContain("Viewers");
    mocks.extras = live();
    rerender(<StreamStats data={{}} />);
    expect(container.textContent).not.toContain("Viewers");
  });

  it("ticks the uptime each second between the server's readings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mocks.extras = live({ uptime: 100 });
    render(<StreamStats data={{}} />);
    expect(screen.getByText("0:01:40")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.getByText("0:01:41")).toBeTruthy();
  });
});
