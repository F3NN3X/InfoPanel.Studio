/**
 * The live chat the Stream Chat widget reads (ips-server's twitch module): one shared EventSource on `/events/chat`
 * (latest wins, as the audio stream), and `POST /api/chat/send` to write. Neither is config, so none of it enters the
 * undo history.
 */

import { useSyncExternalStore } from "react";
import { trackEventSource } from "@/lib/sensor-store";
import { createRefusal } from "@/lib/write-refusal";

export const CHAT_EVENTS_URL = "/events/chat";
export const CHAT_SEND_URL = "/api/chat/send";

export type ChatPlatform = "twitch" | "youtube";
export type ChatBadge = "broadcaster" | "mod" | "vip" | "sub" | "";

export interface ChatMessage {
  id: string;
  platform: ChatPlatform;
  user: string;
  text: string;
  /** The platform's name colour (`#RRGGBB`); "" = none. */
  color: string;
  badge: ChatBadge;
  /** Unix ms. */
  ts: number;
}

export interface ChatState {
  /** Oldest first. */
  messages: ChatMessage[];
  platforms: Partial<Record<ChatPlatform, { connected: boolean; channel: string }>>;
}

export const EMPTY_CHAT: ChatState = { messages: [], platforms: {} };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const BADGES: readonly string[] = ["broadcaster", "mod", "vip", "sub"];
const PLATFORMS: readonly string[] = ["twitch", "youtube"];

/** Tolerant read of the server's message: a malformed entry is dropped, never thrown on. */
export function parseChat(raw: unknown): ChatState {
  if (!isObject(raw)) return EMPTY_CHAT;
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).flatMap((m): ChatMessage[] => {
    if (!isObject(m) || !text(m.id) || !PLATFORMS.includes(text(m.platform)) || typeof m.text !== "string") return [];
    return [
      {
        id: text(m.id),
        platform: m.platform as ChatPlatform,
        user: text(m.user) || "?",
        text: m.text,
        color: /^#[0-9a-f]{6}$/i.test(text(m.color)) ? text(m.color) : "",
        badge: BADGES.includes(text(m.badge)) ? (m.badge as ChatBadge) : "",
        ts: typeof m.ts === "number" && Number.isFinite(m.ts) ? m.ts : 0,
      },
    ];
  });
  const platforms: ChatState["platforms"] = {};
  if (isObject(raw.platforms)) {
    for (const p of PLATFORMS) {
      const v = raw.platforms[p];
      if (isObject(v)) platforms[p as ChatPlatform] = { connected: v.connected === true, channel: text(v.channel) };
    }
  }
  return { messages, platforms };
}

type Listener = (state: ChatState) => void;

/** Between tries at a stream the server refused. */
const RETRY_MS = 5000;

/** Set after the server refused a send (403: another machine, remote editing off); the send box hides until the stream reconnects. */
export const chatRefusal = createRefusal();

function createChatClient(url: string) {
  let state = EMPTY_CHAT;
  let source: EventSource | null = null;
  const listeners = new Set<Listener>();
  const open = () => {
    if (source || typeof EventSource === "undefined") return;
    source = trackEventSource(new EventSource(url));
    // A refused stream (a status other than 200) is closed for good by the browser: open it again after a while.
    source.onerror = () => {
      if (source?.readyState !== EventSource.CLOSED) return;
      source = null;
      if (listeners.size) setTimeout(open, RETRY_MS);
    };
    source.onopen = () => chatRefusal.set(false);
    source.onmessage = (e) => {
      try {
        state = parseChat(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      for (const l of listeners) l(state);
    };
  };
  return {
    getState: (): ChatState => state,
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

export const chat = createChatClient(CHAT_EVENTS_URL);

/** The chat, live. */
export const useChat = (): ChatState => useSyncExternalStore(chat.subscribe, chat.getState, chat.getState);

/** What a send came to: sent, or why not (`busy` = the server's 429, `offline` = its 503, `refused` = a 403). */
export type ChatSendResult = { ok: true } | { ok: false; reason: "busy" | "offline" | "refused" | "invalid" | "failed"; message: string };

const REASONS: Record<number, { reason: "busy" | "offline" | "refused" | "invalid"; message: string }> = {
  429: { reason: "busy", message: "Slow down, Twitch limits chat." },
  503: { reason: "offline", message: "Chat isn't connected." },
  403: { reason: "refused", message: "Read-only on this screen" },
  400: { reason: "invalid", message: "That message can't be sent." },
};

/** Sends a chat message. Never throws. */
export async function chatSend(platform: ChatPlatform, message: string): Promise<ChatSendResult> {
  if (chatRefusal.get()) return { ok: false, ...REASONS[403] };
  try {
    const res = await fetch(CHAT_SEND_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify({ platform, text: message }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 403) chatRefusal.set(true);
    return { ok: false, ...(REASONS[res.status] ?? { reason: "failed" as const, message: "The message wasn't sent." }) };
  } catch {
    return { ok: false, reason: "failed", message: "The message wasn't sent." };
  }
}
