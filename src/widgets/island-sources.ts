// What the Now Playing, Steam Friends and Wave Link templates send to the Dynamic Island when their
// "Send to island" is on (`src/lib/island/sources.ts`). Each `derive` is pure: previous and new data
// in, notices and the current activity out; `prev` null is the baseline and raises nothing.
import { storeSource, type DataSourceDef, type SourceNotice } from "@/lib/island/sources";
import { wavelink, type WlState } from "@/lib/wavelink";
import { get } from "./kit";
import { trackOf, type NowPlayingProps } from "./NowPlaying";
import { friendsOf } from "./SteamFriends";
import { widgetImage } from "./data-adapter";
import { boolSetting } from "./registry/settings-kit";
import { fader } from "./WaveLink";

const NP_SOURCES = ["auto", "media", "spotify", "pushed"] as const;
const npSource = (v: unknown): NowPlayingProps["source"] => NP_SOURCES.find((s) => s === v);

/** The playing track as the activity; a new track opens the island briefly. */
export const nowPlayingIsland: DataSourceDef = {
  from: "data",
  hint: "The playing track beside the time; a new track opens the island briefly",
  defaultOn: false,
  group: "Now playing",
  derive(prev, next, settings) {
    const source = npSource(settings.source);
    const t = trackOf(next, source);
    const playing = t.playing && t.track.trim() !== "";
    const activity = playing
      ? {
          id: "track",
          title: t.track,
          ...(t.artist ? { subtitle: t.artist } : {}),
          ...(widgetImage(t.art) ? { image: widgetImage(t.art) } : {}),
          progress: Math.max(0, Math.min(1, t.progress > 1 ? t.progress / 100 : t.progress)),
        }
      : null;
    const p = prev && trackOf(prev, source);
    const changed = p !== null && playing && (t.track !== p.track || t.artist !== p.artist);
    const notices: SourceNotice[] = changed
      ? [{ id: "track", severity: "info", title: t.track, ...(t.artist ? { body: t.artist } : {}), ttl: 4000 }]
      : [];
    return { notices, activity };
  },
};

const STEAM = "plugins.InfoPanel.SteamAPI.SteamAPI-Social.friends-activity";
/** One friend's notice at most this often (a flapping status raises it once). */
export const FRIEND_COOLDOWN_MS = 600_000;

/** A friend coming online or starting a game. */
export const steamFriendsIsland: DataSourceDef = {
  from: "data",
  hint: "A friend coming online or starting a game (each friend at most every 10 min)",
  defaultOn: false,
  group: "Steam friends",
  derive(prev, next) {
    if (!prev || !get(prev, STEAM)) return {};
    const before = new Map(friendsOf(get(prev, STEAM), "plugin").map((f) => [f.name, f]));
    const notices: SourceNotice[] = [];
    for (const f of friendsOf(get(next, STEAM), "plugin")) {
      const was = before.get(f.name);
      if (!was) continue;
      const started = f.game !== "" && f.game !== was.game;
      const online = !started && was.status === "offline" && f.status !== "offline";
      if (!started && !online) continue;
      notices.push({
        id: `friend:${f.name}`,
        group: "friends",
        severity: "info",
        title: started ? `${f.name} is playing` : `${f.name} is online`,
        ...(started ? { body: f.game } : {}),
        ttl: 4000,
        cooldownMs: FRIEND_COOLDOWN_MS,
      });
    }
    return { notices };
  },
};

/** Every mute switch Wave Link has: input devices, channels and mixes, by a stable id. */
function mutes(s: WlState): Map<string, { name: string; muted: boolean }> {
  const out = new Map<string, { name: string; muted: boolean }>();
  for (const d of s.devices) for (const i of d.inputs) out.set(`input:${i.id}`, { name: i.name || d.name, muted: i.isMuted });
  for (const c of s.channels) out.set(`channel:${c.id}`, { name: c.name, muted: c.isMuted });
  for (const m of s.mixes) out.set(`mix:${m.id}`, { name: m.name, muted: m.isMuted });
  return out;
}

/** Every fader Wave Link has: channels and mixes, by a stable id. */
function faders(s: WlState): Map<string, { name: string; level: number | null; levelDb?: number | null }> {
  const out = new Map<string, { name: string; level: number | null; levelDb?: number | null }>();
  for (const c of s.channels) out.set(`channel:${c.id}`, c);
  for (const m of s.mixes) out.set(`mix:${m.id}`, m);
  return out;
}

/** A mute switched in Wave Link ("Microphone muted" / "Microphone live"); optionally a fader moved. */
export const waveLinkIsland = storeSource<WlState>({
  store: { getState: wavelink.getState, subscribe: wavelink.subscribeState },
  hint: "A mic, channel or mix muted or unmuted",
  defaultOn: false,
  group: "Content",
  options: [boolSetting("islandFaders", "Fader moves", false, { hint: "A level bar while a channel or mix fader moves" })],
  derive(prev, next, settings) {
    if (prev?.status !== "up" || next.status !== "up") return {};
    const before = mutes(prev);
    const notices: SourceNotice[] = [];
    for (const [id, now] of mutes(next)) {
      const was = before.get(id);
      if (!was || was.muted === now.muted) continue;
      notices.push({ id: `mute:${id}`, severity: now.muted ? "warning" : "info", title: `${now.name} ${now.muted ? "muted" : "live"}`, ttl: 2500 });
    }
    if (settings.islandFaders === true) {
      const was = faders(prev);
      for (const [id, now] of faders(next)) {
        const old = was.get(id);
        if (!old || now.level === null || old.level === now.level) continue;
        // One notice per fader, kept open while it moves.
        notices.push({ id: `level:${id}`, severity: "info", title: now.name, body: fader(now.level, now.levelDb), progress: Math.max(0, Math.min(1, now.level)), ttl: 1500, refresh: true });
      }
    }
    return { notices };
  },
});
