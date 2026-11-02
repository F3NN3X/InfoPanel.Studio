import { useEffect, useRef, useState } from "react";
import { connectTouch, drawPositions, onTouchMessage } from "@/lib/touch/bridge";
import { actionFor, fillsPanel, gestureKey, statusText } from "@/lib/touch/kiosk";
import { isSetup, isStatus, type Setup, type Status } from "@/lib/touch/types";

/** The waiting notice holds off this long after the page opens, so a normal start never flashes it. */
const WAIT_NOTICE_MS = 3000;

interface TouchLayerProps {
  /** The touch panel's id (`?touch=<id>`). */
  panel: string;
  /** A gesture's `page` action: show the next or previous page. */
  onPage: (to: "next" | "prev") => void;
}

/** The viewport's CSS size, kept current. */
function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** Rings under every finger, drawn from the bridge's predicted positions each frame. */
function TouchDots() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = (ts: number) => {
      const el = box.current;
      if (el) {
        const at = [...drawPositions(performance.timeOrigin + ts).values()];
        while (el.children.length < at.length) {
          const dot = document.createElement("div");
          dot.className = "absolute size-11 -translate-1/2 rounded-full border-2 border-white/80 bg-white/15";
          el.appendChild(dot);
        }
        [...el.children].forEach((dot, i) => {
          const p = at[i];
          (dot as HTMLElement).style.display = p ? "" : "none";
          if (p) (dot as HTMLElement).style.transform = `translate(${p.x}px, ${p.y}px)`;
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div ref={box} className="pointer-events-none fixed top-0 left-0" />;
}

/**
 * Experimental touch on the kiosk (`?kiosk=1&touch=<panel>`): reads the panel's touch stream from InfoPanel Studio, so
 * its touches reach the widgets as pointer events and clicks, runs touch.json's gesture actions, and says when touch
 * isn't working (no stream, no touchscreen, a page that doesn't fill the touch display). Nothing here takes clicks:
 * it is all `pointer-events: none`, so it never hides a widget from a touch.
 */
export function TouchLayer({ panel, onPage }: TouchLayerProps) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [debug, setDebug] = useState<boolean | null>(null);
  const [lastGesture, setLastGesture] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [waited, setWaited] = useState(false);
  const viewport = useViewport();
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const sendMs = useRef<number[]>([]);

  useEffect(() => {
    const off = onTouchMessage((m) => {
      if (isSetup(m)) {
        setSetup(m.setup);
        return;
      }
      if (isStatus(m)) {
        setStatus(m);
        return;
      }
      if (m.type !== "Gesture") return;
      const key = gestureKey(m.gesture);
      setLastGesture(key);
      const action = actionFor(setupRef.current?.actions ?? {}, m.gesture);
      switch (action?.action) {
        case "toggle_debug":
          setDebug((v) => !(v ?? setupRef.current?.debug ?? false));
          break;
        case "page":
          onPageRef.current(action.to);
          break;
        case "emit":
          window.dispatchEvent(new CustomEvent(`touch:${action.name}`, { detail: { gesture: key } }));
          break;
      }
    });
    const close = connectTouch(panel, (send) => {
      const samples = sendMs.current;
      samples.push(send);
      if (samples.length > 120) samples.shift();
    });
    const timer = window.setTimeout(() => setWaited(true), WAIT_NOTICE_MS);
    return () => {
      off();
      close();
      window.clearTimeout(timer);
    };
  }, [panel]);

  const showDebug = debug ?? setup?.debug ?? false;
  useEffect(() => {
    if (!showDebug) return;
    const timer = window.setInterval(() => {
      const s = sendMs.current;
      setLatency(s.length ? s.reduce((a, b) => a + b, 0) / s.length : null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [showDebug]);

  const name = setup?.name ?? panel;
  const notice =
    status === null && !waited
      ? null
      : (statusText(status, name) ??
        (setup && !fillsPanel(viewport, window.devicePixelRatio, setup)
          ? `Touch: this page is ${Math.round(viewport.width * window.devicePixelRatio)} × ${Math.round(viewport.height * window.devicePixelRatio)} px but ${name} is ${setup.width_px} × ${setup.height_px}. Show it full screen on the touch display.`
          : null));

  return (
    <>
      {setup?.touch_dots && <TouchDots />}
      {(notice || showDebug) && (
        <div className="pointer-events-none fixed bottom-2 left-2 z-[100] flex max-w-[calc(100%-1rem)] flex-col gap-1 text-xs">
          {notice && <div role="status" className="w-fit rounded-md bg-black/75 px-2.5 py-1.5 text-white">{notice}</div>}
          {showDebug && (
            <div className="w-fit rounded-md bg-black/75 px-2.5 py-1.5 font-mono text-white/90">
              {name} · {status?.status ?? "waiting"} · {lastGesture || "no gesture yet"}
              {latency !== null && ` · ${latency.toFixed(1)} ms from Studio`}
            </div>
          )}
        </div>
      )}
    </>
  );
}
