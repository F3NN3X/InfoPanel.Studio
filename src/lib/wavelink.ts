import { useSyncExternalStore, useMemo } from "react";

import type { SensorValue } from "@/hooks/useSensors";
import { getApiBase, subscribeApiBase } from "@/lib/data-api";
import { SILENCE_DB } from "@/lib/audio/decibels";
import { createFrameEmitter, type FrameEmitter } from "@/lib/audio/frame-source";
import type { MeterFrame } from "@/lib/audio/types";

/**
 * The Wave Link surface, read from the `wavelink-plugin` entries of the
 * native Data API through one filtered `/events?prefix=` stream (100 ms).
 * Inventory (devices, channels, mixes) is the JSON in the `state` entry,
 * meters the JSON in the `meters` entry; both arrive only when they change.
 *
 * The client is a module-level singleton: every widget placement shares
 * one EventSource, and meter frames feed per-key FrameEmitters so the
 * AudioCN meters paint themselves without re-rendering React.
 */

export const WL_PREFIX = "plugins.wavelink-plugin.wavelink.";
const WL_STATUS = `${WL_PREFIX}status`;
const WL_STATE = `${WL_PREFIX}state`;
const WL_METERS = `${WL_PREFIX}meters`;
/** Retry delay after the server refused the stream. */
const RETRY_MS = 5000;

/** One event of the filtered stream: the first is the full set, later ones deltas. */
interface WlStreamEvent {
  timestamp: number;
  sensors?: Record<string, SensorValue>;
  removed?: string[];
}

/* ---------------- wire types (mirror the plugin's camelCase JSON) ---------------- */

export interface WlGain {
  value: number | null;
  min: number | null;
  max: number | null;
  /** Gain in dB (`value × max`, as Wave Link shows it). Plugin 1.2+. */
  valueDb?: number | null;
}

export interface WlInput {
  id: string;
  name: string;
  isMuted: boolean;
  gain: WlGain | null;
}

export interface WlDevice {
  id: string;
  name: string;
  deviceType: string;
  inputs: WlInput[];
}

export interface WlMixRoute {
  id: string;
  level: number | null;
  /** Send gain in dB (calibrated; null = −∞). Plugin 1.2+. */
  levelDb?: number | null;
  isMuted: boolean;
}

export interface WlApp {
  id: string;
  name: string;
}

export interface WlChannel {
  id: string;
  name: string;
  type: string;
  level: number | null;
  /** Fader gain in dB (calibrated; null = −∞). Plugin 1.2+. */
  levelDb?: number | null;
  isMuted: boolean;
  mixes: WlMixRoute[];
  apps: WlApp[];
}

export interface WlMix {
  id: string;
  name: string;
  level: number | null;
  /** Mix master gain in dB (calibrated; null = −∞). Plugin 1.2+. */
  levelDb?: number | null;
  isMuted: boolean;
}

export interface WlOutput {
  id: string;
  name: string;
  isMuted: boolean;
  level: number | null;
  mixId: string | null;
}

export interface WlOutputDevice {
  id: string;
  name: string;
  deviceType: string;
  outputs: WlOutput[];
}

export interface WlState {
  status: "up" | "absent";
  appVersion: string;
  /** Input devices. */
  devices: WlDevice[];
  /** Output devices. Plugin 1.2+; absent from older plugins. */
  outputDevices?: WlOutputDevice[];
  channels: WlChannel[];
  mixes: WlMix[];
}

/** A meter reading: 0..100 per side (plugin 1.2+ adds the dBFS values). */
export interface WlMeter {
  left: number;
  right: number;
  leftDb?: number | null;
  rightDb?: number | null;
}

/** One meter tick: the merged map, whole (keys are `meterKey.*`). */
export interface WlMeterFrame {
  at: number;
  meters: Record<string, WlMeter>;
}

/* ---------------- meter key namespacing (ported from the control room's catalog) ---------------- */

