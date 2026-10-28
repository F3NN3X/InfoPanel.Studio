/**
 * A library item's thumbnail (the concept's AssetThumb): an image or video frame filling the box
 * (a tall one centred on dark), a play badge with the length on videos, an SVG or icon contained,
 * "Aa" in a font's own face, a panel's cell grid, a style's sample tile, a
 * screen template's zones, a gauge drawn from its spec (else its first frame), an InfoPanel profile drawn by the
 * canvas renderer (loaded when the card is shown). `live` (the selected item's detail preview) sweeps a gauge and plays a video.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Gauge, ImageOff, Monitor, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { FramesPreview } from "@/components/gauges/frames-preview";
import { GaugeView } from "@/components/gauges/gauge-view";
import { PLAY_MS, useSweepLoop } from "@/components/gauges/use-playback";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { gaugeDataOf, type GaugeLibraryData } from "@/lib/gauge-studio/model";
import { previewScope } from "@/lib/gauge-studio/preview";
import { getLibraryItem, type LibraryItem } from "@/lib/library";
import { DEFAULT_THEME } from "@/lib/theme";
import { ensureFont, fontById } from "@/lib/fonts";
import { BUILTIN_FONT, isBuiltinItem } from "@/lib/my-library/config-items";
import { fileUrl, metaOf } from "@/lib/my-library/model";
import { ProfileThumb } from "@/components/infopanel/profile-thumb";

export type ThumbSize = "sm" | "md" | "lg";

const BuiltinThumb = lazy(() => import("./builtin-thumb"));

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A font file loaded once as a face named after the item. */
const loaded = new Map<string, Promise<string | null>>();
export function useLibraryFont(item: Pick<LibraryItem, "id" | "kind" | "files">): string | null {
  const [family, setFamily] = useState<string | null>(null);
  const url = item.kind === "font" ? fileUrl(item) : undefined;
  useEffect(() => {
    if (!url || typeof FontFace === "undefined") return;
    const name = `lib-${item.id}`;
    let p = loaded.get(name);
    if (!p) {
      p = new FontFace(name, `url(${url})`)
        .load()
        .then((face) => {
          document.fonts.add(face);
          return name;
        })
        .catch(() => null);
      loaded.set(name, p);
    }
    let live = true;
    void p.then((f) => live && setFamily(f));
    return () => {
      live = false;
    };
  }, [url, item.id]);
  return family;
}

const PLAY: Record<ThumbSize, string> = { sm: "h-[22px] w-[22px]", md: "h-[34px] w-[34px]", lg: "h-[52px] w-[52px]" };
const AA: Record<ThumbSize, string> = { sm: "text-[18px]", md: "text-[38px]", lg: "text-[72px]" };

const GAUGE_PX: Record<ThumbSize, number> = { sm: 36, md: 96, lg: 180 };
const GAUGE_SCOPE = previewScope(DEFAULT_THEME);
/** The value a still gauge shows (and a live one starts from or rests at on reduced motion). */
const STILL_P = 0.62;

/** A gauge item's data: from the list, else (a large one the list left out) fetched once; null while unknown. */
function useGaugeData(item: LibraryItem): GaugeLibraryData | null {
  const [fetched, setFetched] = useState<{ id: string; data: unknown } | null>(null);
  const needs = item.kind === "gauge" && item.data === undefined && !!item.dataSize;
  useEffect(() => {
    if (!needs) return;
    let live = true;
    getLibraryItem(item.id).then(
      (full) => live && setFetched({ id: item.id, data: full.data }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [needs, item.id, item.updatedAt]);
  const raw = item.data !== undefined ? item.data : fetched?.id === item.id ? fetched.data : undefined;
  return gaugeDataOf(raw);
}

/** A gauge sweeping its value (an image sequence plays its frames at its speed); still on reduced motion. */
function LiveGauge({ data, size }: { data: GaugeLibraryData; size: number }) {
  const reduced = useReducedMotion();
  const [moving, setP] = useState(STILL_P);
  useSweepLoop(!reduced, PLAY_MS, 30, setP);
  const p = reduced ? STILL_P : moving;
  if (data.vector) return <GaugeView gauge={data.vector} p={p} size={size} scope={GAUGE_SCOPE} />;
  const frames = data.frames?.map((f) => `/api/assets/${f.id}`) ?? [];
  return <FramesPreview frames={frames} p={p} speed={data.animationSpeed} size={size} />;
}

/** A video that plays on its own when selected (not on reduced motion); the overlay button plays and pauses. */
function LiveVideo({ url, size, onError }: { url: string; size: ThumbSize; onError: () => void }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (video && !reduced) void video.play()?.catch(() => {});
    return () => video?.pause();
  }, [url, reduced]);
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play()?.catch(() => {});
    else video.pause();
  };
  return (
    <>
      <video
        ref={ref}
        src={url}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={onError}
        onClick={toggle}
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={toggle}
        className={cn("absolute grid place-items-center rounded-full bg-black/55 text-white transition-opacity", PLAY[size], playing && "opacity-0 hover:opacity-100 focus-visible:opacity-100")}
      >
        {playing ? <Pause className="h-1/2 w-1/2" fill="currentColor" /> : <Play className="h-1/2 w-1/2 translate-x-[1px]" fill="currentColor" />}
      </button>
    </>
  );
}

