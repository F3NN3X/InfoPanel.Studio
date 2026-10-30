/**
 * The audio control the Stream Mixer and the audio buttons use (ips-server's audio module): this PC's Windows audio
 * and Elgato Wave Link. Kiosks and the studio read the state over one shared EventSource (`/events/audio`) and write
 * with `POST /api/audio/act`; neither is config, so none of it enters the undo history.
 */

import { useSyncExternalStore } from "react";
import { trackEventSource } from "@/lib/sensor-store";

export const AUDIO_EVENTS_URL = "/events/audio";
export const AUDIO_ACT_URL = "/api/audio/act";

export interface AudioDevice {
  id: string;
  name: string;
  /** 0-100. */
  volume: number;
  muted: boolean;
  /** The default output or input endpoint. */
  default: boolean;
}

/** An app's audio: every session of one executable (`id` is its lowercase file name, `discord.exe`). */
export interface AudioApp {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  /** The output endpoint it plays on. */
  deviceId: string;
}

export interface WavelinkRoute {
  id: string;
  level: number;
  muted: boolean;
}

export interface WavelinkChannel {
  id: string;
  name: string;
  type: string;
  level: number;
  muted: boolean;
  /** Its level and mute on each mix. */
  mixes: WavelinkRoute[];
}

export interface WavelinkMix {
  id: string;
  name: string;
  level: number;
  muted: boolean;
}

export type WavelinkStatus = "absent" | "down" | "up";

export interface AudioState {
  windows: { available: boolean; outputs: AudioDevice[]; inputs: AudioDevice[]; apps: AudioApp[] };
  wavelink: { status: WavelinkStatus; channels: WavelinkChannel[]; mixes: WavelinkMix[] };
}

export const EMPTY_AUDIO: AudioState = {
  windows: { available: false, outputs: [], inputs: [], apps: [] },
  wavelink: { status: "absent", channels: [], mixes: [] },
};

/** What `POST /api/audio/act` takes. A volume is 0-100; `muted` unset on a Windows mute toggles. */
export type AudioAction =
  | { target: "windows"; op: "volume"; kind: "output" | "input" | "app"; id: string; value: number }
  | { target: "windows"; op: "mute"; kind: "output" | "input" | "app"; id: string; muted?: boolean }
  | { target: "windows"; op: "default"; id: string }
  | { target: "windows"; op: "settings" }
  | { target: "wavelink"; op: "channel"; id: string; mix?: string; level?: number; muted?: boolean }
  | { target: "wavelink"; op: "mix"; id: string; level?: number; muted?: boolean };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const level = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0);

/** Tolerant read of the server's message: a malformed entry is dropped, never thrown on. */
export function parseAudio(raw: unknown): AudioState {
  if (!isObject(raw)) return EMPTY_AUDIO;
  const w = isObject(raw.windows) ? raw.windows : {};
  const l = isObject(raw.wavelink) ? raw.wavelink : {};
  const devices = (v: unknown): AudioDevice[] =>
    list(v)
      .filter((d) => text(d.id))
      .map((d) => ({ id: text(d.id), name: text(d.name) || text(d.id), volume: level(d.volume), muted: d.muted === true, default: d.default === true }));
  return {
    windows: {
      available: w.available === true,
      outputs: devices(w.outputs),
      inputs: devices(w.inputs),
      apps: list(w.apps)
        .filter((a) => text(a.id))
        .map((a) => ({ id: text(a.id), name: text(a.name) || text(a.id), volume: level(a.volume), muted: a.muted === true, deviceId: text(a.deviceId) })),
    },
    wavelink: {
      status: l.status === "up" || l.status === "down" ? l.status : "absent",
      channels: list(l.channels)
        .filter((c) => text(c.id))
        .map((c) => ({
          id: text(c.id),
          name: text(c.name) || text(c.id),
          type: text(c.type),
          level: level(c.level),
          muted: c.muted === true,
          mixes: list(c.mixes)
            .filter((m) => text(m.id))
            .map((m) => ({ id: text(m.id), level: level(m.level), muted: m.muted === true })),
        })),
      mixes: list(l.mixes)
        .filter((m) => text(m.id))
        .map((m) => ({ id: text(m.id), name: text(m.name) || text(m.id), level: level(m.level), muted: m.muted === true })),
    },
  };
}

type Listener = (state: AudioState) => void;

/** True after the server refused a write (403: another machine, remote editing off); the widgets stay read-only until the stream reconnects. */
let refused = false;

/** The shared audio client: `getState` / `subscribe`. */
function createAudioClient(url: string) {
  let state = EMPTY_AUDIO;
  let source: EventSource | null = null;
  const listeners = new Set<Listener>();
  const open = () => {
    if (source || typeof EventSource === "undefined") return;
    source = trackEventSource(new EventSource(url));
    source.onopen = () => {
      refused = false;
    };
    source.onmessage = (e) => {
      try {
        state = parseAudio(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      for (const l of listeners) l(state);
    };
  };
  return {
    getState: (): AudioState => state,
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      open();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) {
          source?.close();
          source = null;
        }
      };
    },
  };
}

export const audio = createAudioClient(AUDIO_EVENTS_URL);

/** The audio state, live. */
export const useAudio = (): AudioState => useSyncExternalStore(audio.subscribe, audio.getState, audio.getState);

/** Sends an action. Resolves to whether the server took it; never throws. After a 403 it sends nothing more until the stream reconnects. */
export async function audioAct(body: AudioAction): Promise<boolean> {
  if (refused) return false;
  try {
    const res = await fetch(AUDIO_ACT_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify(body),
    });
    if (res.status === 403) refused = true;
    return res.ok;
  } catch {
    return false;
  }
}

/** The least time between two sends for one target: about 20 a second. */
export const THROTTLE_MS = 50;

interface Slot {
  last: number;
  timer?: ReturnType<typeof setTimeout>;
  pending?: AudioAction;
}

const slots = new Map<string, Slot>();

/**
 * A fader drag's sends: at most one per `THROTTLE_MS` for each `key` (one fader), and the last value always follows,
 * so the target ends where the finger stopped.
 */
export function audioActThrottled(key: string, body: AudioAction): void {
  const slot = slots.get(key) ?? { last: -Infinity };
  slots.set(key, slot);
  const wait = slot.last + THROTTLE_MS - Date.now();
  if (wait <= 0 && !slot.timer) {
    slot.last = Date.now();
    void audioAct(body);
    return;
  }
  slot.pending = body;
  if (slot.timer) return;
  slot.timer = setTimeout(() => {
    slot.timer = undefined;
    slot.last = Date.now();
    const next = slot.pending;
    slot.pending = undefined;
    if (next) void audioAct(next);
  }, Math.max(0, wait));
}
