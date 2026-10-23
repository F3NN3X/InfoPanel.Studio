// DASHBOARD_DEBUG=1 support for server.mjs: request and SSE logging, and the numbers behind
// GET /api/debug/stats. Logging and the event-loop histogram are off when `enabled` is false; the
// SSE clients are counted either way, for GET /api/server/stats.

import { monitorEventLoopDelay } from "node:perf_hooks";

/** Active handles and requests by type, e.g. { Timeout: 12, TCPSocketWrap: 3 }. */
export function countResources(list) {
  const counts = {};
  for (const type of list) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

const ms = (ns) => Math.round((ns / 1e6) * 100) / 100;

export function createDebug({ enabled, log = console.log, now = () => performance.now() }) {
  const clients = new Map();
  const histogram = enabled ? monitorEventLoopDelay({ resolution: 10 }) : null;
  histogram?.enable();

  return {
    enabled,

    /** Starts timing a request; call the result with the final status when it ends. */
    request(req) {
      if (!enabled) return () => {};
      const start = now();
      return (status) => log(`[debug] ${req.method} ${req.url} ${status} ${Math.round(now() - start)}ms`);
    },

    /** An SSE client connected on `channel`; the result is called when it goes away. */
    sseOpen(channel) {
      clients.set(channel, (clients.get(channel) ?? 0) + 1);
      if (enabled) log(`[debug] sse connect ${channel} (${clients.get(channel)} now)`);
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        clients.set(channel, clients.get(channel) - 1);
        if (enabled) log(`[debug] sse disconnect ${channel} (${clients.get(channel)} now)`);
      };
    },

    /** Open SSE connections across all channels. */
    sseClientsTotal() {
      let total = 0;
      for (const n of clients.values()) total += n;
      return total;
    },

    /**
     * The numbers the desktop app shows, in and out of debug mode. `studios`: studio pages on this machine (their
     * control stream, counted on the "studio" channel), which a browser-opened studio's "already open" asks about.
     */
    serverStats() {
      return { uptimeSeconds: Math.round(process.uptime()), clients: this.sseClientsTotal(), studios: clients.get("studio") ?? 0 };
    },

    stats() {
      return {
        memory: process.memoryUsage(),
        uptimeSeconds: Math.round(process.uptime()),
        sseClients: Object.fromEntries(clients),
        resources: countResources(process.getActiveResourcesInfo?.() ?? []),
        eventLoopDelayMs: histogram ? { p50: ms(histogram.percentile(50)), p99: ms(histogram.percentile(99)), max: ms(histogram.max) } : null,
      };
    },
  };
}