export function AssetThumb({ item, size = "md", live = false, className }: { item: LibraryItem; size?: ThumbSize; live?: boolean; className?: string }) {
  const m = metaOf(item);
  const url = fileUrl(item);
  const family = useLibraryFont(item);
  const builtinFont = item.kind === "font" && isBuiltinItem(item) ? fontById(item.id.slice(BUILTIN_FONT.length)) : undefined;
  useEffect(() => {
    if (builtinFont) ensureFont(builtinFont.id);
  }, [builtinFont]);
  const [broken, setBroken] = useState(false);
  const data = useGaugeData(item);
  const spec = data?.vector ?? null;
  const tall = (m.height ?? 0) > (m.width ?? 0) * 1.2;
  const box = cn("relative flex items-center justify-center overflow-hidden rounded-[8px] bg-[#141418]", className);

  if (broken) {
    return (
      <div className={cn(box, "bg-[#1a1214]")}>
        <ImageOff className="h-1/3 w-1/3 text-ui-danger/70" strokeWidth={1.5} aria-label="Missing file" />
      </div>
    );
  }
  switch (item.kind) {
    case "image":
    case "svg":
      return (
        <div className={cn(box, tall || item.kind === "svg" ? "bg-[#101013]" : "")}>
          {url && (
            <img
              src={url}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setBroken(true)}
              className={cn("h-full w-full", tall || item.kind === "svg" || (m.width ?? 999) <= 256 ? "object-contain p-[8%]" : "object-cover")}
            />
          )}
        </div>
      );
    case "video":
      return (
        <div className={box}>
          {url && live ? (
            <LiveVideo key={url} url={url} size={size} onError={() => setBroken(true)} />
          ) : url && (
            <video
              src={`${url}#t=${m.poster ?? 1}`}
              preload="metadata"
              muted
              playsInline
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          )}
          {!(url && live) && (
            <span className={cn("absolute grid place-items-center rounded-full bg-black/55 text-white", PLAY[size])}>
              <Play className="h-1/2 w-1/2 translate-x-[1px]" fill="currentColor" />
            </span>
          )}
          {m.duration !== undefined && size !== "sm" && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1 font-ui-mono text-[10px] text-white">{clock(m.duration)}</span>
          )}
        </div>
      );
    case "font":
      return (
        <div className={box}>
          <span className={cn("text-ui-1", AA[size])} style={{ fontFamily: builtinFont ? builtinFont.stack : family ? `"${family}"` : undefined }}>
            Aa
          </span>
        </div>
      );
    case "panel": {
      const cols = Math.max(1, Math.min(8, Number(m.cols) || 2));
      const rows = Math.max(1, Math.min(6, Number(m.rows) || 1));
      return (
        <div className={box}>
          <div className="grid h-[62%] w-[72%] gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {Array.from({ length: cols * rows }, (_, i) => (
              <span key={i} className="rounded-[3px] border border-white/10 bg-white/[.06]" />
            ))}
          </div>
        </div>
      );
    }
    case "style":
      return (
        <div className={box}>
          <span className="flex h-[52%] w-[62%] flex-col justify-center gap-1.5 rounded-[8px] border border-white/20 bg-slate-400/15 px-[10%] shadow-[0_8px_20px_rgba(0,0,0,.35)]">
            <span className="h-1.5 w-1/2 rounded bg-slate-300/70" />
            <span className="h-1.5 w-3/4 rounded bg-slate-300/40" />
          </span>
        </div>
      );
    case "template":
    case "ptemplate":
      return (
        <div className={box}>
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <BuiltinThumb item={item} />
            </Suspense>
          </div>
        </div>
      );
    case "gauge":
      return (
        <div className={cn(box, "bg-[#111115]")}>
          {live && data ? (
            <LiveGauge data={data} size={GAUGE_PX[size]} />
          ) : spec ? (
            <GaugeView gauge={spec} p={0.62} size={GAUGE_PX[size]} scope={GAUGE_SCOPE} />
          ) : url ? (
            <img src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="h-[84%] w-[84%] object-contain" />
          ) : (
            <Gauge className="h-2/5 w-2/5 text-ui-4" strokeWidth={1.25} />
          )}
        </div>
      );
    case "canvas":
      return size === "sm" ? (
        <div className={box}>
          <Monitor className="h-1/2 w-1/2 text-ui-4" strokeWidth={1.25} />
        </div>
      ) : (
        <div className={box}>
          <ProfileThumb item={item} />
        </div>
      );
    default:
      return (
        <div className={cn(box, "bg-[linear-gradient(135deg,#18181d_0%,#22222a_55%,#18181d_100%)]")}>
          <Monitor className="h-1/3 w-1/3 text-ui-4" strokeWidth={1.25} />
        </div>
      );
  }
}
