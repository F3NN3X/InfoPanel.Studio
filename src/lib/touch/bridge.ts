// Experimental touch on the kiosk: reads a touch panel's stream (GET /events/touch?panel=<id>, fed by Studio's touch
// engine) and turns its messages into DOM events. Ported from touch-kit's web bridge (packages/touch-kit-web/src/
// bridge.ts at v1.2.1), with an EventSource in place of the Tauri Channel: the kiosk runs in InfoPanel's web page
// profile or a browser, not in a Studio window.
//
// Each contact becomes a synthetic PointerEvent stream (pointerType "touch", pointerId TOUCH_POINTER_BASE + contact
// id), so widgets are written once against Pointer Events. Panel px → CSS px (÷ devicePixelRatio; the page covers the
// touch display exactly). On down, `elementFromPoint` picks the target and keeps it for that contact: implicit
// capture, because `setPointerCapture` only accepts real pointers (call it in a try/catch). A lift within the slop
// also dispatches `click`, as a browser would. None of this is OS input: nothing leaves the page.
//
// Studio forwards every move (125 Hz); moves are held per contact and dispatched once per animation frame, latest
// wins. Any other message flushes held moves first, keeping order. Every sample also feeds a per-contact Predictor;
// touch dots draw from `drawPositions`. Gestures arrive as bubbling `tp-gesture` CustomEvents on the element under
// the gesture.

import { defaultOptions, Predictor, type PredictorOptions } from "./predictor";
import { isSetup, isStatus, type Gesture, type PointerMsg, type TouchMsg } from "./types";

export const TOUCH_POINTER_BASE = 1000;

export interface GestureDetail {
  gesture: Gesture;
  x: number;
  y: number;
}

declare global {
  interface HTMLElementEventMap {
    "tp-gesture": CustomEvent<GestureDetail>;
  }
}

type Listener = (m: TouchMsg) => void;

interface Contact {
  target: Element | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/** Per applied move: Studio send → page arrival, and arrival → the frame that applied it (ms). */
export type LatencyListener = (sendMs: number, frameMs: number) => void;

const listeners = new Set<Listener>();
const contacts = new Map<number, Contact>();
const heldMoves = new Map<number, { m: PointerMsg; send: number; arrived: number }>();
const predictors = new Map<number, Predictor>();
let predictorOptions: PredictorOptions = defaultOptions;
let slopPx = 12;
let primaryId: number | null = null;
let frameRequested = false;
let onLatency: LatencyListener | undefined;

const wallNow = (): number => performance.timeOrigin + performance.now();

export const toCss = (x: number, y: number): { x: number; y: number } => ({
  x: x / window.devicePixelRatio,
  y: y / window.devicePixelRatio,
});

/** Where to draw each live contact in the frame starting at `frameT` (wall ms), in CSS px. */
export function drawPositions(frameT: number): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  for (const [id, p] of predictors) {
    const at = p.at(frameT);
    if (at) out.set(id, at);
  }
  return out;
}

function track(m: PointerMsg, t: number) {
  if (m.kind === "Up") {
    predictors.delete(m.id);
    return;
  }
  let p = predictors.get(m.id);
  if (!p || m.kind === "Down") {
    p = new Predictor(predictorOptions);
    predictors.set(m.id, p);
  }
  p.add({ t, ...toCss(m.x, m.y) });
}

function firePointer(target: Element | null, type: string, id: number, x: number, y: number) {
  const down = type !== "pointerup" && type !== "pointercancel";
  target?.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: TOUCH_POINTER_BASE + id,
      pointerType: "touch",
      isPrimary: id === primaryId,
      clientX: x,
      clientY: y,
      button: type === "pointermove" ? -1 : 0,
      buttons: down ? 1 : 0,
      pressure: down ? 0.5 : 0,
      width: 20,
      height: 20,
    })
  );
}

function applyPointer(m: PointerMsg) {
  const { x, y } = toCss(m.x, m.y);
  if (m.kind === "Down") {
    if (contacts.size === 0) primaryId = m.id;
    const target = document.elementFromPoint(x, y);
    contacts.set(m.id, { target, startX: x, startY: y, x, y, moved: false });
    firePointer(target, "pointerdown", m.id, x, y);
    return;
  }
  const c = contacts.get(m.id);
  if (!c) return;
  c.x = x;
  c.y = y;
  if (!c.moved && Math.hypot(x - c.startX, y - c.startY) > slopPx) c.moved = true;
  if (m.kind === "Move") {
    firePointer(c.target, "pointermove", m.id, x, y);
    return;
  }
  firePointer(c.target, "pointerup", m.id, x, y);
  if (!c.moved) {
    c.target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
  }
  contacts.delete(m.id);
  if (primaryId === m.id) primaryId = null;
}

/** Ends every live contact with pointercancel (device or connection lost). */
function cancelAll() {
  for (const [id, c] of contacts) firePointer(c.target, "pointercancel", id, c.x, c.y);
  contacts.clear();
  predictors.clear();
  heldMoves.clear();
  primaryId = null;
}

function apply(m: TouchMsg) {
  if (isSetup(m)) {
    predictorOptions = { ...defaultOptions, leadMs: m.setup.prediction_ms };
    slopPx = m.setup.slop_px / window.devicePixelRatio;
  } else if (isStatus(m)) {
    if (m.status !== "Connected") cancelAll();
  } else if (m.type === "Pointer") {
    applyPointer(m);
  } else if (m.type === "Gesture") {
    const { x, y } = toCss(m.x, m.y);
    document
      .elementFromPoint(x, y)
      ?.dispatchEvent(new CustomEvent<GestureDetail>("tp-gesture", { detail: { gesture: m.gesture, x, y }, bubbles: true }));
  }
  for (const l of listeners) l(m);
}

function applyHeldMoves(frameWall?: number) {
  for (const { m, send, arrived } of heldMoves.values()) {
    if (frameWall !== undefined) onLatency?.(send, frameWall - arrived);
    apply(m);
  }
  heldMoves.clear();
}

/** One message from the stream, as its JSON text. Exported for tests. */
export function receive(data: string): void {
  let msg: TouchMsg & { sent_ms?: number };
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  // Device messages carry the wall-clock time Studio sent them.
  const sent = msg.sent_ms ?? wallNow();
  if (!isSetup(msg) && !isStatus(msg) && msg.type === "Pointer") {
    track(msg, sent);
    if (msg.kind === "Move") {
      const arrived = wallNow();
      heldMoves.set(msg.id, { m: msg, send: arrived - sent, arrived });
      if (!frameRequested) {
        frameRequested = true;
        requestAnimationFrame((ts) => {
          frameRequested = false;
          applyHeldMoves(performance.timeOrigin + ts);
        });
      }
      return;
    }
  }
  applyHeldMoves();
  apply(msg);
}

/** Every message (setup, status, pointer, gesture) after the bridge has applied it. */
export function onTouchMessage(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Reads `panel`'s touch stream from this page's server until the returned function is called. The EventSource
 * reconnects by itself; while it is down, live contacts are cancelled and listeners hear `Offline`.
 */
export function connectTouch(panel: string, latency?: LatencyListener): () => void {
  onLatency = latency;
  const source = new EventSource(`/events/touch?panel=${encodeURIComponent(panel)}`);
  source.onmessage = (e: MessageEvent<string>) => receive(e.data);
  source.onerror = () => {
    applyHeldMoves();
    apply({ status: "Offline" });
  };
  return () => {
    source.close();
    cancelAll();
    onLatency = undefined;
  };
}
