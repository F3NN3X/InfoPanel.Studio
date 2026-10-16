/**
 * Draws a parsed profile as positioned DOM at the profile's size, one element
 * per draw node in InfoPanel's order. Text uses the faces InfoPanel draws with
 * (font-loader), images come from the export's assets or their URLs.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ExportEntry, ParsedExport } from "../archive.ts";
import { FontLoader, type ResolvedFont } from "../font-loader.ts";
import { walkItems } from "../parse.ts";
import type { DisplayItem } from "../schema.ts";
import type { BoundItem } from "../sensors.ts";
import { cssColor } from "./color.ts";
import { PathPaint } from "./Paint.tsx";
import { buildScene, hasAnimatedGradient, type DrawNode, type ImageInfo, type ImageSource, type SensorState, type TextStyle } from "./scene.ts";
import { Table, Text, type FontCss } from "./Text.tsx";

const fontKey = (s: TextStyle) => JSON.stringify([s.font.font, s.font.style, s.font.bold, s.font.italic]);

/**
 * Resolves every text item's font; until then, text falls back to the family name.
 * Keyed on the set of fonts asked for, so moving an item does not resolve again.
 */
function useFonts(items: DisplayItem[]): FontCss {
  const [resolved, setResolved] = useState<ReadonlyMap<string, ResolvedFont>>(new Map());
  const wanted = new Map<string, TextStyle["font"]>();
  for (const { item } of walkItems(items)) {
    if ("Font" in item) wanted.set(JSON.stringify([item.Font, item.FontStyle, item.Bold, item.Italic]), {
      font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic,
    });
  }
  const key = JSON.stringify([...wanted.keys()].sort());
  const latest = useRef(wanted);
  latest.current = wanted;
  useEffect(() => {
    let stop = false;
    const requests = latest.current;
    if (requests.size === 0) return;
    FontLoader.fetch()
      .then(async (loader) => {
        if (!loader) return;
        const pairs = await Promise.all([...requests].map(async ([k, r]) => [k, await loader.resolve(r)] as const));
        if (!stop) setResolved(new Map(pairs));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [key]);
  return (style) => {
    const r = resolved.get(fontKey(style));
    if (r) return r.css;
    return { fontFamily: `"${style.font.font}"`, fontWeight: style.font.bold ? 700 : 400, fontStyle: style.font.italic ? "italic" : "normal" };
  };
}

/**
 * Loads images on first request; a failed or impossible one is null (the placeholder).
 * Keyed to one export: the parent remounts the view for another.
 */
function useImages(assets: ReadonlyMap<string, ExportEntry>): (source: ImageSource) => ImageInfo | null | undefined {
  const [cache, setCache] = useState<ReadonlyMap<string, ImageInfo | null>>(new Map());
  const pending = useRef(new Set<string>());
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return (source) => {
    if (source.kind === "none") return null;
    const key = source.kind === "asset" ? `asset:${source.name}` : `url:${source.url}`;
    if (cache.has(key)) return cache.get(key);
    if (!pending.current.has(key)) {
      pending.current.add(key);
      const done = (info: ImageInfo | null) => setCache((c) => new Map(c).set(key, info));
      const url =
        source.kind === "url"
          ? Promise.resolve(source.url)
          : assets.get(source.name)?.read().then((b) => {
              const u = URL.createObjectURL(new Blob([b.slice()]));
              objectUrls.current.push(u);
              return u;
            });
      if (!url) done(null);
      else
        url
          .then(
            (src) =>
              new Promise<ImageInfo>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ url: src, width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => reject(new Error(src));
                img.src = src;
              }),
          )
          .then(done, () => done(null));
    }
    return undefined;
  };
}

/** SKBitmapExtensions.CreateMaterialNoImageBitmap. */
function Placeholder({ width: w, height: h }: { width: number; height: number }) {
  const r = Math.min(w, h) * 0.15;
  const s = r * 0.6;
  const [l, t] = [w / 2 - s / 2, h / 2 - s / 2];
  const p = (fx: number, fy: number) => `${l + s * fx} ${t + s * fy}`;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <rect width={w} height={h} fill="#FAFAFA" />
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill="none" stroke="#9E9E9E" shapeRendering="crispEdges" />
      <circle cx={w / 2} cy={h / 2} r={r} fill="#E0E0E0" />
      <g stroke="#9E9E9E" strokeWidth={2} fill="none">
        <rect x={l} y={t} width={s} height={s} />
        <path d={`M${p(0.2, 0.8)}L${p(0.4, 0.5)}L${p(0.6, 0.7)}L${p(0.8, 0.4)}`} />
      </g>
      <circle cx={l + s * 0.75} cy={t + s * 0.25} r={s * 0.08} fill="#9E9E9E" />
    </svg>
  );
}

/** DrawImage's transform: flip, then rotate, both about the destination's integer centre. */
function boxTransform(width: number, height: number, rotation: number, flipX: boolean): CSSProperties {
  const t = [flipX && "scaleX(-1)", rotation !== 0 && `rotate(${rotation}deg)`].filter(Boolean).join(" ");
  return t ? { transform: t, transformOrigin: `${Math.trunc(width / 2)}px ${Math.trunc(height / 2)}px` } : {};
}

