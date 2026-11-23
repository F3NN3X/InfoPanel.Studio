// The pack-script worker: a dedicated module worker loaded from the app's own bundle (never `blob:`, which would take the page's
// policy), holding the overlay's OffscreenCanvas and one guest (guest.ts). Each frame message runs the guest once, checks its
// commands (commands.ts), draws them on a scratch canvas, samples that small for the flash limit (gate.ts `flashGuard`), and only
// then shows it, with the quiet cards' boxes erased. It answers every frame with the guest's time and whether the frame was over
// budget; a fault ends it with `end`. The page's host (host.ts) owns the clock and the watchdog and can terminate it at any time.
import { checkCommands, replay, type Ctx2D } from "./commands";
import { cellLuminance, flashGuard } from "./gate";
import { createGuest, loadQuickJS, type Guest } from "./guest";
import { HOST_MS, type Box, type Signals } from "./limits";

/** What the page sends. */
export type ToWorker =
  | { type: "start"; canvas: OffscreenCanvas; source: string; seed: number; level: Signals["level"]; palette: string[]; width: number; height: number; scale: number }
  | { type: "size"; width: number; height: number; scale: number }
  | { type: "frame"; t: number; signals?: Signals; quiet?: Box[] };

/** What the worker answers. */
export type FromWorker = { type: "ready" } | { type: "frame"; ms: number; over: boolean } | { type: "end"; reason: string };

/** The flash sample: the overlay drawn this small, one cell per pixel. */
const SAMPLE = { w: 16, h: 9 };

interface State {
  guest: Guest;
  view: OffscreenCanvas;
  out: OffscreenCanvasRenderingContext2D;
  scratch: OffscreenCanvas;
  draw: OffscreenCanvasRenderingContext2D;
  probe: OffscreenCanvasRenderingContext2D;
  palette: string[];
  scale: number;
  signals?: Signals;
  quiet: Box[];
  flash: ReturnType<typeof flashGuard>;
}

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null; close(): void };
let state: State | undefined;
const post = (m: FromWorker) => scope.postMessage(m);
const fail = (reason: string) => {
  state?.guest.dispose();
  state = undefined;
  post({ type: "end", reason });
};

function size(s: State, width: number, height: number, scale: number) {
  s.scale = scale;
  for (const c of [s.view, s.scratch]) {
    c.width = Math.max(1, Math.round(width * scale));
    c.height = Math.max(1, Math.round(height * scale));
  }
}

async function start(m: Extract<ToWorker, { type: "start" }>) {
  const quickjs = await loadQuickJS();
  const guest = createGuest(quickjs, m.source, { seed: m.seed, level: m.level });
  if ("fault" in guest) return fail(guest.fault);
  const scratch = new OffscreenCanvas(1, 1);
  const out = m.canvas.getContext("2d");
  const draw = scratch.getContext("2d", { willReadFrequently: true });
  const probe = new OffscreenCanvas(SAMPLE.w, SAMPLE.h).getContext("2d", { willReadFrequently: true });
  if (!out || !draw || !probe) return fail("canvas");
  state = { guest, view: m.canvas, out, scratch, draw, probe, palette: m.palette, scale: m.scale, quiet: [], flash: flashGuard() };
  size(state, m.width, m.height, m.scale);
  post({ type: "ready" });
}

function frame(s: State, m: Extract<ToWorker, { type: "frame" }>) {
  if (m.signals) s.signals = m.signals;
  if (m.quiet) s.quiet = m.quiet;
  const g = s.guest.frame(m.t, m.signals);
  if (g.fault) return fail(g.fault);
  const begin = performance.now();
  const cards = s.signals?.cards ?? [];
  const checked = g.interrupted ? undefined : checkCommands(g.commands, { palette: s.palette.length, cards });
  if (checked) {
    const { width, height } = s.scratch;
    s.draw.setTransform(1, 0, 0, 1, 0, 0);
    s.draw.clearRect(0, 0, width, height);
    replay(s.draw as unknown as Ctx2D, checked.commands, s.palette, cards, s.scale);
    s.probe.clearRect(0, 0, SAMPLE.w, SAMPLE.h);
    s.probe.drawImage(s.scratch, 0, 0, SAMPLE.w, SAMPLE.h);
    if (s.flash.allow(cellLuminance(s.probe.getImageData(0, 0, SAMPLE.w, SAMPLE.h).data), m.t)) {
      s.out.setTransform(1, 0, 0, 1, 0, 0);
      s.out.clearRect(0, 0, width, height);
      s.out.drawImage(s.scratch, 0, 0);
      for (const q of s.quiet) s.out.clearRect(q.x * s.scale, q.y * s.scale, q.w * s.scale, q.h * s.scale);
    }
  }
  const host = performance.now() - begin;
  post({ type: "frame", ms: g.ms, over: g.interrupted || g.capped || !!checked?.capped || host > HOST_MS });
}

scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "start") void start(m).catch(() => fail("load"));
    else if (m.type === "size" && state) size(state, m.width, m.height, m.scale);
    else if (m.type === "frame" && state) frame(state, m);
  } catch {
    fail("error");
  }
};
