/**
 * The first-run checks' probes on this machine: InfoPanel through the desktop app's commands (none in a browser), the
 * Data API over HTTP with check 5's 5 s timeout, and Studio's own server from the shell's status (in a browser, the
 * page's own origin: it was served from there).
 */
import { isTauri, serverStatus } from "@/lib/desktop";
import { infopanelLocal, localAddresses, portOwner } from "./commands";
import type { SensorMap } from "@/modules/types";
import type { LocalInfo, Probes, ServerInfo, SourcesAnswer } from "./checks";
import { REACH_TIMEOUT_MS } from "./checks";

/** Waits `ms`; rejects when the signal aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

const withTimeout = (signal: AbortSignal, ms: number) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);

const kioskOn = (origin: string) => `${origin}/?kiosk=1`;
const loopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/** How long the server check waits for a starting server. */
const SERVER_WAIT_MS = 10_000;

async function server(signal: AbortSignal): Promise<ServerInfo> {
  if (!isTauri()) {
    const port = Number(window.location.port) || 80;
    const network = loopback(window.location.hostname) ? null : kioskOn(window.location.origin);
    return { state: "running", port, local: kioskOn(`http://127.0.0.1:${port}`), network };
  }
  const end = Date.now() + SERVER_WAIT_MS;
  let status = await serverStatus();
  while (status && (status.state === "starting" || status.state === "restarting") && Date.now() < end) {
    await sleep(500, signal);
    status = await serverStatus();
  }
  if (!status) return { state: "starting", port: 0, local: "", network: null };
  const port = status.port;
  const local = kioskOn(`http://127.0.0.1:${port}`);
  if (status.state === "running") {
    const lan = status.runningConfig?.listen === "lan";
    const address = lan ? (await localAddresses())?.[0] : undefined;
    return { state: "running", port, local, network: address ? kioskOn(`http://${address}:${port}`) : null };
  }
  if (status.state === "port_in_use" || status.state === "foreign_dashboard") {
    const owner = status.state === "foreign_dashboard" ? "another InfoPanel Studio" : ((await portOwner(port).catch(() => null))?.name ?? null);
    return { state: "port_in_use", port, local, network: null, owner };
  }
  return { state: status.state === "starting" || status.state === "restarting" ? "starting" : status.state === "failed" ? "failed" : "stopped", port, local, network: null };
}

export const realProbes: Probes = {
  local: async () => (isTauri() ? ((await infopanelLocal<LocalInfo>()) ?? null) : null),
  sources: async (base, signal) => {
    const start = performance.now();
    try {
      const res = await fetch(`${base}/api/sources`, { cache: "no-store", signal: withTimeout(signal, REACH_TIMEOUT_MS) });
      if (!res.ok) return { ok: false, timedOut: false };
      const sources = (await res.json()) as Partial<SourcesAnswer>;
      return { ok: true, ms: Math.round(performance.now() - start), sources: { ...sources, plugins: sources.plugins ?? [] } };
    } catch (err) {
      if (signal.aborted) throw err;
      return { ok: false, timedOut: err instanceof DOMException && err.name === "TimeoutError" };
    }
  },
  sensors: async (base, signal) => {
    try {
      const res = await fetch(`${base}/api/sensors`, { cache: "no-store", signal: withTimeout(signal, REACH_TIMEOUT_MS) });
      return res.ok ? (((await res.json()) as { sensors?: SensorMap }).sensors ?? null) : null;
    } catch (err) {
      if (signal.aborted) throw err;
      return null;
    }
  },
  portOwner: async (port) => (await portOwner(port).catch(() => null))?.name ?? null,
  server,
  sleep,
};
