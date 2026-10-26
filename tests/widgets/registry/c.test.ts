import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { toFlat } from "@/widgets/data-adapter";
import AudioMeter, { meta as audioMeter } from "@/widgets/AudioMeter";
import MeterBridge, { meta as meterBridge } from "@/widgets/MeterBridge";
import NowPlaying, { meta as nowPlaying } from "@/widgets/NowPlaying";
import Visualizer, { meta as visualizer } from "@/widgets/Visualizer";
import VolumeMixer, { meta as volumeMixer } from "@/widgets/VolumeMixer";
import WaveLink, { meta as waveLink } from "@/widgets/WaveLink";
import { GROUP_C } from "@/widgets/registry/c";
import type { ShellProps } from "@/widgets/kit";

// WaveLink reads the shared Wave Link client, not sensor keys: give it a connected one.
vi.mock("@/lib/wavelink", async (orig) => ({ ...(await orig<typeof import("@/lib/wavelink")>()), ...(await import("@/widgets/__fixtures__/wavelink")).wavelinkMock() }));

const data = toFlat(snapshot.sensors as SensorMap);
// Typed as one shape: inferring createElement's props from the union of six components depends on type-check order.
const WIDGETS: { meta: typeof audioMeter; Component: ComponentType<ShellProps> }[] = [
  { meta: nowPlaying, Component: NowPlaying },
  { meta: audioMeter, Component: AudioMeter },
  { meta: volumeMixer, Component: VolumeMixer },
  { meta: meterBridge, Component: MeterBridge },
  { meta: visualizer, Component: Visualizer },
  { meta: waveLink, Component: WaveLink },
];

describe("group C templates", () => {
  it("registers the six widgets with their meta size", () => {
    expect(GROUP_C.map((m) => m.id)).toEqual(WIDGETS.map((w) => w.meta.id));
    for (const { meta } of WIDGETS) {
      const mod = GROUP_C.find((m) => m.id === meta.id);
      expect(mod?.minCols).toBe(meta.minSize[0]);
      expect(mod?.minRows).toBe(meta.minSize[1]);
    }
  });

  for (const { meta, Component } of WIDGETS) {
    describe(meta.id, () => {
      it("renders a live value, the extremes and the empty state without throwing", () => {
        const text = renderToString(createElement(Component, { data, size: "md" })).replace(/<[^>]*>/g, "");
        expect(text).toMatch(/\d/);
        expect(renderToString(createElement(Component, { data, size: "xs", variant: "studio", skin: "tui" })).length).toBeGreaterThan(0);
        expect(renderToString(createElement(Component, { data: {} })).length).toBeGreaterThan(0);
      });
    });
  }
});
