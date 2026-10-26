// Template widgets that look back or judge: Bottleneck Lens, Frame Histogram, Session Stats, Threshold Timeline.
// They read their sensors by role (`role-data.ts`) unless the user picks, and keep a short in-memory history (`core/history.ts`).
import type { DashboardModule } from "@/modules/types";
import { thresholdsOf } from "@/modules/setting-readers";
import { templateModule } from "../module";
import { numberOf, numberSetting, sensorSetting, splitKeys, thresholdSetting } from "./settings-kit";
import BottleneckLens, { meta as bottleneckMeta, type BottleneckLensProps } from "../BottleneckLens";
import FrameHistogram, { meta as frameHistogramMeta, type FrameHistogramProps } from "../FrameHistogram";
import SessionStats, { MAX_SENSORS, meta as sessionStatsMeta, type SessionStatsProps } from "../SessionStats";
import ThresholdTimeline, { MAX_LANES, meta as thresholdTimelineMeta, type ThresholdTimelineProps } from "../ThresholdTimeline";

const SENSORS_HINT = (n: number) => `Up to ${n}. Empty = CPU and GPU load and temperature`;

export const GROUP_HISTORY: DashboardModule[] = [
  templateModule<Pick<BottleneckLensProps, "hold" | "gpuAt" | "cpuAt" | "vramAt">>({
    meta: bottleneckMeta,
    Component: BottleneckLens,
    settings: [
      numberSetting("hold", "Hold a verdict (s)", 5, { min: 1, max: 30, step: 1, group: "Verdict", tab: "behaviour", hint: "A new verdict must last this long before it replaces the one shown" }),
      numberSetting("gpuAt", "GPU-bound at (%)", 93, { min: 50, max: 100, step: 1, group: "Limits", tab: "behaviour" }),
      numberSetting("cpuAt", "CPU-bound at (%)", 85, { min: 50, max: 100, step: 1, group: "Limits", tab: "behaviour", hint: "The busiest core" }),
      numberSetting("vramAt", "VRAM full at (%)", 95, { min: 50, max: 100, step: 1, group: "Limits", tab: "behaviour" }),
    ],
    toProps: (s) => ({ hold: numberOf(s.hold), gpuAt: numberOf(s.gpuAt), cpuAt: numberOf(s.cpuAt), vramAt: numberOf(s.vramAt) }),
  }),
  templateModule<Pick<FrameHistogramProps, "window">>({
    meta: frameHistogramMeta,
    Component: FrameHistogram,
    settings: [numberSetting("window", "Window (s)", 60, { min: 10, max: 600, step: 10, group: "History", tab: "behaviour", hint: "Frames counted; one reading a second" })],
    toProps: (s) => ({ window: numberOf(s.window) }),
  }),
  templateModule<Pick<SessionStatsProps, "sensors" | "above">>({
    meta: sessionStatsMeta,
    Component: SessionStats,
    settings: [
      sensorSetting("sensors", "Sensors", { group: "Sensors", tab: "data", multiple: true, hint: SENSORS_HINT(MAX_SENSORS) }),
      numberSetting("above", "Time above", 80, { min: -100, max: 10000, step: 5, group: "Level", tab: "behaviour", hint: "In each sensor's own unit. Changing it starts the counts over" }),
    ],
    toProps: (s) => ({ sensors: splitKeys(s.sensors).slice(0, MAX_SENSORS), above: numberOf(s.above) }),
  }),
  templateModule<Pick<ThresholdTimelineProps, "sensors" | "window" | "warn" | "crit">>({
    meta: thresholdTimelineMeta,
    Component: ThresholdTimeline,
    settings: [
      sensorSetting("sensors", "Sensors", { group: "Sensors", tab: "data", multiple: true, hint: SENSORS_HINT(MAX_LANES) }),
      numberSetting("window", "Window (min)", 5, { min: 1, max: 30, step: 1, group: "History", tab: "behaviour" }),
      thresholdSetting("value"),
    ],
    toProps: (s) => ({ sensors: splitKeys(s.sensors).slice(0, MAX_LANES), window: numberOf(s.window), ...thresholdsOf(s, "value") }),
  }),
];
