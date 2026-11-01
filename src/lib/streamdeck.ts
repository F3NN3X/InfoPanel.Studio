/**
 * The Stream Deck control the Elgato Stream Deck widget and Settings › Connections use (ips-server's streamdeck module):
 * the server holds one virtual deck per widget in the Stream Deck app. Kiosks and the studio read the state over one
 * shared EventSource (`/events/streamdeck`) and write with `POST /api/streamdeck/act`; neither is config, so none of it
 * enters the undo history.
 */

import { useSyncExternalStore } from "react";
import { trackEventSource } from "@/lib/sensor-store";
import { createRefusal, READ_ONLY_HINT } from "@/lib/write-refusal";

export const STREAMDECK_EVENTS_URL = "/events/streamdeck";
export const STREAMDECK_ACT_URL = "/api/streamdeck/act";
export const STREAMDECK_ICON_URL = "/api/streamdeck/icon";

/** A grid side runs from 1 to this. */
export const MAX_SIDE = 8;
/** The grids the Grid row offers by one tap. */
export const GRID_PRESETS: readonly (readonly [number, number])[] = [
  [5, 3],
  [8, 4],
  [8, 5],
  [8, 8],
];

export type DeckStatus = "off" | "absent" | "connecting" | "pairing" | "ready" | "error";

export interface DeckKey {
  index: number;
  title: string;
  /** The icon's version (its URL's `v`), null for a key with no icon. */
  icon: string | null;
}

export interface Deck {
  id: string;
  name: string;
  cols: number;
  rows: number;
  status: DeckStatus;
  error?: string;
  /** `current` counts from 0; `total` is 0 until the app has said. */
  page: { current: number; total: number };
  keys: DeckKey[];
}

export interface StreamDeckState {
  enabled: boolean;
  /** The 6 characters to confirm in the Stream Deck app. */
  pairingCode: string;
  devices: Deck[];
}

export const EMPTY_STREAMDECK: StreamDeckState = { enabled: false, pairingCode: "", devices: [] };

/** What `POST /api/streamdeck/act` takes. A key index runs from 0 on the device's grid, left to right, top to bottom. */
export type DeckAction =
  | { op: "press"; device: string; index: number; down: boolean }
  | { op: "page"; device: string; to: "next" | "prev" | number }
  | { op: "pair" }
  | { op: "create"; name?: string; cols?: number; rows?: number }
  | { op: "grid"; device: string; cols: number; rows: number }
  | { op: "rename"; device: string; name: string }
  | { op: "forget"; device: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const whole = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const STATUSES: readonly string[] = ["off", "absent", "connecting", "pairing", "ready", "error"];

/** Tolerant read of the server's message: a malformed device or key is dropped, never thrown on. */
export function parseStreamDeck(raw: unknown): StreamDeckState {
  if (!isObject(raw)) return EMPTY_STREAMDECK;
  const devices = (Array.isArray(raw.devices) ? raw.devices : []).filter(isObject).flatMap((d): Deck[] => {
    const id = text(d.id);
    if (!id) return [];
    const page = isObject(d.page) ? d.page : {};
    const keys = (Array.isArray(d.keys) ? d.keys : []).filter(isObject).map((k): DeckKey => ({ index: whole(k.index, 0, 63, 0), title: text(k.title), icon: text(k.icon) || null }));
    return [
      {
        id,
        name: text(d.name) || id,
        cols: whole(d.cols, 1, MAX_SIDE, 5),
        rows: whole(d.rows, 1, MAX_SIDE, 3),
        status: STATUSES.includes(text(d.status)) ? (d.status as DeckStatus) : "connecting",
        ...(text(d.error) ? { error: text(d.error) } : {}),
        page: { current: whole(page.current, 0, 9999, 0), total: whole(page.total, 0, 9999, 0) },
        keys,
      },
    ];
  });
  return { enabled: raw.enabled === true, pairingCode: text(raw.pairingCode), devices };
}

type Listener = (state: StreamDeckState) => void;

/** Between tries at a stream the server refused. */
const RETRY_MS = 5000;

/** Set after the server refused a write (403: another machine, remote editing off): the widget shows itself read-only until the state changes. */
export const streamDeckRefusal = createRefusal();

/**
 * The stream to the dashboard server: `connecting` until it first opens, `open`, then `lost` while it retries after
 * dropping. The last state stays as it was, so this is what says it is stale.
 */
export type StreamDeckLink = "connecting" | "open" | "lost";

/** The shared client: `getState` / `getLink` / `subscribe`. */
export function createStreamDeckClient(url: string) {
  let state = EMPTY_STREAMDECK;
  let link: StreamDeckLink = "connecting";
  let source: EventSource | null = null;
  const listeners = new Set<Listener>();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const setLink = (next: StreamDeckLink) => {
    if (next === link) return;
    link = next;
    for (const l of listeners) l(state);
  };
  const open = () => {
    if (source || !listeners.size || typeof EventSource === "undefined") return;
    source = trackEventSource(new EventSource(url));
    // Any error drops the stream: the browser retries one that broke, and closes one the server refused (a status other
    // than 200) for good, so that one is opened again after a while.
    source.onerror = () => {
      if (link === "open") setLink("lost");
      if (source?.readyState !== EventSource.CLOSED) return;
      source = null;
      if (listeners.size) retry = setTimeout(open, RETRY_MS);
    };
    source.onopen = () => {
      streamDeckRefusal.set(false);
      setLink("open");
    };
    source.onmessage = (e) => {
      try {
        state = parseStreamDeck(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      for (const l of listeners) l(state);
    };
  };
  return {
    getState: (): StreamDeckState => state,
    getLink: (): StreamDeckLink => link,
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      open();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) {
          clearTimeout(retry);
          source?.close();
          source = null;
          link = "connecting";
        }
      };
    },
  };
}

