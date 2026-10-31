// The channels the Stream Mixer, the audio button and the audio fader show: one list over Windows' audio or Wave Link,
// and the writes each channel takes. Channel ids: `master` (the default output), `mic` (the default input),
// `app:<exe>` (an app), `wl:<channel>` (a Wave Link channel) and `wlmix:<mix>` (a Wave Link mix, shown as Master).

import type { AudioAction, AudioState } from "@/lib/audio-control";

export type AudioSource = "windows" | "wavelink";

/** Where a channel's level and mute are written. */
export type Route =
  | { t: "windows"; kind: "output" | "input" | "app"; id: string }
  | { t: "wl-channel"; id: string; mix?: string }
  | { t: "wl-mix"; id: string };

export interface MixChannel {
  id: string;
  /** The Master row: shown in neutral white, never takes a rotated colour. */
  master: boolean;
  name: string;
  sub: string;
  /** The Material Symbols name before the mute swap. */
  icon: string;
  /** 0-100. */
  vol: number;
  mute: boolean;
  route: Route;
}

const GUESS: [RegExp, string][] = [
  [/mic|input|capture/i, "mic"],
  [/discord|teams|voice|call/i, "headset_mic"],
  [/spotify|music|lo-?fi|apple ?music/i, "music_note"],
  [/game|steam|epic|\.exe/i, "sports_esports"],
  [/chrome|firefox|edge|browser|zen/i, "language"],
  [/obs|stream/i, "videocam"],
  [/system|sounds/i, "notifications"],
];

/** A Material Symbols icon for a channel, guessed from its id and name. */
export const guessIcon = (s: string): string => GUESS.find(([re]) => re.test(s))?.[1] ?? "graphic_eq";

/** The icon with the muted swap (`mic` → `mic_off`, anything else → `volume_off`). */
export const iconOf = (c: Pick<MixChannel, "icon" | "mute">): string => (c.mute ? (c.icon === "mic" ? "mic_off" : "volume_off") : c.icon);

/** Which backend a channel id belongs to. */
export const sourceOf = (id: string): AudioSource => (id.startsWith("wl:") || id.startsWith("wlmix:") ? "wavelink" : "windows");

/** The mix a Wave Link channel list follows: the picked one, the first when unset, none for "all". */
export function mixOf(state: AudioState, mix: string | undefined): string | undefined {
  if (mix === "all") return undefined;
  const mixes = state.wavelink.mixes;
  return (mixes.find((m) => m.id === mix) ?? mixes[0])?.id;
}

function windowsChannels(state: AudioState): MixChannel[] {
  const { outputs, inputs, apps } = state.windows;
  const out = outputs.find((d) => d.default);
  const mic = inputs.find((d) => d.default);
  const rows: MixChannel[] = [];
  if (out) rows.push({ id: "master", master: true, name: "Master", sub: out.name, icon: "volume_up", vol: out.volume, mute: out.muted, route: { t: "windows", kind: "output", id: out.id } });
  if (mic) rows.push({ id: "mic", master: false, name: "Mic", sub: mic.name, icon: "mic", vol: mic.volume, mute: mic.muted, route: { t: "windows", kind: "input", id: mic.id } });
  for (const a of apps) {
    const device = outputs.find((d) => d.id === a.deviceId)?.name ?? "";
    rows.push({ id: `app:${a.id}`, master: false, name: a.name, sub: device, icon: guessIcon(`${a.id} ${a.name}`), vol: a.volume, mute: a.muted, route: { t: "windows", kind: "app", id: a.id } });
  }
  return rows;
}

function wavelinkChannels(state: AudioState, mix: string | undefined): MixChannel[] {
  const { channels, mixes } = state.wavelink;
  const picked = mixOf(state, mix);
  const rows: MixChannel[] = [];
  const m = mixes.find((x) => x.id === picked);
  if (m) rows.push({ id: `wlmix:${m.id}`, master: true, name: "Master", sub: m.name, icon: "volume_up", vol: m.level, mute: m.muted, route: { t: "wl-mix", id: m.id } });
  for (const c of channels) {
    const route = c.mixes.find((r) => r.id === picked);
    rows.push({
      id: `wl:${c.id}`,
      master: false,
      name: c.name,
      sub: m?.name ?? "",
      icon: guessIcon(`${c.type} ${c.name}`),
      vol: route?.level ?? c.level,
      mute: route?.muted ?? c.muted,
      route: { t: "wl-channel", id: c.id, ...(route ? { mix: route.id } : {}) },
    });
  }
  return rows;
}

/** Every channel of a source, in the order shown when none are picked. `mix` is Wave Link's (an id, "all", or unset for the first). */
export function allChannels(state: AudioState, source: AudioSource, mix?: string): MixChannel[] {
  return source === "wavelink" ? wavelinkChannels(state, mix) : windowsChannels(state);
}

/** The picked channels in the order picked (an id that is gone is skipped); none picked = all. */
export function pickChannels(all: MixChannel[], ids: readonly string[]): MixChannel[] {
  if (!ids.length) return all;
  return ids.flatMap((id) => all.find((c) => c.id === id) ?? []);
}

/** One channel by id, over whichever backend the id belongs to. */
export const findChannel = (state: AudioState, id: string, mix?: string): MixChannel | undefined => allChannels(state, sourceOf(id), mix).find((c) => c.id === id);

export function volumeAction(r: Route, value: number): AudioAction {
  switch (r.t) {
    case "windows":
      return { target: "windows", op: "volume", kind: r.kind, id: r.id, value };
    case "wl-channel":
      return { target: "wavelink", op: "channel", id: r.id, ...(r.mix ? { mix: r.mix } : {}), level: value };
    case "wl-mix":
      return { target: "wavelink", op: "mix", id: r.id, level: value };
  }
}

/** A mute write: flips `current` (Wave Link takes the new value; Windows toggles on the server). */
export function muteAction(r: Route, current: boolean): AudioAction {
  switch (r.t) {
    case "windows":
      return { target: "windows", op: "mute", kind: r.kind, id: r.id };
    case "wl-channel":
      return { target: "wavelink", op: "channel", id: r.id, ...(r.mix ? { mix: r.mix } : {}), muted: !current };
    case "wl-mix":
      return { target: "wavelink", op: "mix", id: r.id, muted: !current };
  }
}

/** The throttle key of a fader: one per route. */
export const routeKey = (r: Route): string => (r.t === "windows" ? `w:${r.kind}:${r.id}` : r.t === "wl-mix" ? `m:${r.id}` : `c:${r.id}:${r.mix ?? ""}`);

/** Per-channel overrides typed as lines, `<channel id>=<text>` (a blank line or one without `=` is skipped). */
export function overridesOf(v: unknown): Record<string, string> {
  if (typeof v !== "string") return {};
  const out: Record<string, string> = {};
  for (const line of v.split(/\r?\n/)) {
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (at > 0 && key && value) out[key] = value;
  }
  return out;
}
