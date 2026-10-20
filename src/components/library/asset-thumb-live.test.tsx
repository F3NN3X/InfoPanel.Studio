// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import type { LibraryItem } from "@/lib/library";
import { AssetThumb } from "./asset-thumb";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/hooks/use-reduced-motion", () => ({ useReducedMotion: () => motion.reduced }));

const FRAME = `${"a".repeat(64)}.png`;
const VIDEO = `${"b".repeat(64)}.mp4`;
const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: "i1", kind: "gauge", name: "Item", createdAt: "", updatedAt: "1", files: [], meta: {}, copies: [], ...over,
});
const vector = item({ data: { vector: STARTERS[0].gauge, min: 0, max: 100, animationSpeed: 0 } });
const video = item({ kind: "video", files: [VIDEO], meta: { duration: 5 } });

let raf: { mock: unknown };
beforeEach(() => {
  motion.reduced = false;
  raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AssetThumb live gauge", () => {
  it("runs the sweep clock when live", () => {
    render(<AssetThumb item={vector} live />);
    expect(raf).toHaveBeenCalled();
  });

  it("starts no timer when not live", () => {
    render(<AssetThumb item={vector} />);
    expect(raf).not.toHaveBeenCalled();
  });

  it("stays still on reduced motion", () => {
    motion.reduced = true;
    const { container } = render(<AssetThumb item={vector} live />);
    expect(raf).not.toHaveBeenCalled();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("plays an image sequence's frames when live", () => {
    const seq = item({ files: [FRAME], data: { frames: [{ id: FRAME, name: "0.png" }], min: 0, max: 100, animationSpeed: 8 } });
    const { container } = render(<AssetThumb item={seq} live />);
    expect(raf).toHaveBeenCalled();
    expect(container.querySelector(`img[src="/api/assets/${FRAME}"]`)).not.toBeNull();
  });
});

describe("AssetThumb live video", () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play = play;
    pause = vi.fn();
    HTMLMediaElement.prototype.pause = pause;
  });

  it("autoplays muted and looped when live", () => {
    const { container } = render(<AssetThumb item={video} live />);
    const el = container.querySelector("video")!;
    expect(play).toHaveBeenCalled();
    expect(el.muted).toBe(true);
    expect(el.loop).toBe(true);
  });

  it("is a still frame with a badge when not live", () => {
    const { container } = render(<AssetThumb item={video} />);
    expect(play).not.toHaveBeenCalled();
    expect(container.querySelector("video")!.loop).toBe(false);
    expect(container.querySelector("button")).toBeNull();
  });

  it("does not autoplay on reduced motion, but the button plays", () => {
    motion.reduced = true;
    const { getByRole } = render(<AssetThumb item={video} live />);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("toggles pause from the overlay", () => {
    const { container, getByRole } = render(<AssetThumb item={video} live />);
    const el = container.querySelector("video")!;
    Object.defineProperty(el, "paused", { value: false, configurable: true });
    fireEvent.play(el);
    fireEvent.click(getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("toggles on a tap of the video itself (touch has no hover)", () => {
    const { container } = render(<AssetThumb item={video} live />);
    const el = container.querySelector("video")!;
    Object.defineProperty(el, "paused", { value: false, configurable: true });
    fireEvent.click(el);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("stops when unmounted", () => {
    const { unmount } = render(<AssetThumb item={video} live />);
    pause.mockClear();
    unmount();
    expect(pause).toHaveBeenCalled();
  });
});