export const streamDeck = createStreamDeckClient(STREAMDECK_EVENTS_URL);

/** Every device and the connection, live. */
export const useStreamDeck = (): StreamDeckState => useSyncExternalStore(streamDeck.subscribe, streamDeck.getState, streamDeck.getState);

/** Whether the state above is live (`open`), not here yet (`connecting`), or stale while the stream retries (`lost`). */
export const useStreamDeckLink = (): StreamDeckLink => useSyncExternalStore(streamDeck.subscribe, streamDeck.getLink, streamDeck.getLink);

/** One device, live (undefined: not in the registry, or the state has not arrived). */
export const useDeck = (id: string): Deck | undefined => useStreamDeck().devices.find((d) => d.id === id);

/** The answer to an action: whether the server took it, and its reply (`{ id }` of a create, `{ appDevice }` of a forget) or message. */
export interface DeckResult {
  ok: boolean;
  status: number;
  data?: { id?: string; appDevice?: "deleted" | "none" | "kept" };
  /** Why it was refused, in plain words (`actMessage`), never the server's body. */
  error?: string;
}

/**
 * What a refused action says, by the server's status. Its body (a parser's message, a guard's text) never reaches the
 * UI: these say what happened in plain words.
 */
export const ACT_MESSAGES: Readonly<Record<number, string>> = {
  0: "The dashboard server didn't answer",
  400: "The dashboard server didn't accept that change",
  403: READ_ONLY_HINT,
  404: "That Stream Deck device is gone",
  503: "The Stream Deck app isn't connected",
};

/** The message for a refused action's status. */
export const actMessage = (status: number): string => ACT_MESSAGES[status] ?? "The Stream Deck change didn't go through";

/** Sends an action. Resolves to what the server answered; never throws. After a 403 it sends nothing more until the stream reconnects. */
export async function deckAct(body: DeckAction): Promise<DeckResult> {
  if (streamDeckRefusal.get()) return { ok: false, status: 403, error: actMessage(403) };
  return post(body);
}

async function post(body: DeckAction): Promise<DeckResult> {
  try {
    const res = await fetch(STREAMDECK_ACT_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify(body),
    });
    if (res.status === 403) streamDeckRefusal.set(true);
    if (!res.ok) return { ok: false, status: res.status, error: actMessage(res.status) };
    const data = res.status === 204 ? undefined : ((await res.json().catch(() => undefined)) as DeckResult["data"]);
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, error: actMessage(0) };
  }
}

const lanes = new Map<string, Promise<unknown>>();

/**
 * A key going down or up. Presses are not throttled and a release is never dropped: each device's presses go one at a
 * time, in the order they happened, so the down and its up both arrive in order. A release goes out even after a 403
 * (the server decides) and is tried once more when the server didn't answer.
 */
export function deckPress(device: string, index: number, down: boolean): Promise<DeckResult> {
  const body: DeckAction = { op: "press", device, index, down };
  const send = async () => {
    if (down) return deckAct(body);
    const res = await post(body);
    return res.status === 0 ? post(body) : res;
  };
  const next = (lanes.get(device) ?? Promise.resolve()).then(send);
  lanes.set(device, next);
  return next;
}

/** The URL of a key's icon; `version` (the key's `icon`) makes the answer cacheable for good. */
export const iconUrl = (device: string, index: number, version: string): string =>
  `${STREAMDECK_ICON_URL}?device=${encodeURIComponent(device)}&index=${index}&v=${encodeURIComponent(version)}`;