export const meterKey = {
  /** An output device (post-mix, pre output volume). */
  device: (id: string) => `device:${id}`,
  /** A software channel (post channel fader). Hardware inputs have no channel meter. */
  channel: (id: string) => `channel:${id}`,
  /** A hardware input such as a Wave mic. Plugin 1.2+. */
  input: (id: string) => `input:${id}`,
  /** A mix as Wave Link displays it. Plugin 1.2+. */
  mix: (id: string) => `mix:${id}`,
};

/**
 * A meter by key. Pickers before plugin 1.2 offered input devices as
 * `device:{id}` and hardware channels as `channel:{id}`, which never had a
 * meter: Wave Link meters a mic only as an input, so those keys fall back to
 * `input:{id}` and saved selections start working.
 */
export const findMeter = (
  meters: Record<string, WlMeter>,
  key: string
): WlMeter | undefined => {
  const direct = meters[key];
  if (direct) return direct;
  const sep = key.indexOf(":");
  const kind = key.slice(0, sep);
  return kind === "device" || kind === "channel"
    ? meters[meterKey.input(key.slice(sep + 1))]
    : undefined;
};

/** Bottom of Wave Link's meter scale, in dBFS. */
export const WL_METER_FLOOR_DB = -60;

/**
 * Wave Link meter percentages (0..100) to dBFS. The app's meter is already
 * a dB scale: sample peak, linear in dB from −60 dBFS (0) to 0 dBFS (100), in
 * 0.25 dB steps. Calibrated with 1 kHz tones at 0/−6/−12/−20/−30/−40 dBFS on
 * Wave Link 3.4 (−20 dBFS reads 66.67, −40 reads 32.92). 0 means at or below
 * the floor, shown as silence.
 */
export const pctToDb = (pct: number): number => {
  if (!(pct > 0)) return SILENCE_DB;
  return WL_METER_FLOOR_DB + (pct / 100) * -WL_METER_FLOOR_DB;
};

const ABSENT: WlState = {
  status: "absent",
  appVersion: "",
  devices: [],
  channels: [],
  mixes: [],
};

/** A meter decayed to the floor — silence, not a held level. */
const SILENCE_FRAME: MeterFrame = {
  channels: [
    { peakDb: SILENCE_DB },
    { peakDb: SILENCE_DB },
  ],
};

const frameFor = (meter: { left: number; right: number }): MeterFrame => ({
  channels: [
    { peakDb: pctToDb(meter.left) },
    { peakDb: pctToDb(meter.right) },
  ],
});

/* ---------------- the shared client ---------------- */

type StateListener = (state: WlState) => void;

class WavelinkClient {
  /** Reference-swapped: readers always see a consistent snapshot. */
  private state: WlState = ABSENT;
  private lastFrame: WlMeterFrame | null = null;
  private readonly stateListeners = new Set<StateListener>();
  private readonly emitters = new Map<string, FrameEmitter<MeterFrame>>();
  private started = false;
  private source: EventSource | null = null;
  /** Current text of every wavelink entry — each event merges into it. */
  private values = new Map<string, string>();

  /** The current inventory snapshot (stable reference until it changes). */
  getState = (): WlState => this.state;

  subscribeState = (listener: StateListener): (() => void) => {
    this.ensure();
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  /**
   * A stable per-meter-key frame emitter, fed by the live meter stream.
   * Meters subscribe to it directly (no React re-renders at device pace).
   */
  meterEmitter = (key: string): FrameEmitter<MeterFrame> => {
    this.ensure();
    let emitter = this.emitters.get(key);
    if (!emitter) {
      emitter = createFrameEmitter<MeterFrame>();
      this.emitters.set(key, emitter);
      // Seed a late subscriber with the last known levels so the meter
      // does not start from the floor.
      const meter = this.lastFrame && findMeter(this.lastFrame.meters, key);
      emitter.emit(meter ? frameFor(meter) : SILENCE_FRAME);
    }
    return emitter;
  };

  private ensure(): void {
    if (this.started) return;
    this.started = true;
    this.connect(getApiBase());
    // A changed Data API URL setting reconnects to the new base.
    subscribeApiBase((base) => this.connect(base));
  }

  private connect(base: string): void {
    this.source?.close();
    this.values = new Map();
    const es = new EventSource(
      `${base}/events?prefix=${encodeURIComponent(WL_PREFIX)}&interval=100`
    );
    this.source = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        this.handle(JSON.parse(event.data) as WlStreamEvent);
      } catch {
        this.setAbsent();
      }
    };

