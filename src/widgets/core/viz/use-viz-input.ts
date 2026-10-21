// The visualiser's input for one device: capture (Web Audio) > the plugin's spectrum > the plugin's
// level > none, shaped by the look's dynamics and eased in the frame loop's update phase.
import { useEffect, useRef } from "react";
import { useMediaVisualSource, type MediaVisualSource } from "@/hooks/use-media-visual-source";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MAX_FRAME_GAP_MS, subscribeFrame } from "@/lib/audio/frame-loop";
import type { VisualFrame } from "@/lib/audio/types";
import { get, has, num } from "../data";
import type { Data } from "../types";
import { AUDIO, spectrumOf } from "../../audio-device";
import { BAND_COUNT, createInputState, stepInput, type Dynamics, type RawInput } from "./input";
import type { VizInput } from "./types";

/** Capture bands use the plugin's scale (-80..0 dBFS) and band layout, so one set of dynamics fits both. */
const CAPTURE_OPTIONS = { bandCount: BAND_COUNT, minHz: 30, maxHz: 16000, minDb: -80, maxDb: 0 };
/** The update stops once no engine has read the input for this long, and restarts on the next read. */
const IDLE_MS = 1000;

/** Dev only: every mounted input, read by `window.__vizInputs()` (tone / sweep checks, `docs/redesign/visualizer`). */
const PROBES = new Set<{ device: () => string; raw: () => RawInput; get: () => VizInput }>();
const peakOf = (a: ArrayLike<number> | null) => {
  if (!a?.length) return -1;
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
};
declare global {
  interface Window {
    __vizInputs?: () => { device: string; source: VizInput["source"]; peakBand: number; rawPeakBand: number; bands: number[] }[];
  }
}
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__vizInputs = () =>
    [...PROBES].map((p) => {
      const input = p.get();
      return { device: p.device(), source: input.source, peakBand: peakOf(input.bands), rawPeakBand: peakOf(p.raw().spectrum), bands: [...input.bands].map((v) => +v.toFixed(2)) };
    });
}

/** The plugin's level for a device (0..1): the loudest of level, left and right; null when it reports none. */
export function levelOf(d: Data, device: string): number | null {
  const k = (s: string) => get(d, `${AUDIO}${device}.${s}`);
  if (!has(k("audio-level"))) return null;
  return Math.max(0, Math.min(1, Math.max(num(k("audio-level")) || 0, num(k("left-channel")) || 0, num(k("right-channel")) || 0) / 100));
}

export interface VizInputOptions {
  data: Data;
  /** The resolved audio-level-meter container. */
  device: string;
  /** A Web Audio input device to capture; unset = the plugin. */
  captureDeviceId?: string;
  look: Dynamics;
  /** True treats the plugin as silent (the media is paused). */
  muted?: boolean;
}

export interface VizInputHandle {
  /** Stable: the latest frame, for `<AudioViz input>`. */
  get: () => VizInput;
  /** The capture's status and label (idle without `captureDeviceId`). */
  capture: MediaVisualSource;
}

export function useVizInput({ data, device, captureDeviceId, look, muted }: VizInputOptions): VizInputHandle {
  const reduced = useReducedMotion();
  const capture = useMediaVisualSource(captureDeviceId ?? null, CAPTURE_OPTIONS);
  const frame = useRef<VisualFrame | null>(null);
  useEffect(() => {
    frame.current = null;
    if (reduced) return;
    return capture.source.subscribe((f) => (frame.current = f));
  }, [capture.source, captureDeviceId, reduced]);

  const raw = useRef<RawInput>({ capture: null, spectrum: null, level: null });
  const live = useRef({ look, reduced, ready: false });
  raw.current = { capture: null, spectrum: muted ? null : spectrumOf(data, device), level: muted ? 0 : levelOf(data, device) };
  live.current = { look, reduced, ready: capture.status === "ready" };

  const handle = useRef<{ get: () => VizInput; stop: () => void } | null>(null);
  if (!handle.current) {
    const st = createInputState();
    let unsubscribe: (() => void) | null = null;
    let lastMs = 0;
    let readAt = 0;
    const update = (nowMs: number) => {
      if (nowMs - readAt > IDLE_MS) {
        unsubscribe?.();
        unsubscribe = null;
        return;
      }
      const dt = lastMs ? Math.min(MAX_FRAME_GAP_MS, nowMs - lastMs) : 16;
      lastMs = nowMs;
      const f = live.current.ready ? frame.current : null;
      const r = f ? { ...raw.current, capture: { bands: f.bands, wave: f.timeDomain ?? null } } : raw.current;
      stepInput(st, r, live.current.look, dt, nowMs, live.current.reduced);
    };
    handle.current = {
      get: () => {
        readAt = performance.now();
        if (!unsubscribe) {
          lastMs = 0;
          unsubscribe = subscribeFrame(update, "update");
        }
        return st.input;
      },
      stop: () => {
        unsubscribe?.();
        unsubscribe = null;
      },
    };
  }
  useEffect(() => handle.current!.stop, []);
  const deviceRef = useRef(device);
  deviceRef.current = device;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const probe = { device: () => deviceRef.current, raw: () => raw.current, get: handle.current!.get };
    PROBES.add(probe);
    return () => void PROBES.delete(probe);
  }, []);
  return { get: handle.current.get, capture };
}
