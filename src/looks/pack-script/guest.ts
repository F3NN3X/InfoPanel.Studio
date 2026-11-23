// The guest: a pack script in its own QuickJS runtime (quickjs-emscripten, release build, a separate .wasm). The worker (fx-worker.ts)
// runs it; the tests run it in Node. The runtime holds the script to `HEAP_BYTES`, `STACK_BYTES` and an interrupt deadline (its top
// level gets `LOAD_MS`, each frame `GUEST_MS`). Its globals are the language's own (no Date, Promise or Proxy, and no Math.random)
// and one more, a frozen `fx`: `onFrame`, `draw`, `signals`, `rand` and `now`. No host function is installed: a frame is one call
// into the guest with the time and, when they changed, the signals as JSON, and one string back, the frame's commands as JSON. The
// host checks those (commands.ts); nothing the guest returns is trusted.
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { COMMANDS_MAX, GUEST_MS, HEAP_BYTES, LOAD_MS, STACK_BYTES, type Signals } from "./limits";

/** Why a guest can go on no longer: it ran past its time at load, ran out of heap or stack, threw, or broke the frame protocol. */
export type GuestFault = "load-time" | "memory" | "error";

/** One frame: the commands as the guest gave them (unchecked), the guest's time, and whether the interrupt ended it (it then draws nothing). */
export interface GuestFrame {
  commands: unknown;
  ms: number;
  interrupted: boolean;
  /** More than `COMMANDS_MAX` were drawn: the rest were never kept. */
  capped: boolean;
  fault?: GuestFault;
}

export interface Guest {
  frame(t: number, signals?: Signals): GuestFrame;
  /** The bytes the runtime holds now (its own count, for the pack checker's report; the cap is `HEAP_BYTES`). */
  heap(): number;
  dispose(): void;
}

/** The guest's side of the API, run before the script. It captures what it uses, so a script that replaces `JSON` or `Array.isArray` changes only what it hands back, which the host checks anyway. */
const PRELUDE = `(function (seed, level, max) {
  "use strict";
  var parse = JSON.parse, stringify = JSON.stringify, isArray = Array.isArray, freeze = Object.freeze;
  var cb = null, queue = [], capped = false, now = 0, s = seed >>> 0;
  var signals = freeze({ level: level, width: 0, height: 0, cards: freeze([]) });
  function deep(v) { if (v && typeof v === "object") { for (var k in v) deep(v[k]); freeze(v); } return v; }
  var fx = freeze({
    onFrame: function (f) { if (typeof f !== "function") throw new TypeError("fx.onFrame takes a function"); cb = f; },
    draw: function (list) {
      if (!isArray(list)) throw new TypeError("fx.draw takes an array of commands");
      for (var i = 0; i < list.length; i++) { if (queue.length >= max) { capped = true; break; } queue.push(list[i]); }
    },
    signals: function () { return signals; },
    rand: function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    now: function () { return now; }
  });
  delete Math.random;
  Object.defineProperty(globalThis, "fx", { value: fx, enumerable: true, writable: false, configurable: false });
  return function (t, next) {
    now = t; queue = []; capped = false;
    if (next !== undefined) signals = deep(parse(next));
    if (cb) cb(t);
    return stringify({ c: queue, capped: capped });
  };
})`;

/** The language parts the guest gets: no Date (`fx.now` is its clock), no Promise (no job ever runs between frames), no Proxy. `Eval` is the runtime's own way to run the script. */
const INTRINSICS = { BaseObjects: true, Eval: true, JSON: true, MapSet: true, RegExp: true, StringNormalize: true, TypedArrays: true } as const;

/** The longest frame answer the host reads, characters (2,000 commands of a few dozen characters, and the points). */
const ANSWER_MAX = 1_000_000;

let module: Promise<QuickJSWASMModule> | undefined;
/** The QuickJS module, loaded once per worker: the variant's .wasm is fetched from the app's own assets. */
export function loadQuickJS(): Promise<QuickJSWASMModule> {
  module ??= import("@jitl/quickjs-wasmfile-release-sync").then((v) => newQuickJSWASMModuleFromVariant(v.default));
  return module;
}

