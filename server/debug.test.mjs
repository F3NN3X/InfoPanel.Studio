import { describe, expect, it } from "vitest";
import { countResources, createDebug } from "./debug.mjs";

describe("debug", () => {
  it("logs requests with status and duration, and counts SSE clients per channel", () => {
    const lines = [];
    let t = 0;
    const debug = createDebug({ enabled: true, log: (m) => lines.push(m), now: () => (t += 25) });
    debug.request({ method: "GET", url: "/api/health" })(200);
    const a = debug.sseOpen("config");
    const b = debug.sseOpen("config");
    debug.sseOpen("control");
    a();
    a();
    b();
    expect(lines).toEqual([
      "[debug] GET /api/health 200 25ms",
      "[debug] sse connect config (1 now)",
      "[debug] sse connect config (2 now)",
      "[debug] sse connect control (1 now)",
      "[debug] sse disconnect config (1 now)",
      "[debug] sse disconnect config (0 now)",
    ]);
    const stats = debug.stats();
    expect(stats.sseClients).toEqual({ config: 0, control: 1 });
    expect(stats.memory.rss).toBeGreaterThan(0);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(stats.eventLoopDelayMs).sort()).toEqual(["max", "p50", "p99"]);
    expect(typeof stats.resources).toBe("object");
  });

  it("does nothing when disabled", () => {
    const lines = [];
    const debug = createDebug({ enabled: false, log: (m) => lines.push(m) });
    debug.request({ method: "GET", url: "/" })(200);
    debug.sseOpen("config")();
    expect(lines).toEqual([]);
    expect(debug.stats().eventLoopDelayMs).toBeNull();
  });

  it("counts SSE clients across channels even when disabled", () => {
    const debug = createDebug({ enabled: false, log: () => {} });
    const a = debug.sseOpen("config");
    debug.sseOpen("control");
    debug.sseOpen("extras");
    expect(debug.sseClientsTotal()).toBe(3);
    a();
    a();
    expect(debug.sseClientsTotal()).toBe(2);
    const stats = debug.serverStats();
    expect(stats.clients).toBe(2);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("counts resources by type", () => {
    expect(countResources(["Timeout", "Timeout", "TCPSocketWrap"])).toEqual({ Timeout: 2, TCPSocketWrap: 1 });
  });
});