function Node({ node, id, font, canvas }: { node: DrawNode; id: string; font: FontCss; canvas: { width: number; height: number } }) {
  switch (node.kind) {
    case "text":
      return <Text node={node} font={font} canvasWidth={canvas.width} />;
    case "table":
      return <Table node={node} font={font} canvasWidth={canvas.width} />;
    case "image": {
      const box: CSSProperties = {
        position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height,
        ...boxTransform(node.width, node.height, node.rotation, node.flipX),
      };
      return (
        <div data-path={node.path} style={box}>
          {node.url ? <img src={node.url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%" }} /> : <Placeholder width={node.width} height={node.height} />}
          {node.layer && <div style={{ position: "absolute", inset: 0, background: cssColor(node.layer) ?? "transparent" }} />}
        </div>
      );
    }
    case "chart":
      return (
        <svg
          data-path={node.path}
          width={node.width}
          height={node.height}
          style={{ position: "absolute", left: node.x, top: node.y, overflow: "hidden", ...boxTransform(node.width, node.height, node.rotation, node.flipX) }}
        >
          {node.parts.map((p, i) => (
            <PathPaint key={i} id={`${id}-${i}`} d={p.d} paint={p.paint} stroke={p.op === "stroke" ? p.width : undefined} space={node} />
          ))}
        </svg>
      );
    case "shape": {
      const rotate = { deg: node.rotation, cx: node.cx, cy: node.cy };
      return (
        <svg width={canvas.width} height={canvas.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          <g data-path={node.path} style={{ pointerEvents: "visiblePainted" }}>
            {node.fill && <PathPaint id={`${id}-f`} d={node.d} paint={node.fill} rotate={rotate} space={canvas} />}
            {node.stroke && <PathPaint id={`${id}-s`} d={node.d} paint={node.stroke.paint} stroke={node.stroke.width} rotate={rotate} space={canvas} />}
          </g>
        </svg>
      );
    }
  }
}

export interface ProfileViewProps {
  parsed: ParsedExport;
  /** The items to draw, when they differ from the export's (an edited copy). */
  items?: DisplayItem[];
  sensor(item: BoundItem): SensorState;
  now: Date;
  /** Item paths to leave out, with their children. */
  hidden?: ReadonlySet<string>;
  /** Drawn over the profile, ignoring the pointer (a screenshot to compare with). */
  overlay?: ReactNode;
  /** Drawn on top, taking the pointer (the editing layer). */
  controls?: ReactNode;
  /** The faces to draw text with (the lab's font plan); by default, InfoPanel's. */
  font?: FontCss;
  /** Items drawn by other means (native widgets), by path; drawn in tree order among the rest. */
  native?: ReadonlyMap<string, ReactNode>;
}

/** Faithful nodes and native elements, in the items' tree order (paths compare numerically per level). */
function merge(nodes: (readonly [string, ReactNode])[], native: ReadonlyMap<string, ReactNode> | undefined, order: (p: string) => number[]): ReactNode[] {
  if (!native || native.size === 0) return nodes.map(([, n]) => n);
  const all = [...nodes, ...native];
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  };
  // A stable sort keeps a node's own parts (several per path) in their order.
  return all.sort((a, b) => cmp(order(a[0]), order(b[0]))).map(([, n]) => n);
}
const order = (path: string) => path.split(".").map(Number);

export function ProfileView({ parsed, items = parsed.items, sensor, now, hidden, overlay, controls, font: given, native }: ProfileViewProps) {
  const uid = useId().replace(/:/g, "");
  const own = useFonts(given ? [] : items);
  const font = given ?? own;
  const image = useImages(parsed.assets);
  const [start] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  const animated = useMemo(() => hasAnimatedGradient(items), [items]);
  useEffect(() => {
    if (!animated) return;
    let frame = requestAnimationFrame(function tick() {
      setElapsed(performance.now() - start);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animated, start]);

  // InfoPanel draws on whole pixels; a view starting at a fractional offset would blur
  // every half-pixel stroke, so nudge it onto the device pixel grid.
  const root = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  // Scroll anchoring can answer a margin change by scrolling, so the offset need not
  // settle; give up after a few corrections in a row instead of looping.
  const corrections = useRef(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Client pixels per CSS pixel: an ancestor's CSS zoom scales the margin too.
    const s = r.width / el.offsetWidth || 1;
    const frac = (v: number) => (Math.ceil(v * dpr) - v * dpr) / dpr / s;
    const next = { x: frac(r.left - nudge.x * s), y: frac(r.top - nudge.y * s) };
    if (Math.abs(next.x - nudge.x) <= 0.01 && Math.abs(next.y - nudge.y) <= 0.01) {
      corrections.current = 0;
      return;
    }
    if (corrections.current++ < 3) setNudge(next);
  });

  const { profile } = parsed;
  const nodes = buildScene({ profile, items, sensor, image, now, elapsedMs: elapsed, hidden });
  const canvas = { width: profile.Width, height: profile.Height };
  return (
    <div
      ref={root}
      style={{
        marginLeft: nudge.x,
        marginTop: nudge.y,
        position: "relative",
        width: profile.Width,
        height: profile.Height,
        overflow: "hidden",
        background: cssColor(profile.BackgroundColor) ?? "transparent",
        flex: "none",
      }}
    >
      {merge(
        nodes.map((n) => [n.path, <Node key={n.path} node={n} id={`${uid}-${n.path}`} font={font} canvas={canvas} />] as const),
        native,
        order,
      )}
      {overlay && <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{overlay}</div>}
      {controls}
    </div>
  );
}
