// What a solo changes on the mixer: pure, over the channel list the Stream Mixer and its buttons share
// (`../stream-mixer/channels.ts`). A channel is soloed when it is live and every other channel but Master is muted.
import type { MixChannel } from "../stream-mixer/channels";

/** The channels a solo of `id` silences: every one but that channel and Master. */
export const othersOf = (channels: readonly MixChannel[], id: string): MixChannel[] => channels.filter((c) => c.id !== id && !c.master);

/** Whether `id` is live while every other channel (Master apart) is muted; false with nothing else to mute. */
export function isSoloed(channels: readonly MixChannel[], id: string): boolean {
  const me = channels.find((c) => c.id === id);
  const others = othersOf(channels, id);
  return !!me && !me.mute && others.length > 0 && others.every((c) => c.mute);
}

/** The ids a solo muted, by solo (the channel and its Wave Link mix), kept for the second tap. `saveMemory` keeps them across a reload. */
export type SoloMemory = Map<string, string[]>;

const STORAGE_KEY = "dashboard.mixer-solo";

/** The record a reload left (what each solo muted); empty when there is none or it cannot be read. */
export function loadMemory(storage: Pick<Storage, "getItem"> = globalThis.localStorage): SoloMemory {
  try {
    const raw: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
    return new Map(entries.filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((id) => typeof id === "string")));
  } catch {
    return new Map();
  }
}

/** Writes the record so the second tap still knows what the solo muted after a reload. */
export function saveMemory(memory: SoloMemory, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Private mode or blocked storage: the solo works, it just does not survive a reload.
  }
}

/**
 * One tap. Not soloed: mutes the others that are live, remembers which, and unmutes the channel if it was muted. Soloed:
 * unmutes the ones it remembers that are still muted, or every other channel when it remembers none (storage that was cleared
 * while a solo was on). `flip` writes a channel's mute (a toggle, so only a channel that has to change is passed).
 */
export function pressSolo(channels: readonly MixChannel[], id: string, memory: SoloMemory, key: string, flip: (c: MixChannel) => void): void {
  const me = channels.find((c) => c.id === id);
  if (!me) return;
  const others = othersOf(channels, id);
  if (!isSoloed(channels, id)) {
    const live = others.filter((c) => !c.mute);
    memory.set(key, live.map((c) => c.id));
    if (me.mute) flip(me);
    for (const c of live) flip(c);
    return;
  }
  const remembered = memory.get(key);
  memory.delete(key);
  for (const c of others) if (c.mute && (!remembered || remembered.includes(c.id))) flip(c);
}
