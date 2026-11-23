import { beforeAll, describe, expect, it } from "vitest";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { createGuest, type Guest, loadQuickJS } from "@/looks/pack-script/guest";
import { COMMANDS_MAX, GUEST_MS, type Signals } from "@/looks/pack-script/limits";

// The guest is the sandbox's boundary: these run the real QuickJS runtime (the release wasm) under Node, as the worker does.

let quickjs: QuickJSWASMModule;
beforeAll(async () => {
  quickjs = await loadQuickJS();
});

const guest = (source: string, seed = 1): Guest => {
  const g = createGuest(quickjs, source, { seed, level: "full" });
  if ("fault" in g) throw new Error(`guest refused: ${g.fault}`);
  return g;
};
const SIGNALS: Signals = { level: "full", width: 800, height: 480, cards: [{ x: 10, y: 20, w: 100, h: 50, value: 0.42, state: "warn", texts: [{ x: 12, y: 22, w: 40, h: 10, n: 5 }] }] };

describe("the guest's globals", () => {
  it("are the language's own and fx: no web API, no host, no clock or random outside fx", () => {
    const g = guest(`
      var names = ["fetch", "WebSocket", "importScripts", "indexedDB", "BroadcastChannel", "__TAURI__", "location", "self", "postMessage", "XMLHttpRequest", "setTimeout", "Date", "Promise", "Proxy", "console"];
      var found = names.filter(function (n) { return typeof globalThis[n] !== "undefined"; });
      fx.onFrame(function () { fx.draw([{ op: "rect", x: found.length, y: typeof Math.random === "undefined" ? 1 : 0, w: 1, h: 1, fill: 0 }]); });
    `);
    const f = g.frame(0);
    expect(f.fault).toBeUndefined();
    expect(f.commands).toEqual([{ op: "rect", x: 0, y: 1, w: 1, h: 1, fill: 0 }]);
    g.dispose();
  });

  it("keeps fx frozen: a script cannot replace it or its functions", () => {
    const g = guest(`
      var before = fx.draw;
      try { fx.draw = null; } catch (e) {}
      try { globalThis.fx = {}; } catch (e) {}
      fx.onFrame(function () { fx.draw([{ op: "rect", x: fx.draw === before ? 1 : 0, y: 0, w: 1, h: 1, fill: 0 }]); });
    `);
    expect(g.frame(0).commands).toEqual([{ op: "rect", x: 1, y: 0, w: 1, h: 1, fill: 0 }]);
    g.dispose();
  });
});

describe("a frame", () => {
  it("hands the time, the signals and a seeded rand to the script, and its commands back", () => {
    const src = `fx.onFrame(function (t) { var s = fx.signals(); fx.draw([{ op: "rect", x: fx.now(), y: s.cards.length ? s.cards[0].value : -1, w: fx.rand(), h: 1, fill: 0 }]); });`;
    const a = guest(src, 7);
    const b = guest(src, 7);
    const one = a.frame(16, SIGNALS).commands as { x: number; y: number; w: number }[];
    expect(one[0].x).toBe(16);
    expect(one[0].y).toBe(0.42);
    // the same seed draws the same; signals sent once stay until the next
    expect((b.frame(16, SIGNALS).commands as { w: number }[])[0].w).toBe(one[0].w);
    expect((a.frame(32).commands as { y: number }[])[0].y).toBe(0.42);
    a.dispose();
    b.dispose();
  });

  it("keeps at most COMMANDS_MAX commands and says it was capped", () => {
    const g = guest(`fx.onFrame(function () { var l = []; for (var i = 0; i < ${COMMANDS_MAX + 5}; i++) l.push({ op: "reset" }); fx.draw(l); });`);
    const f = g.frame(0);
    expect((f.commands as unknown[]).length).toBe(COMMANDS_MAX);
    expect(f.capped).toBe(true);
    g.dispose();
  });

  it("is interrupted at GUEST_MS and draws nothing; the guest still answers the next frame", () => {
    const g = guest(`var n = 0; fx.onFrame(function () { n++; if (n === 1) for (;;) {} fx.draw([{ op: "reset" }]); });`);
    const f = g.frame(0);
    expect(f.interrupted).toBe(true);
    expect(f.commands).toEqual([]);
    expect(f.ms).toBeLessThan(GUEST_MS + 50);
    expect(g.frame(1).commands).toEqual([{ op: "reset" }]);
    g.dispose();
  });

  it("faults on a memory bomb, a stack overflow or an error", () => {
    for (const body of ["var a = []; for (;;) a.push(new Array(1e5).fill(1));", "function f() { return f() + 1; } f();", "null.x;"]) {
      const g = guest(`fx.onFrame(function () { ${body} });`);
      const f = g.frame(0);
      expect(f.fault, body).toBe(body === "null.x;" ? "error" : "memory");
      g.dispose();
    }
  });
});

describe("loading a script", () => {
  it("stops one whose top level runs past its time, or throws", () => {
    expect(createGuest(quickjs, "for (;;) {}", { seed: 1, level: "full" })).toEqual({ fault: "load-time" });
    expect(createGuest(quickjs, "throw new Error('x')", { seed: 1, level: "full" })).toEqual({ fault: "error" });
    expect(createGuest(quickjs, "fetch('http://127.0.0.1:1/')", { seed: 1, level: "full" })).toEqual({ fault: "error" });
  });

  it("tells the script its level", () => {
    const g = createGuest(quickjs, `fx.onFrame(function () { fx.draw([{ op: "rect", x: fx.signals().level === "calm" ? 1 : 0, y: 0, w: 1, h: 1, fill: 0 }]); });`, { seed: 1, level: "calm" });
    if ("fault" in g) throw new Error(g.fault);
    expect((g.frame(0).commands as { x: number }[])[0].x).toBe(1);
    g.dispose();
  });
});
