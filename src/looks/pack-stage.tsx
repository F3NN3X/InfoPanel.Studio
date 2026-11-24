// The pack's page layers, overlay and effects (lazy: the entry loads this chunk only for a pack with a stage). Every layer is
// decoration: click-through, hidden from assistive tech, and `data-pack-deco` so lite mode stops its motion (index.css). The
// effects are drawn here, by code the app owns, planned from the screen's settings (effects.ts); burn-in protection (pixel
// shift, idle dim) marks only these layers, never a widget. A layer whose SVG animates moves only at the Effects level Full, out of
// lite mode and reduced motion; anywhere else it is drawn from its still copy (motion-still.ts), and nothing until that is read.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useGeneral } from "@/hooks/use-general";
import { usePerformance } from "@/hooks/use-performance";
import { liteOf } from "@/lib/performance";
import { safeFill } from "@/widgets/core/t3-tokens";
import ConnectorLayer, { hubLinks } from "./connector-layer";
import { FX_KINDS } from "./pack-json";
import { planEffects, showsAt, sizeClassOf, type PlannedEffect } from "./effects";
import type { StageLayer, StageViewProps } from "./pack";
import { useStills } from "./motion-still";
import { useIdle } from "./use-idle";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** What the idle dim leaves of a layer's own opacity (it scales it, so a faint layer only gets fainter). */
const IDLE_DIM = 0.35;
/** The pixel shift: a step to the next offset every 2.5 minutes. A discrete move, not an animation, so lite mode and reduced motion keep it. */
const SHIFT_MS = 150_000;
const SHIFT_STEPS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** The paint of an overlay effect (glow and blur act on the layers instead). */
function overlayStyle(e: PlannedEffect): CSSProperties | undefined {
  if (e.kind === "scanlines") return { backgroundImage: "repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 3px)" };
  if (e.kind === "vignette") return { backgroundImage: "radial-gradient(ellipse at center, transparent 55%, #000 130%)" };
  if (e.kind === "grain") return { backgroundImage: GRAIN, backgroundSize: "160px" };
  // The flashing kinds: each paints only itself, over the page; the pulse is index.css's.
  if (e.kind === "glitch") return { backgroundImage: "repeating-linear-gradient(0deg, transparent 0 14px, var(--w-accent, #0ff) 14px 17px, transparent 17px 41px)" };
  if (e.kind === "flicker") return { backgroundColor: "#000" };
  if (e.kind === "rgb-split") return { backgroundImage: "linear-gradient(90deg, #f00 0 3px, transparent 3px calc(100% - 3px), #0ff calc(100% - 3px))" };
  if (e.kind === "interference") return { backgroundImage: "linear-gradient(180deg, transparent, #fff 50%, transparent)", backgroundSize: "100% 30%", backgroundRepeat: "no-repeat" };
  return undefined;
}

/** The flashing kinds' pulse height and speed for index.css (`--wp-fx-op`, `--wp-fx-rate`). */
const flashVars = (e: PlannedEffect, dim: number): CSSProperties | undefined =>
  (FX_KINDS as readonly string[]).includes(e.kind) ? ({ "--wp-fx-op": e.opacity * dim, "--wp-fx-rate": e.rate } as CSSProperties) : undefined;

function useShiftStep(on: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!on) return setStep(0);
    const timer = setInterval(() => setStep((n) => (n + 1) % SHIFT_STEPS.length), SHIFT_MS);
    return () => clearInterval(timer);
  }, [on]);
  return step;
}

