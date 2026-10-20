"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTick } from "@/hooks/use-tick";
import { marqueeOffset } from "@/lib/marquee";

export interface MarqueeProps extends Omit<HTMLAttributes<HTMLDivElement>, "style" | "children"> {
  /** Px per second. */
  speed: number;
  /** Px between one copy's end and the next's start. */
  spacing: number;
  /** The box's style; a function gets whether the content is wider than the box (`overflow` is set for you then). */
  style?: CSSProperties | ((overflowing: boolean) => CSSProperties);
  /** Phase from the wall clock, as InfoPanel's faithful marquee does, instead of from mount. */
  wallClock?: boolean;
  children: ReactNode;
}

/**
 * InfoPanel's marquee: content wider than the box scrolls left, followed by a second copy `spacing` px
 * behind. Its position is written to the track straight from the shared ticker (no React state per tick).
 * Content that fits, or any content under reduced motion, stays put at its start, clipped; a box that is
 * offscreen or unmounted does not tick.
 */
export function Marquee({ speed, spacing, style, wallClock = false, children, ...rest }: MarqueeProps) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState({ box: 0, content: 0 });
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const [b, c] = [box.current, copy.current];
    if (!b || !c) return;
    const measure = () => {
      const next = { box: b.clientWidth, content: c.offsetWidth };
      setSizes((s) => (s.box === next.box && s.content === next.content ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const b = box.current;
    if (!b || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setVisible(entries[entries.length - 1].isIntersecting));
    io.observe(b);
    return () => io.disconnect();
  }, []);

  const overflowing = sizes.box > 0 && sizes.content > sizes.box;
  const scrolls = overflowing && !reduced;
  const running = scrolls && visible;

  const start = useRef<number | null>(null);
  useTick((now) => {
    if (start.current === null) start.current = now;
    const elapsed = wallClock ? Date.now() : now - start.current;
    if (track.current) track.current.style.transform = `translate3d(${marqueeOffset(elapsed, speed, sizes.content, spacing)}px,0,0)`;
  }, running);
  // A stopped marquee waits at its start, and begins again from it.
  useEffect(() => {
    if (running) return;
    start.current = null;
    if (track.current) track.current.style.transform = "";
  }, [running]);

  const part = (ref?: Ref<HTMLDivElement>) => (
    <div ref={ref} style={{ display: "inline-block", flex: "none", whiteSpace: "pre", marginRight: scrolls ? spacing : 0 }}>
      {children}
    </div>
  );
  return (
    <div ref={box} {...rest} style={{ ...(typeof style === "function" ? style(overflowing) : style), ...(overflowing ? { overflow: "hidden" } : {}) }}>
      <div ref={track} style={overflowing ? { display: "flex", width: "max-content", willChange: scrolls ? "transform" : undefined } : undefined}>
        {part(copy)}
        {scrolls && part()}
      </div>
    </div>
  );
}
