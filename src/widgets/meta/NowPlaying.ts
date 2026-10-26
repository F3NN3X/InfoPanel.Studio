// NowPlaying's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "NowPlaying",
  name: "Now Playing",
  category: "Media",
  icon: "music_note",
  prefixes: ["plugins.media-plugin.", "plugins.spotify-plugin.", "spotify."],
  defaultSize: [3, 1],
  minSize: [1, 1],
  blurb: "Track, artist and cover art",
  tags: "spotify music song",
  description: "Track, artist, album, cover art and progress from Windows Media, Spotify or a pushed source.",
  viewKey: "playerLayout",
  views: [
    { id: "card", name: "Card" },
    { id: "vinyl", name: "Vinyl", blurb: "The cover on a spinning record", tags: "record turntable lp" },
    { id: "backdrop", name: "Backdrop", blurb: "Track over its blurred cover art", tags: "background blur" },
    { id: "wave", name: "Wave", blurb: "Track with a waveform progress line", tags: "waveform visualizer" },
  ],
};
