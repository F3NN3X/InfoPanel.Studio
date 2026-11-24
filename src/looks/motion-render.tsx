// The React end of a pack's motion (L117): the plan a card draws on this screen (`useMotionPlan`), the context its texts read,
// the text that decodes on arrival, scrambles or counts on a change (`MotionText`), and the card's sweep and line layer. A card or
// text without a plan renders exactly as it did; with one, every run is the runtime's, outside React (motion-runtime.ts, motion-list.ts).
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef, type CSSProperties, type ElementType, type ReactNode, type RefObject } from "react";
import { usePerformance } from "@/hooks/use-performance";
import { liteOf } from "@/lib/performance";
import { planMotion, type MotionKnobs, type MotionPlan, type PackMotion, type ValueMark, type ValueStyle } from "./motion";
import { watchList } from "./motion-list";
import { addMotionCard, scrambleText, valueText } from "./motion-runtime";

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
  const { glitch, flicker, sweep, arrival, value, list, boot } = plan;
  return {
    ...(glitch ? { "--mo-glitch-ms": `${glitch.ms}ms`, "--mo-gx": `${(1 + 2 * glitch.intensity).toFixed(2)}px`, "--mo-slice": `${Math.round(glitch.intensity * 40)}%` } : null),
    ...(flicker ? { "--mo-dip": (1 - 0.45 * flicker.intensity).toFixed(2) } : null),
    ...(sweep ? { "--mo-sweep-ms": `${sweep.ms}ms`, "--mo-sweep-op": (0.4 * sweep.intensity).toFixed(2) } : null),
    ...(arrival ? { "--mo-arrive-ms": `${arrival.ms}ms` } : null),
    ...(value ? { "--mo-val-ms": `${value.ms}ms`, "--mo-mark-a": value.intensity.toFixed(2) } : null),
    ...(list ? { "--mo-list-ms": `${list.ms}ms`, "--mo-list-a": list.intensity.toFixed(2) } : null),
    ...(boot ? { "--mo-boot-ms": `${boot.ms}ms`, "--mo-boot-a": boot.intensity.toFixed(2) } : null),
  } as CSSProperties;
}

/**
 * Puts the card on the page's motion while it has a plan with a glitch, a repeat, a boot or a list, and watches its rows for a
 * list. Before the frame is painted, so a card that boots is never seen ahead of its turn.
 */
export function useMotionCard(ref: RefObject<HTMLElement | null>, plan: MotionPlan | undefined): void {
  const live = !!(plan?.glitch || plan?.flicker || plan?.sweep || plan?.boot || plan?.list);
  // the plan's key names it: a new object with the same values is the same plan
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !plan || !live) return;
    const off = addMotionCard(el, plan);
    const rows = plan.list ? watchList(el, plan.list) : undefined;
    return () => {
      off();
      rows?.();
    };
  }, [ref, plan?.key, live]);
}

/** The card's sweep and its arrival or boot line: a click-through, unseen layer under the content (nothing without one of them). */
export function MotionLayer({ plan }: { plan: MotionPlan | undefined }) {
  const line = plan?.arrival?.style === "line";
  if (!plan?.sweep && !line && !plan?.boot?.line) return null;
  return <div aria-hidden data-mo-layer="" data-mo-arrive={line ? "line" : undefined} className="pointer-events-none absolute inset-0 overflow-hidden" />;
}

/**
 * A label (decodes when it arrives, or in its card's boot) or a number (counts, rolls or scrambles when it changes), when the card's
 * plan has that effect and the text is plain text; otherwise the text as it is. A number with both `value` and `scramble` takes the value.
 */
export function MotionText({ children, part }: { children: ReactNode; part: "label" | "num" }) {
  const plan = useContext(MotionCtx);
  const text = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  if (!plan || !text) return <>{children}</>;
  if (part === "num" && plan.value) return <Valued text={text} ms={plan.value.ms} every={plan.value.every} style={(plan.value.style as ValueStyle) ?? "roll"} mark={plan.value.mark ?? "none"} />;
  const fx = part === "num" ? plan.scramble : plan.decode;
  // the boot decodes the card's title at its turn, and a glitch on numbers tears a number's copy: the text is ready for them, and runs on its own only with its effect
  const torn = part === "num" && (plan.glitch?.target === "value" || plan.glitch?.target === "all");
  if (!fx && !(part === "label" && plan.boot?.decode) && !torn) return <>{children}</>;
  return <Moving text={text} part={part} ms={fx?.ms ?? 0} every={fx?.every ?? 0} intensity={fx?.intensity ?? 1} self={!!fx} />;
}

/** A number in the page and the copy its count or roll is drawn in (aria-hidden, empty between runs): the real reading is in the page at once. */
function Valued({ text, ms, every, style, mark }: { text: string; ms: number; every: number; style: ValueStyle; mark: ValueMark }) {
  const host = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | undefined>(undefined);
  /** A number runs at most once in `every` seconds. */
  const ran = useRef(-Infinity);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = text;
    const h = host.current;
    const c = copy.current;
    if (!h || !c || before === undefined || before === text) return;
    const now = performance.now();
    if (now - ran.current < every * 1000) return;
    ran.current = now;
    return valueText(h, c, text, before, { ms, style, mark });
  }, [text, ms, every, style, mark]);
  return (
    <span ref={host} data-mo-text="">
      {text}
      <span ref={copy} aria-hidden data-mo-copy="" />
    </span>
  );
}

/** The text in the page and the noise copy over it (aria-hidden, empty between runs). `self` false: only the boot decodes it. */
function Moving({ text, part, ms, every, intensity, self = true }: { text: string; part: "label" | "num"; ms: number; every: number; intensity: number; self?: boolean }) {
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
    if (!h || !c || !self) return;
    if (part === "label" ? before !== undefined : before === undefined || before === text) return;
    const now = performance.now();
    if (part === "num" && now - ran.current < every * 1000) return;
    ran.current = now;
    return scrambleText(h, c, text, { ms, intensity, from: part === "num" ? before : undefined });
  }, [text, part, ms, every, intensity, self]);
  return (
    <span ref={host} data-mo-text="">
      {text}
      <span ref={copy} aria-hidden data-mo-copy="" />
    </span>
  );
}

/** A row's identity for motion-list.ts (`data-mo-key`): the key only while the card's plan has a list, so a card without one keeps its markup. */
export function useRowKey(rowKey: string | undefined): string | undefined {
  return useContext(MotionCtx)?.list ? rowKey : undefined;
}

/** A list widget's row: the element as it was, marked with its identity (`useRowKey`). A row that is also a treatment part passes `rowKey` to `Part` instead. */
export function MotionRow<T extends "li" | "div">({ as, rowKey, ...rest }: { as: T; rowKey: string } & ComponentPropsWithoutRef<T>) {
  const key = useRowKey(rowKey);
  const Tag = as as ElementType;
  return <Tag {...rest} data-mo-key={key} />;
}