    // EventSource reconnects on its own and the first event after a
    // reconnect is the full set, so every event merges into `values`.
    // A refused response closes it for good: retry while still current.
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return;
      this.setAbsent();
      setTimeout(() => {
        if (this.source === es) this.connect(base);
      }, RETRY_MS);
    };
  }

  private handle(event: WlStreamEvent): void {
    const changed = new Set<string>();
    for (const [key, sensor] of Object.entries(event.sensors ?? {})) {
      this.values.set(key, sensor.text ?? "");
      changed.add(key);
    }
    for (const key of event.removed ?? []) {
      this.values.delete(key);
      changed.add(key);
    }

    const status = this.values.get(WL_STATUS);
    const stateJson = this.values.get(WL_STATE);
    if (status !== "up" || stateJson === undefined) {
      this.setAbsent();
      return;
    }

    if (changed.has(WL_STATE) || changed.has(WL_STATUS)) {
      const state = parseState(stateJson);
      if (!state) {
        this.setAbsent();
        return;
      }
      this.state = state;
      for (const listener of this.stateListeners) listener(state);
      if (state.status === "absent") this.silenceAll();
    }

    if (changed.has(WL_METERS)) {
      const frame = parseMeters(this.values.get(WL_METERS), event.timestamp);
      if (!frame) {
        this.lastFrame = null;
        this.silenceAll();
        return;
      }
      this.lastFrame = frame;
      this.feedMeters(frame);
    }
  }

  /**
   * The honest absence state: meters decay to the floor instead of holding
   * the last level.
   */
  private setAbsent(): void {
    this.lastFrame = null;
    this.silenceAll();
    if (this.state === ABSENT) return;
    this.state = ABSENT;
    for (const listener of this.stateListeners) listener(ABSENT);
  }

  private feedMeters(frame: WlMeterFrame): void {
    for (const [key, emitter] of this.emitters) {
      const meter = findMeter(frame.meters, key);
      // A key missing from the map (the app stopped metering it) decays to
      // silence — a meter that freezes on a stale level is a lying meter.
      emitter.emit(meter ? frameFor(meter) : SILENCE_FRAME);
    }
  }

  private silenceAll(): void {
    for (const emitter of this.emitters.values()) {
      emitter.emit(SILENCE_FRAME);
    }
  }
}

function parseState(json: string): WlState | null {
  try {
    const data = JSON.parse(json) as WlState;
    if (data.status !== "up" && data.status !== "absent") return null;
    return {
      status: data.status,
      appVersion: data.appVersion ?? "",
      devices: data.devices ?? [],
      channels: data.channels ?? [],
      mixes: data.mixes ?? [],
    };
  } catch {
    return null;
  }
}

function parseMeters(json: string | undefined, at: number): WlMeterFrame | null {
  if (json === undefined) return null;
  try {
    const meters = JSON.parse(json) as WlMeterFrame["meters"];
    if (!meters || typeof meters !== "object") return null;
    return { at, meters };
  } catch {
    return null;
  }
}

/** The one shared client for every Wave Link widget on the page. */
export const wavelink = new WavelinkClient();

/* ---------------- hooks ---------------- */

/**
 * The live inventory (status, devices, channels, mixes). Updates on every
 * state event — connect, absence, and 1 s-change-only inventory polls.
 */
export function useWavelinkState(): WlState {
  return useSyncExternalStore(wavelink.subscribeState, wavelink.getState, wavelink.getState);
}

/** A stable per-meter-key frame source for the AudioCN meters/readouts. */
export function useWavelinkMeter(key: string): FrameEmitter<MeterFrame> {
  return useMemo(() => wavelink.meterEmitter(key), [key]);
}