export default function PackStageLayers({ stage, packId, base = "", className = "", overlayClassName = "", burnIn, page, connectors, links, zones, accent }: StageViewProps) {
  const general = useGeneral();
  const perf = usePerformance();
  const lite = liteOf(perf);
  const sizeClass = page ? sizeClassOf(page.width, page.height) : undefined;
  // `data-pack-layer` is the layer's place in the pack's list, whatever the size class hides.
  const layers = stage.layers.slice(0, 3).map((layer, index) => ({ layer, index })).filter(({ layer }) => showsAt(layer.minSizeClass, sizeClass));
  const solidPage = !layers.some(({ layer: l }) => l.image || /gradient\(/i.test(l.fill ?? ""));
  const effects = planEffects(stage.effects, { level: perf.fx, lite, reduceMotion: perf.reduceMotion, limitBlur: general.blurLimit, solidPage, sizeClass });
  const idle = useIdle(burnIn === "needs-dim" ? general.idleDim : 0);
  const Overlay = showsAt(stage.overlayMinSizeClass, sizeClass) ? stage.overlay : undefined;
  const deco = burnIn === "needs-shift" && general.pixelShift ? "shift" : burnIn === "needs-dim" && general.idleDim > 0 ? "dim" : "";
  const step = useShiftStep(deco === "shift");
  const dim = deco === "dim" && idle ? IDLE_DIM : 1;
  const place: CSSProperties | undefined = deco === "shift" ? { transform: `translate(${SHIFT_STEPS[step][0]}px, ${SHIFT_STEPS[step][1]}px) scale(1.01)` } : undefined;
  // Glow and blur are one filter on each layer (index.css `wp-pack-fx`), their radii already capped by the plan.
  const glow = effects.find((e) => e.kind === "glow")?.px ?? 0;
  const blur = effects.find((e) => e.kind === "blur")?.px ?? 0;
  // A glow is the halo of a layer's art: a plain fill or gradient covers the screen, its shadow would fall off it, so only a layer with an image takes it (L81).
  const fxOf = (layer: StageLayer) => (layer.image ? glow : 0) > 0 || blur > 0;
  // The effects and glows are the screen's accent (a variant's), not the pack's own: the overlays sit outside every card, where no `--w-accent` is set.
  const tint = (accent ?? stage.accent) ? ({ "--w-accent": accent ?? stage.accent } as CSSProperties) : undefined;
  const pairs = useMemo(() => links ?? (connectors && zones ? hubLinks(zones) : undefined), [links, connectors, zones]);
  const urlOf = (image: string) => `${base}${encodeURI(image)}`;
  const moves = perf.fx === "full" && !lite && !perf.reduceMotion;
  const stills = useStills(moves ? [] : layers.flatMap(({ layer }) => (layer.animated && layer.image ? [urlOf(layer.image)] : [])));
  const imageOf = (layer: StageLayer): string | undefined => {
    if (!layer.image) return undefined;
    const url = urlOf(layer.image);
    if (!layer.animated || moves) return `url("${url}")`;
    return stills[url] ? `url("${stills[url]}")` : "none";
  };
  return (
    <>
      {layers.map(({ layer, index: i }) => {
        const fx = fxOf(layer);
        return (
        <div
          key={i}
          aria-hidden
          data-look={packId}
          data-pack-deco={deco}
          data-pack-layer={i}
          data-idle={deco === "dim" && idle ? "" : undefined}
          data-pack-moving={layer.animated ? (moves ? "on" : "still") : undefined}
          className={`pointer-events-none ${fx ? "wp-pack-fx " : ""}${className}`}
          style={{
            ...(fx ? ({ "--wp-fx-glow": `${layer.image ? glow : 0}px`, "--wp-fx-blur": `${blur}px`, ...tint } as CSSProperties) : null),
            ...(layer.image ? { backgroundImage: imageOf(layer), backgroundSize: "cover" } : { background: safeFill(layer.fill) }),
            ...place,
            opacity: deco === "dim" ? (layer.opacity ?? 1) * dim : layer.opacity,
          }}
        />
        );
      })}
      {Overlay && (
        <div aria-hidden data-look={packId} data-pack-deco={deco} data-pack-layer="overlay" data-idle={deco === "dim" && idle ? "" : undefined} className={`pointer-events-none ${overlayClassName}`} style={{ ...place, ...(deco === "dim" ? { opacity: dim } : null) }}>
          <Overlay />
        </div>
      )}
      {connectors && pairs && pairs.length > 0 && showsAt(stage.overlayMinSizeClass, sizeClass) && <ConnectorLayer links={pairs} connectors={connectors} className={className} deco={deco} style={{ ...place, ...(deco === "dim" ? { opacity: dim } : null) }} />}
      {effects.map((e, i) =>
        overlayStyle(e) ? <div key={`fx${i}`} aria-hidden data-look={packId} data-pack-deco={deco} data-pack-effect={e.kind} data-pack-animate={e.animate ? "" : undefined} className={`pointer-events-none ${overlayClassName}`} style={{ ...tint, ...overlayStyle(e), ...place, ...flashVars(e, dim), opacity: (e.opacity ?? 1) * dim }} /> : null
      )}
    </>
  );
}
