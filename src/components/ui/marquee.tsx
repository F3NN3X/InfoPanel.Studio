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
      const next = { box: b.clientWidth, content: c.getBoundingClientRect().width };
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

  // Own phase in px, so a change of content, speed or spacing, or a pause offscreen, does not make it jump.
  const phase = useRef(0);
  const last = useRef<number | null>(null);
  useTick((now) => {
    let offset: number;
    if (wallClock) offset = marqueeOffset(Date.now(), speed, sizes.content, spacing);
    else {
      if (last.current !== null) phase.current += (speed * (now - last.current)) / 1000;
      last.current = now;
      const period = sizes.content + Math.max(0, spacing);
      if (period > 0) phase.current %= period;
      offset = -phase.current;
    }
    if (track.current) track.current.style.transform = `translate3d(${offset}px,0,0)`;
  }, running, 0, "marquee");
  // Offscreen it waits where it is; one that no longer scrolls goes back to its start.
  useEffect(() => {
    last.current = null;
    if (scrolls) return;
    phase.current = 0;
    if (track.current) track.current.style.transform = "";
  }, [running, scrolls]);

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
