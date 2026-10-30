// What Stream Chat shows, apart from drawing it: which messages (merged by time across the platforms), who is mentioned and
// whether the send box can work. Pure.
import type { ChatMessage, ChatPlatform, ChatState } from "@/lib/chat";
import type { TwitchState } from "@/lib/extras";

export type ChatSource = "twitch" | "youtube" | "both";

/** The platforms a source reads. */
export const platformsOf = (source: ChatSource): ChatPlatform[] => (source === "both" ? ["twitch", "youtube"] : [source]);

/** The last `max` messages of the source's platforms, oldest first: by time, and in the stream's order for equal times. */
export function mergeChat(messages: ChatMessage[], source: ChatSource, max: number): ChatMessage[] {
  const from = platformsOf(source);
  return messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => from.includes(m.platform))
    .sort((a, b) => a.m.ts - b.m.ts || a.i - b.i)
    .map(({ m }) => m)
    .slice(-Math.max(1, max));
}

/** Whether a message names `name` as `@name` (any case); no name never matches. */
export function mentions(text: string, name: string): boolean {
  const n = name.trim().replace(/^@/, "").toLowerCase();
  return n !== "" && text.toLowerCase().includes(`@${n}`);
}

/** A stable hue (degrees, 0-315) for a name with no colour of its own. */
export function nameHue(name: string): number {
  let x = 0;
  for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return (x % 8) * 45;
}

/** The platform a typed message goes to. */
export const sendTarget = (source: ChatSource, sendTo?: ChatPlatform): ChatPlatform => (source === "both" ? (sendTo ?? "twitch") : source);

export interface SendGate {
  /** The "Show send box" setting (default on). */
  enabled: boolean;
  /** The server refused writes from this screen. */
  refused: boolean;
  target: ChatPlatform;
  twitch: TwitchState | undefined;
  chat: ChatState;
}

/** The send box shows only when a send can work: signed in, the chat connected, and not refused. YouTube sending arrives with its connection. */
export function canSend(g: SendGate): boolean {
  if (!g.enabled || g.refused) return false;
  return g.target === "twitch" && g.twitch?.signedIn === true && g.chat.platforms.twitch?.connected === true;
}
