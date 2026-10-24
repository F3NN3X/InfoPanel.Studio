/**
 * The server's extras: what the dashboard server learns from OBS and the calendar links
 * (ips-server's extras.rs). Kiosks read only this state; the OBS password and the calendar URLs stay on
 * the server (`/api/integrations`). One shared EventSource, opened on the first subscriber.
 */

import { trackEventSource } from "@/lib/sensor-store";
import { EMPTY_AGENTS, parseAgents, type Agents } from "./agents";

export interface ObsState {
  /** An OBS connection is set up (host and port saved). */
  configured: boolean;
  connected: boolean;
  streaming: boolean;
  recording: boolean;
}

export interface CalendarEvent {
  /** Stable per occurrence (uid and start). */
  id: string;
  title: string;
  /** Unix ms. */
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
}

export interface CalendarState {
  configured: boolean;
  /** The upcoming occurrences, soonest first (the next 36 hours). */
  events: CalendarEvent[];
  /** The last fetch error, for the studio. */
  error?: string;
}

export interface Extras {
  obs: ObsState;
  calendar: CalendarState;
  /** The coding agents' sessions, plan use and token history (`src/lib/agents.ts`). */
  agents: Agents;
}

export const EMPTY_EXTRAS: Extras = {
  obs: { configured: false, connected: false, streaming: false, recording: false },
  calendar: { configured: false, events: [] },
  agents: EMPTY_AGENTS,
};

export const EXTRAS_EVENTS_URL = "/events/extras";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Tolerant read of the server's message. */
export function parseExtras(raw: unknown): Extras {
  if (!isObject(raw)) return EMPTY_EXTRAS;
  const o = isObject(raw.obs) ? raw.obs : {};
  const c = isObject(raw.calendar) ? raw.calendar : {};
  const events = (Array.isArray(c.events) ? c.events : []).flatMap((e): CalendarEvent[] => {
    if (!isObject(e) || typeof e.id !== "string" || typeof e.start !== "number" || typeof e.end !== "number") return [];
    return [
      {
        id: e.id,
        title: typeof e.title === "string" && e.title ? e.title : "Event",
        start: e.start,
        end: e.end,
        allDay: e.allDay === true,
        ...(typeof e.location === "string" && e.location ? { location: e.location } : {}),
      },
    ];
  });
  return {
    obs: { configured: o.configured === true, connected: o.connected === true, streaming: o.streaming === true, recording: o.recording === true },
    calendar: { configured: c.configured === true, events, ...(typeof c.error === "string" && c.error ? { error: c.error } : {}) },
    agents: parseAgents(raw.agents),
  };
}

type Listener = (state: Extras) => void;

/** The shared extras client: `getState` / `subscribe` (an `IslandStore`). */
function createExtrasClient(url: string) {
  let state = EMPTY_EXTRAS;
  let source: EventSource | null = null;
  const listeners = new Set<Listener>();
  const open = () => {
    if (source || typeof EventSource === "undefined") return;
    source = trackEventSource(new EventSource(url));
    source.onmessage = (e) => {
      try {
        state = parseExtras(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      for (const l of listeners) l(state);
    };
  };
  return {
    getState: (): Extras => state,
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

export const extras = createExtrasClient(EXTRAS_EVENTS_URL);
