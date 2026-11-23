// The React end of a pack's motion (L117): the plan a card draws on this screen (`useMotionPlan`), the context its texts read,
// the text that decodes on arrival or scrambles on a change (`MotionText`), and the card's sweep and line layer. A card or text
// without a plan renders exactly as it did; with one, every run is the runtime's, outside React (motion-runtime.ts).
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePerformance } from "@/hooks/use-performance";
import { liteOf } from "@/lib/performance";
import { planMotion, type MotionKnobs, type MotionPlan, type PackMotion } from "./motion";
import { addMotionCard, scrambleText } from "./motion-runtime";

/** What a card wearing a pack with motion carries in its slots: the pack's block and the knobs its level sets. */
export interface MotionSlot {
  spec: PackMotion;
  knobs: MotionKnobs;
}

/** The plan of the card a text sits in (undefined: no motion). */
export const MotionCtx = createContext<MotionPlan | undefined>(undefined);

/** The plan a card draws: the pack's motion through the knobs, the screen's FX level, lite mode and reduced motion (`planMotion`). Equal plans keep one object. */
export function useMotionPlan(slot: MotionSlot | undefined): MotionPlan | undefined {
  const perf = usePerformance();
  const lite = liteOf(perf);
  const plan = useMemo(() => (slot ? planMotion(slot.spec, slot.knobs, { level: perf.fx, lite, reduceMotion: perf.reduceMotion }) : undefined), [slot, perf.fx, lite, perf.reduceMotion]);
  const last = useRef(plan);
  if (last.current?.key !== plan?.key) last.current = plan;
  return last.current;
}

/** The card's motion values for index.css's `app-mo-*` rules (none without a plan). */
export function motionVars(plan: MotionPlan | undefined): CSSProperties | undefined {
  if (!plan) return undefined;
  const { glitch, flicker, sweep, arrival } = plan;
  return {
    ...(glitch ? { "--mo-glitch-ms": `${glitch.ms}ms`, "--mo-gx": `${(1 + 2 * glitch.intensity).toFixed(2)}px`, "--mo-slice": `${Math.round(glitch.intensity * 40)}%` } : null),
    ...(flicker ? { "--mo-dip": (1 - 0.45 * flicker.intensity).toFixed(2) } : null),
    ...(sweep ? { "--mo-sweep-ms": `${sweep.ms}ms`, "--mo-sweep-op": (0.4 * sweep.intensity).toFixed(2) } : null),
    ...(arrival ? { "--mo-arrive-ms": `${arrival.ms}ms` } : null),
  } as CSSProperties;
}

/** Puts the card on the page's motion while it has a plan with a glitch or a repeat. */
export function useMotionCard(ref: RefObject<HTMLElement | null>, plan: MotionPlan | undefined): void {
  const live = !!(plan?.glitch || plan?.flicker || plan?.sweep);
  // the plan's key names it: a new object with the same values is the same plan
  useEffect(() => {
    const el = ref.current;
    if (!el || !plan || !live) return;
    return addMotionCard(el, plan);
  }, [ref, plan?.key, live]);
}

/** The card's sweep and arrival line: a click-through, unseen layer under the content (nothing without either). */
export function MotionLayer({ plan }: { plan: MotionPlan | undefined }) {
  const line = plan?.arrival?.style === "line";
  if (!plan?.sweep && !line) return null;
  return <div aria-hidden data-mo-layer="" data-mo-arrive={line ? "line" : undefined} className="pointer-events-none absolute inset-0 overflow-hidden" />;
}

/** A label (decodes when it arrives) or a number (scrambles when it changes), when the card's plan has that effect and the text is plain text; otherwise the text as it is. */
export function MotionText({ children, part }: { children: ReactNode; part: "label" | "num" }) {
  const plan = useContext(MotionCtx);
  const fx = part === "num" ? plan?.scramble : plan?.decode;
  const text = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  if (!fx || !text) return <>{children}</>;
  return <Moving text={text} part={part} ms={fx.ms} every={fx.every} intensity={fx.intensity} />;
}

/** The text in the page and the noise copy over it (aria-hidden, empty between runs). */
function Moving({ text, part, ms, every, intensity }: { text: string; part: "label" | "num"; ms: number; every: number; intensity: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | undefined>(undefined);
  /** A number scrambles at most once in `every` seconds, so a reading that changes each tick does not churn all the time. */
  const ran = useRef(-Infinity);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = text;
    const h = host.current;
    const c = copy.current;
    if (!h || !c) return;
    if (part === "label" ? before !== undefined : before === undefined || before === text) return;
    const now = performance.now();
    if (part === "num" && now - ran.current < every * 1000) return;
    ran.current = now;
    return scrambleText(h, c, text, { ms, intensity, from: part === "num" ? before : undefined });
  }, [text, part, ms, every, intensity]);
  return (
    <span ref={host} data-mo-text="">
      {text}
      <span ref={copy} aria-hidden data-mo-copy="" />
    </span>
  );
}
