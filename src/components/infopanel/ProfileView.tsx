/**
 * Draws a parsed profile as positioned DOM at the profile's size, one element
 * per draw node in InfoPanel's order. Text uses the faces InfoPanel draws with
 * (font-loader), images come from the export's assets or their URLs.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { backdropFilter } from "@/lib/effects/blur.ts";
import type { CardSpec } from "@/lib/infopanel/elements/spec.ts";
import type { ExportEntry } from "@/lib/infopanel/archive.ts";
import { FontLoader, nameFont, type ResolvedFont } from "@/lib/infopanel/font-loader.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import type { DisplayItem, Profile } from "@/lib/infopanel/schema.ts";
import type { BoundItem } from "@/lib/infopanel/sensors.ts";
import { ElementSvg } from "./ElementSvg.tsx";
import { VectorGaugeSvg } from "./VectorGaugeSvg.tsx";
import { cssColor } from "@/lib/infopanel/render/color.ts";
import { PathPaint } from "./Paint.tsx";
import { smoothIndex } from "@/lib/infopanel/render/geometry.ts";
import { buildScene, hasAnimatedGauge, type DrawNode, type ImageInfo, type ImageSource, type SensorState, type TextStyle } from "@/lib/infopanel/render/scene.ts";
import { MissingImage } from "./MissingImage.tsx";
import { Table, Text, type FontCss } from "./Text.tsx";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTick } from "@/hooks/use-tick";

const fontKey = (s: TextStyle) => JSON.stringify([s.font.font, s.font.style, s.font.bold, s.font.italic]);

/**
 * Resolves every text item's font; until then, text falls back to the family name.
 * Keyed on the set of fonts asked for, so moving an item does not resolve again.
 */
export function useFonts(items: DisplayItem[], load: () => Promise<FontLoader | null> = () => FontLoader.fetch()): FontCss {
  const [resolved, setResolved] = useState<ReadonlyMap<string, ResolvedFont>>(new Map());
  const wanted = new Map<string, TextStyle["font"]>();
  for (const { item } of walkItems(items)) {
    if ("Font" in item) wanted.set(JSON.stringify([item.Font, item.FontStyle, item.Bold, item.Italic]), {
      font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic,
    });
  }
  const key = JSON.stringify([...wanted.keys()].sort());
  const latest = useRef({ wanted, load });
  latest.current = { wanted, load };
  useEffect(() => {
    let stop = false;
    const { wanted: requests, load: fetchLoader } = latest.current;
    if (requests.size === 0) return;
    fetchLoader()
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
    return r ? r.css : nameFont(style.font).css;
  };
}

/**
 * Asset files by lower-case name; `hash` tells a replaced file from the one it replaced. A file
 * with a `url` (the app's asset store) loads from it; one without is read into an object URL.
 */
export type AssetSource = ReadonlyMap<string, Partial<Pick<ExportEntry, "read">> & { hash?: string; url?: string }>;

/**
 * Loads images on first request; a failed or impossible one is null (the placeholder).
 * Keyed to one export: the parent remounts the view for another.
 */

function useImages(assets: AssetSource): (source: ImageSource) => ImageInfo | null | undefined {
  const [cache, setCache] = useState<ReadonlyMap<string, ImageInfo | null>>(new Map());
  const pending = useRef(new Set<string>());
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return useCallback((source: ImageSource) => {
    if (source.kind === "none") return null;
    const key = source.kind === "asset" ? `asset:${source.name}#${assets.get(source.name)?.hash ?? ""}` : `url:${source.url}`;
    if (cache.has(key)) return cache.get(key);
    if (!pending.current.has(key)) {
      pending.current.add(key);
      const done = (info: ImageInfo | null) => setCache((c) => new Map(c).set(key, info));
      const file = source.kind === "asset" ? assets.get(source.name) : undefined;
      const url =
        source.kind === "url"
          ? Promise.resolve(source.url)
          : file?.url
            ? Promise.resolve(file.url)
            : file?.read?.().then((b) => {
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
  }, [cache, assets]);
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

/** A card's frosted glass: the blur of what is drawn before it, over the card's rounded box (the card's own image goes on top). */
function Frosted({ spec, width, height }: { spec: CardSpec; width: number; height: number }) {
  const [w, h] = [Math.max(0, width - 2 * spec.pad), Math.max(0, height - 2 * spec.pad)];
  const filter = backdropFilter(spec.blur ?? 0);
  return (
    <div
      aria-hidden
      style={{ position: "absolute", left: spec.pad, top: spec.pad, width: w, height: h, borderRadius: Math.min(spec.radius, w / 2, h / 2), backdropFilter: filter, WebkitBackdropFilter: filter }}
    />
  );
}

/** DrawImage's transform: flip, then rotate, both about the destination's integer centre. */
function boxTransform(width: number, height: number, rotation: number, flipX: boolean): CSSProperties {
  const t = [flipX && "scaleX(-1)", rotation !== 0 && `rotate(${rotation}deg)`].filter(Boolean).join(" ");
  return t ? { transform: t, transformOrigin: `${Math.trunc(width / 2)}px ${Math.trunc(height / 2)}px` } : {};
}

/** A shape paint's turn, from the view's start time (performance.now); none when the gradient is still (or motion is reduced). */
function turnOf(node: Extract<DrawNode, { kind: "shape" }>, part: "fill" | "stroke", start?: number) {
  const { paintAt } = node;
  if (!paintAt || start === undefined) return undefined;
  return { start, at: (ms: number) => paintAt(ms)[part]! };
}

function Node({ node, id, font, canvas, start }: { node: DrawNode; id: string; font: FontCss; canvas: { width: number; height: number }; start?: number }) {
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
          {node.url ? (
            <img src={node.url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%" }} />
          ) : node.missing ? (
            <MissingImage width={node.width} height={node.height} id={id} />
          ) : (
            <Placeholder width={node.width} height={node.height} />
          )}
          {node.layer && <div style={{ position: "absolute", inset: 0, background: cssColor(node.layer) ?? "transparent" }} />}
        </div>
      );
    }
    case "element":
      return (
        <div data-path={node.path} style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height, ...boxTransform(node.width, node.height, node.rotation, false) }}>
          {node.spec.type === "card" && !!node.spec.blur && <Frosted spec={node.spec} width={node.width} height={node.height} />}
          <ElementSvg spec={node.spec} width={node.width} height={node.height} id={id} />
        </div>
      );
    case "vector":
      return (
        <div
          data-path={node.path}
          style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height, ...boxTransform(node.width, node.height, node.rotation, node.flipX) }}
        >
          <VectorGaugeSvg gauge={node.gauge} p={node.p} width={node.width} height={node.height} id={id} />
        </div>
      );
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
            {node.fill && <PathPaint id={`${id}-f`} d={node.d} paint={node.fill} rotate={rotate} space={canvas} turn={turnOf(node, "fill", start)} />}
            {node.stroke && <PathPaint id={`${id}-s`} d={node.d} paint={node.stroke.paint} stroke={node.stroke.width} rotate={rotate} space={canvas} turn={turnOf(node, "stroke", start)} />}
          </g>
        </svg>
      );
    }
  }
}

