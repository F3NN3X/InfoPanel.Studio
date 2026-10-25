/** Now Playing: the media (or Spotify) plugin's cover art URL, track, artist, progress bar and times. */
import { across, bar, column, container, value, webImage, type Converter } from "./kit.ts";

const MEDIA = /^plugins\.(?:media-plugin\.media|spotify-plugin\.spotify)\./;

export const nowPlaying: Converter = (box, ctx) => {
  const c = container(ctx.sensors, MEDIA, "current-track");
  if (!c) return [];
  const has = (entry: string) => ctx.sensors[c + entry] !== undefined;
  const [art, text] = across(box, [1, 2.4]);
  const side = Math.min(art.w, art.h);
  const rows = column(text, [2, 1.2, 0.6, 0.8], 4);
  const times = across(rows[3], [1, 1]);
  return [
    ...(has("cover-art") ? [webImage(ctx, { ...art, w: side, h: side }, "Cover art", c + "cover-art")] : []),
    value(ctx, rows[0], "Track", c + "current-track", { bold: true, size: rows[0].h * 0.6 }),
    ...(has("artist") ? [value(ctx, rows[1], "Artist", c + "artist", { sub: true, size: rows[1].h * 0.7 })] : []),
    ...(has("track-progress") ? [bar(ctx, rows[2], "Progress", c + "track-progress")] : []),
    ...(has("elapsed-time") ? [value(ctx, times[0], "Elapsed", c + "elapsed-time", { sub: true, size: times[0].h * 0.7 })] : []),
    ...(has("remaining-time") ? [value(ctx, times[1], "Remaining", c + "remaining-time", { sub: true, size: times[1].h * 0.7 })] : []),
  ];
};
