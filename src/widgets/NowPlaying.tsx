import type { CSSProperties } from "react";
import { makeSurfacePalette, type ModernStyle } from "@/components/surfaces";
import { surfaceBox } from "@/components/widget-style";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, has, Img, Chip, MediaProgress, scaleX, type MediaProgressMode, type ShellProps } from "./kit";
import type { VizLook, VizStyle } from "./core/viz/types";
import { widgetImage } from "./data-adapter";
import { useArtTint } from "./NowPlaying/art-tint";
import { AUDIO, levelDevice, useLevelDevice } from "./audio-device";
import { audioIdsIn, pickedIds, type FlowFilter } from "./audio-data";
import { useFastSensors } from "@/hooks/useSensors";
import { meta } from "./meta/NowPlaying";
import { trackOf, type Track, type TrackSource } from "./NowPlaying/track";

export { meta, trackOf, type Track };

export { levelDevice };

function Eq({ on }: { on: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`w-[3px] rounded-full bg-[var(--accent)] ${on ? "animate-pulse" : ""}`} style={{ height: on ? `${[60, 100, 45, 80][i]}%` : "25%", animationDelay: `${i * 0.18}s`, animationDuration: `${0.6 + i * 0.15}s` }} />
      ))}
    </span>
  );
}
// Vinyl: grooved record with the cover as the centre label, spins while playing
function Vinyl({ art, playing, className = "" }: { art?: string; playing: boolean; className?: string }) {
  return (
    <div className={`relative aspect-square shrink-0 ${className}`}>
      <div className={`absolute inset-0 rounded-full ${playing ? "animate-spin" : ""}`} style={{ animationDuration: "3.2s", background: "repeating-radial-gradient(circle at 50% 50%, #0b0b0d 0 1.5px, #1a1a1e 1.5px 3px)", boxShadow: "0 10px 30px -8px rgba(0,0,0,.8), inset 0 0 0 1px rgba(255,255,255,.06)" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 30deg, transparent 0 20%, rgba(255,255,255,.08) 25%, transparent 32% 70%, rgba(255,255,255,.06) 75%, transparent 82%)" }} />
        <div className="absolute inset-[31%] overflow-hidden rounded-full ring-2 ring-black/60">
          <Img src={art} icon="album" className="h-full w-full" />
        </div>
        <div className="absolute left-1/2 top-1/2 h-[5%] w-[5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0c0c0e]" />
      </div>
      <div className="absolute -right-[4%] top-[2%] h-[62%] w-[3%] origin-top rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 transition-transform duration-700" style={{ transform: `rotate(${playing ? 24 : 8}deg)` }} />
    </div>
  );
}

// The surfaces the cover-art tint recolours (the app's fixed-palette materials; theme takes no tint).
const TINTABLE: readonly string[] = ["glass", "matte-light", "matte-dark"];
export interface NowPlayingProps extends ShellProps {
  look?: ModuleSettings;
  source?: TrackSource;
  showArt?: boolean;
  /** Stored as `playerLayout` (the standard `layout` keeps its meaning). */
  layout?: "card" | "vinyl" | "backdrop" | "wave";
  progress?: "bar" | "wave" | "visualizer";
  vizMode?: VizStyle;
  /** audio-level-meter containers the visualiser draws the loudest of; unset = the loudest live device */
  vizDevices?: string[];
  /** Outputs or inputs only; default both. */
  vizFlow?: FlowFilter;
  vizRamp?: string;
  /** thin progress under the visualiser, default true */
  showTimeline?: boolean;
  /** elapsed / remaining times, default true */
  showTimes?: boolean;
  /** the progress row (bar, wave or visualiser), default true */
  showProgress?: boolean;
  /** tint the surface and accent from the cover art, default false */
  tint?: boolean;
  /** blurred, darkened cover art behind the content, default false */
  artBackground?: boolean;
  /** the visualiser's look: colours, shape, motion and dynamics (`vizRamp` is its colour 1) */
  vizLook?: Partial<VizLook>;
  /** Web Audio capture devices, one live row each in place of the sensor row */
  captureDevices?: string[];
}

export default function NowPlaying(p: NowPlayingProps) {
  const d = p.data;
  const m = trackOf(d, p.source);
  const pct = m.progress > 1 ? m.progress : m.progress * 100;
  const cover = widgetImage(m.art);
  const art = p.showArt !== false;
  const showProgress = p.showProgress !== false;
  const viz = showProgress && p.progress === "visualizer";
  useFastSensors(viz ? AUDIO : null);
  const device = useLevelDevice(d, "", p.names, pickedIds(d, audioIdsIn(d, p.vizFlow ?? "all"), p.vizDevices));
  const vizLook = { ...p.vizLook, color1: p.vizRamp };
  const media = (mode: MediaProgressMode, h = "", barClassName?: string) =>
    showProgress && (
      <MediaProgress
        mode={mode}
        pct={pct}
        data={d}
        device={device}
        vizMode={p.vizMode}
        vizLook={vizLook}
        playing={m.playing}
        captureDevices={p.captureDevices}
        className={h}
        barClassName={barClassName}
      />
    );
  const miniViz = (h: string) => media("visualizer", h);
  // cover-art tint: the legacy materials rebuilt from the art's palette, its vibrant fill as the accent
  const artTint = useArtTint(cover, p.tint === true);
  const surfaceName = String(p.look?.surface ?? p.surface ?? "glass");
  const palette = artTint && TINTABLE.includes(surfaceName) ? makeSurfacePalette(surfaceName as ModernStyle, artTint) : null;
  const sh = shell(p);
  const style: CSSProperties | undefined = palette ? { ...sh.style, background: surfaceBox(palette, p.look ? chromeOf(p.look) : undefined).background } : sh.style;
  const backdrop =
    p.artBackground && cover ? (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(28px) brightness(0.4) saturate(1.25)", transform: "scale(1.15)" }}
      />
    ) : undefined;
  const showTimes = p.showTimes !== false;
  // called as functions (not components) so the canvas keeps its state between renders
  const times = (cls: string) =>
    showTimes &&
    has(m.elapsed) && (
      <div className={`flex justify-between font-mono text-[10px] ${cls}`}>
        <span>{m.elapsed}</span>
        <span>-{m.remaining}</span>
      </div>
    );
  const vizBlock = (h: string, onImage = false) => (
    <div className="flex min-w-0 flex-col gap-1">
      {miniViz(h)}
      {p.showTimeline !== false && (
        <div className={`h-px w-full ${onImage ? "bg-white/10" : "bg-[color:var(--w-track)]"}`}>
          <div className={`h-full w-full transition-transform duration-500 ${onImage ? "bg-white/50" : "bg-[color:var(--w-muted)]"}`} style={scaleX(pct)} />
        </div>
      )}
      {times(onImage ? "text-zinc-300" : "text-[color:var(--w-muted)]")}
    </div>
  );
  const waveBlock = (h: string, onImage = false) =>
    !showProgress ? null : viz ? (
      vizBlock(h, onImage)
    ) : (
      <div className="flex flex-col gap-1">
        {media("wave")}
        {times(onImage ? "text-zinc-300" : "text-[color:var(--w-muted)]")}
      </div>
    );
  return (
    <Widget
      {...sh}
      accent={palette ? palette.fill : sh.accent}
      style={style}
      backdrop={backdrop}
      title={p.title ?? "Now playing"}
      icon="music_note"
      studio={{ label: m.app, live: m.playing, value: m.track || "—", sub: m.artist, img: art ? cover : undefined, kind: "text", progress: showProgress ? { a: showTimes ? m.elapsed : undefined, b: showTimes ? m.remaining : undefined, pct } : undefined, viz: viz ? miniViz : undefined }}
      compact={(box) =>
        // a 2x1 tile would draw the cover as a huge backdrop under the text: lay out tile, title, artist and time instead
        box.shape === "tile" && box.w >= 200 ? undefined : { label: m.app, value: m.track || "—", sub: m.artist, kind: "text", pct: showProgress ? pct : undefined, img: art ? cover : undefined, icon: "music_note", viz: viz ? miniViz : undefined }
      }
      right={
        <Chip>
          <span className="text-[9px]">{m.playing ? "▶" : "❚❚"}</span>
          {m.app}
        </Chip>
      }
    >
      {({ size }) => {
        const text = (big: string, onImage = false) => (
          <div className="flex min-w-0 flex-col">
            <span className={`${big} truncate font-semibold leading-tight ${onImage ? "text-white" : ""}`}>{m.track || "—"}</span>
            <span className={`truncate text-xs ${onImage ? "text-zinc-300" : "text-[color:var(--w-muted)]"}`}>
              {has(m.artist) ? m.artist : ""}
              {size === "lg" && has(m.album) ? ` · ${m.album}` : ""}
            </span>
          </div>
        );
        const progress = !showProgress ? null : viz ? (
          vizBlock(size === "lg" ? "h-12" : size === "md" ? "h-9" : "h-6")
        ) : (
          <div className="flex flex-col gap-1">
            {media(p.progress === "wave" ? "wave" : "bar")}
            {times("text-[color:var(--w-faint)]")}
          </div>
        );
        const lay = p.layout ?? "card";
        if (lay === "backdrop" && size !== "xs")
          return (
            <div className="absolute -inset-5 overflow-hidden">
              <Img src={cover} icon="album" className="absolute inset-0 h-full w-full scale-125 opacity-70 blur-2xl" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--accent) 35%, transparent), rgba(0,0,0,.55) 55%, rgba(0,0,0,.8))" }} />
              <div className="relative flex h-full items-end gap-4 p-5">
                <Img src={cover} icon="album" className={`aspect-square shrink-0 rounded-xl shadow-2xl ${size === "lg" ? "h-[62%]" : "h-[58%]"} max-h-[180px]`} />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
                  <div className="flex items-center gap-2">
                    <Eq on={m.playing} />
                    <span className="text-[10.5px] uppercase tracking-[0.1em] text-zinc-300">{m.app}</span>
                  </div>
                  {text(size === "lg" ? "text-2xl" : "text-base", true)}
                  {waveBlock(size === "lg" ? "h-12" : "h-9", true)}
                </div>
              </div>
            </div>
          );
        if (lay === "vinyl" && size !== "xs")
          return (
            <div className="flex h-full items-center gap-4">
              <Vinyl art={cover} playing={m.playing} className="h-full max-h-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                {text(size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm")}
                {size !== "sm" && waveBlock(size === "lg" ? "h-12" : "h-9")}
              </div>
            </div>
          );
        if (lay === "wave" && size !== "xs")
          return (
            <div className="flex h-full flex-col justify-between gap-3">
              <div className="flex items-center gap-3">
                {art && <Img src={cover} icon="album" className={`aspect-square shrink-0 rounded-lg ${size === "sm" ? "h-11" : "h-14"}`} />}
                <div className="min-w-0 flex-1">{text(size === "lg" ? "text-xl" : "text-base")}</div>
                <Eq on={m.playing} />
              </div>
              {waveBlock(size === "lg" ? "h-12" : "h-9")}
            </div>
          );
        if (size === "xs")
          return (
            <div className="flex h-full min-w-0 flex-col justify-center gap-1.5">
              <div className="flex min-w-0 items-center gap-3">
                {art && <Img src={cover} icon="album" className="aspect-square h-11 shrink-0 rounded-lg" />}
                <div className="flex min-w-0 flex-col">
                  {text("text-sm")}
                  {showTimes && has(m.elapsed) && <span className="truncate font-mono text-[10px] text-[color:var(--w-faint)]">{`${m.elapsed} / ${m.remaining}`}</span>}
                </div>
              </div>
              {media(viz ? "visualizer" : "bar", "h-4")}
            </div>
          );
        if (size === "lg" && art)
          return (
            <div className="flex h-full gap-5">
              <Img src={cover} icon="album" className="aspect-square h-full max-h-full shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col justify-end gap-3">
                {text("text-2xl")}
                {progress}
              </div>
            </div>
          );
        return (
          <div className="flex h-full items-center gap-3">
            {art && <Img src={cover} icon="album" className={`aspect-square shrink-0 rounded-lg ${size === "sm" ? "h-14" : "h-full max-h-28"}`} />}
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {text(size === "md" ? "text-lg" : "text-sm")}
              {progress}
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