export interface ProfileViewProps {
  profile: Profile;
  items: DisplayItem[];
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
  /** The asset files the items draw. */
  assets: AssetSource;
  /** Where InfoPanel's faces come from when `font` is not given (FontLoader.fetch by default). */
  fontLoader?: () => Promise<FontLoader | null>;
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

export function ProfileView({ profile, items, sensor, now, hidden, overlay, controls, font: given, native, assets, fontLoader }: ProfileViewProps) {
  const uid = useId().replace(/:/g, "");
  const own = useFonts(given ? [] : items, fontLoader);
  const font = given ?? own;
  const image = useImages(assets);
  const [start] = useState(() => performance.now());
  // Bumped each tick while a gauge moves: the scene is rebuilt for its next frame.
  const [frame, setFrame] = useState(0);
  // Reduced motion draws gradients and gauges in their static, final state and runs no loop.
  const reduced = useReducedMotion();
  const gaugesAnimate = useMemo(() => !reduced && hasAnimatedGauge(items, hidden), [reduced, items, hidden]);
  // Each animating gauge's shown index, its target and when it was last moved, across scene builds.
  const gauges = useRef(new Map<string, { index: number; target: number; at: number }>());
  const [moving, setMoving] = useState(false);
  // The loop runs on the shared ticker (Max FPS) only while a gauge is still on its way; gradients turn through refs (PathPaint).
  useTick(setFrame, moving, 0, "infopanel:gauges");
  useEffect(() => {
    // Only on a change: a same-value setState after every commit would render twice per frame.
    const next = gaugesAnimate && [...gauges.current.values()].some((g) => Math.abs(g.index - g.target) > 1e-9);
    if (next !== moving) setMoving(next);
  });

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

  const built = useMemo(() => {
    const before = gauges.current;
    const after = new Map<string, { index: number; target: number; at: number }>();
    const gaugeIndex = (path: string, target: number, speed: number, count: number) => {
      const at = performance.now();
      const last = before.get(path);
      // First evaluation, or a gauge that had settled: InfoPanel uses a nominal 1/60 s so smoothing starts at once.
      const moved = last && Math.abs(last.index - last.target) > 1e-9;
      const index = smoothIndex(last?.index ?? 0, target, speed, last && moved ? (at - last.at) / 1000 : 1 / 60, count);
      after.set(path, { index, target, at });
      return index;
    };
    const scene = buildScene({ profile, items, sensor, image, now, elapsedMs: 0, hidden, gaugeIndex: reduced ? undefined : gaugeIndex });
    return { scene, after };
  }, [profile, items, sensor, image, now, frame, hidden, reduced]);
  // Kept on commit, not in the memo: a render React discards (or StrictMode's second call) must not advance a gauge.
  useLayoutEffect(() => {
    gauges.current = built.after;
  }, [built]);
  const nodes = built.scene;
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
        nodes.map((n, i) => {
          // A path can draw several nodes (a gauge crossfading between two frames).
          let k = 0;
          while (i - k > 0 && nodes[i - k - 1].path === n.path) k++;
          const part = k ? `-${k}` : "";
          return [n.path, <Node key={n.path + part} node={n} id={`${uid}-${n.path}${part}`} font={font} canvas={canvas} start={reduced ? undefined : start} />] as const;
        }),
        native,
        order,
      )}
      {overlay && <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{overlay}</div>}
      {controls}
    </div>
  );
}