const faultOf = (ctx: QuickJSContext, error: QuickJSHandle): { interrupted: boolean; fault?: GuestFault } => {
  let message = "";
  try {
    message = String(ctx.getProp(error, "message").consume((m) => ctx.dump(m)));
  } catch {
    message = "";
  }
  error.dispose();
  if (message === "interrupted") return { interrupted: true };
  if (/out of memory|stack overflow/.test(message)) return { interrupted: false, fault: "memory" };
  return { interrupted: false, fault: "error" };
};

/** A guest running `source`: its top level has run, or the fault that stopped it. `clock` is the host's (performance.now). */
export function createGuest(quickjs: QuickJSWASMModule, source: string, opts: { seed: number; level: Signals["level"]; clock?: () => number }): Guest | { fault: GuestFault } {
  const clock = opts.clock ?? (() => performance.now());
  const runtime: QuickJSRuntime = quickjs.newRuntime();
  let deadline = Infinity;
  runtime.setMemoryLimit(HEAP_BYTES);
  runtime.setMaxStackSize(STACK_BYTES);
  runtime.setInterruptHandler(() => clock() > deadline);
  const ctx = runtime.newContext({ intrinsics: INTRINSICS });
  let step: QuickJSHandle | undefined;
  const end = () => {
    step?.dispose();
    ctx.dispose();
    runtime.dispose();
  };
  const prelude = ctx.evalCode(PRELUDE, "prelude.js");
  if (prelude.error) {
    prelude.error.dispose();
    end();
    return { fault: "error" };
  }
  const args = [ctx.newNumber(opts.seed >>> 0), ctx.newString(opts.level), ctx.newNumber(COMMANDS_MAX)];
  const made = ctx.callFunction(prelude.value, ctx.undefined, ...args);
  for (const a of args) a.dispose();
  prelude.value.dispose();
  if (made.error) {
    made.error.dispose();
    end();
    return { fault: "error" };
  }
  step = made.value;
  deadline = clock() + LOAD_MS;
  const ran = ctx.evalCode(source, "fx.js");
  deadline = Infinity;
  if (ran.error) {
    const f = faultOf(ctx, ran.error);
    end();
    return { fault: f.interrupted ? "load-time" : (f.fault ?? "error") };
  }
  ran.value.dispose();

  let gone = false;
  return {
    frame(t, signals) {
      if (gone || !step) return { commands: [], ms: 0, interrupted: false, capped: false, fault: "error" };
      const start = clock();
      deadline = start + GUEST_MS;
      const tH = ctx.newNumber(t);
      const sH = signals ? ctx.newString(JSON.stringify(signals)) : ctx.undefined;
      const res = ctx.callFunction(step, ctx.undefined, tH, sH);
      deadline = Infinity;
      tH.dispose();
      if (signals) sH.dispose();
      const ms = clock() - start;
      if (res.error) {
        const f = faultOf(ctx, res.error);
        return { commands: [], ms, interrupted: f.interrupted, capped: false, ...(f.fault ? { fault: f.fault } : null) };
      }
      const answer = res.value.consume((v) => (ctx.typeof(v) === "string" ? ctx.getString(v) : ""));
      try {
        if (answer.length > ANSWER_MAX) return { commands: [], ms, interrupted: false, capped: true };
        const out = JSON.parse(answer) as { c?: unknown; capped?: unknown };
        return { commands: out.c, ms, interrupted: false, capped: out.capped === true };
      } catch {
        return { commands: [], ms, interrupted: false, capped: false, fault: "error" };
      }
    },
    heap() {
      if (gone) return 0;
      const handle = runtime.computeMemoryUsage();
      const usage = ctx.dump(handle) as { memory_used_size?: number };
      handle.dispose();
      return usage.memory_used_size ?? 0;
    },
    dispose() {
      if (gone) return;
      gone = true;
      end();
    },
  };
}
