// The page's end of a pack script: it hands the overlay canvas to a new worker (fx-worker.ts), drives the guest's frames from the
// page's animation frames at the plan's rate (no guest timer exists), sends the signals at most `SIGNAL_MS` apart and only when they
// changed, and keeps the watchdog: `WATCHDOG.over` frames over budget in its window end the script as `fallback`; a fault, a frame
// not answered in `REPLY_MS` or a start not done in `START_MS` end it as `stopped`. Ending always terminates the worker.
import type { FromWorker, ToWorker } from "./fx-worker";
import { watchdog, type ScriptPlan } from "./gate";
import { REPLY_MS, SIGNAL_MS, START_MS, type ScriptEnd } from "./limits";
import { readSignals } from "./signals";

export interface ScriptRun {
  /** The overlay: a canvas that has not been handed to a worker yet. */
  canvas: HTMLCanvasElement;
  /** Where the cards are (the page under the overlay). */
  root: ParentNode;
  source: string;
  seed: number;
  plan: ScriptPlan;
  palette: string[];
  onEnd: (end: ScriptEnd, reason: string) => void;
}

/** A small stable number from a pack id, for `fx.rand`'s seed: the same pack draws the same on each run. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The overlay's box on the page and the page's scale (the studio zooms its canvas; the kiosk is 1). */
const placeOf = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect();
  return { rect, scale: canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1 };
};

/** Starts the script; the returned function stops it (and is safe to call twice). */
export function startScript(run: ScriptRun): () => void {
  const worker = new Worker(new URL("./fx-worker.ts", import.meta.url), { type: "module", name: "pack-fx" });
  const dog = watchdog();
  let raf = 0;
  let reply: ReturnType<typeof setTimeout> | undefined;
  let busy = true;
  let last = -Infinity;
  let lastSignals = -Infinity;
  let sent = "";
  let done = false;
  const pixels = () => Math.min(1, globalThis.devicePixelRatio || 1);

  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(reply);
    resize.disconnect();
    worker.terminate();
  };
  const end = (how: ScriptEnd, reason: string) => {
    if (done) return;
    stop();
    run.onEnd(how, reason);
  };
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  const resize = new ResizeObserver(() => send({ type: "size", width: run.canvas.offsetWidth, height: run.canvas.offsetHeight, scale: pixels() }));

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (busy || now - last < 1000 / run.plan.fps - 1) return;
    last = now;
    let signals: ReturnType<typeof readSignals> | undefined;
    if (now - lastSignals >= SIGNAL_MS) {
      lastSignals = now;
      const read = readSignals(run.root, placeOf(run.canvas), run.plan.level);
      const json = JSON.stringify(read);
      if (json !== sent) {
        sent = json;
        signals = read;
      }
    }
    busy = true;
    send({ type: "frame", t: now, ...(signals ? { signals: signals.signals, quiet: signals.quiet } : null) });
    reply = setTimeout(() => end("stopped", "no answer"), REPLY_MS);
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    clearTimeout(reply);
    if (m.type === "end") return end("stopped", m.reason);
    busy = false;
    if (m.type === "ready") {
      resize.observe(run.canvas);
      raf = requestAnimationFrame(tick);
    } else if (m.type === "frame" && m.over && dog.over(performance.now())) end("fallback", "over budget");
  };
  worker.onerror = () => end("stopped", "worker");

  const canvas = run.canvas.transferControlToOffscreen();
  send({ type: "start", canvas, source: run.source, seed: run.seed, level: run.plan.level, palette: run.palette, width: run.canvas.offsetWidth, height: run.canvas.offsetHeight, scale: pixels() }, [canvas]);
  reply = setTimeout(() => end("stopped", "no start"), START_MS);
  return stop;
}
