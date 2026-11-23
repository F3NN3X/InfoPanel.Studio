// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LOOK } from "@/widgets/core/viz/types";

// A loop that never ticks: on a busy page the first frame can come after the hook has stopped waiting for a read.
vi.mock("@/lib/audio/frame-loop", () => ({ MAX_FRAME_GAP_MS: 250, subscribeFrame: () => () => {} }));
vi.mock("@/hooks/use-reduced-motion", () => ({ useReducedMotion: () => true }));
vi.mock("@/hooks/use-media-visual-source", () => ({ useMediaVisualSource: () => ({ source: { subscribe: () => () => {} }, status: "idle" }) }));

import { useVizInput } from "@/widgets/core/viz/use-viz-input";

describe("useVizInput", () => {
  it("steps the input on the first read, so a still frame painted from it is not silent", () => {
    const data = { "plugins.audio-level-meter.dev.audio-level": "50" };
    const { result } = renderHook(() => useVizInput({ data, device: "dev", look: DEFAULT_LOOK }));
    const input = result.current.get();
    expect(input.source).toBe("level");
    expect(input.level).toBeGreaterThan(0);
  });
});
