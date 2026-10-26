// The track Now Playing shows, read apart from the widget: the island and the Status Bar read it from the kiosk entry.
import { get, num, type Data } from "../kit";

export interface Track {
  track: string;
  artist: string;
  album: string;
  elapsed?: string;
  remaining?: string;
  progress: number;
  playing: boolean;
  art: string;
  app: string;
}

/** Where the track comes from: Auto, the media plugin, the Spotify plugin, or values pushed to `spotify.*`. */
export type TrackSource = "auto" | "media" | "spotify" | "pushed";

const SOURCES: Record<string, (d: Data) => Track> = {
  media: (d) => {
    const k = (s: string) => get(d, `plugins.media-plugin.media.${s}`);
    const state = num(k("playback-state"));
    return { track: k("current-track"), artist: k("artist"), album: k("album"), elapsed: k("elapsed-time"), remaining: k("remaining-time"), progress: num(k("track-progress")), playing: state === 4 || state === 2, art: k("cover-art"), app: "Media" };
  },
  // a pushed `spotify.*` value wins over the plugin's, as the legacy Spotify widget read them
  spotify: (d) => {
    const k = (s: string, pushed?: string) => (pushed && get(d, `spotify.${pushed}`)) || get(d, `plugins.spotify-plugin.spotify.${s}`);
    const state = num(k("playback-state", "playing"));
    return { track: k("current-track", "track"), artist: k("artist", "artist"), album: k("album", "album"), elapsed: k("elapsed-time"), remaining: k("remaining-time"), progress: num(k("track-progress", "progress")), playing: state === 1 || state === 2, art: k("cover-art", "art"), app: "Spotify" };
  },
  pushed: (d) => {
    const k = (s: string) => get(d, `spotify.${s}`);
    return { track: k("track"), artist: k("artist"), album: k("album"), progress: num(k("progress")), playing: k("playing") === "1", art: k("art"), app: "Pushed" };
  },
};

/** The track of the chosen source; Auto takes Spotify unless its plugin reports idle. */
export const trackOf = (d: Data, source: TrackSource | undefined): Track => {
  const src = source && source !== "auto" ? source : /idle/i.test(get(d, "plugins.spotify-plugin.spotify.current-track")) ? "media" : "spotify";
  return (SOURCES[src] ?? SOURCES.media)(d);
};
