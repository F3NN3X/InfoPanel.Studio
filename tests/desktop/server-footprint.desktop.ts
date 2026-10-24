import { expect, test } from "@playwright/test";
import { appTree, processes } from "../../tools/perf/process-sampler.mjs";
import { writeResult } from "../perf/measure";
import { prepareApp } from "./app";

// Phase 3.6: what the dashboard server costs, Node sidecar against ips-server in process. The app starts in the tray
// (no studio window, so no WebView2), settles, and its tree's private memory is read idle and then with five SSE
// clients (three kiosks on the control stream, two config streams). Point DESKTOP_EXE at a release build: a debug
// build's memory says little.

const SETTLE_MS = Number(process.env.PERF_SETTLE_MS) || 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Private MB by role, median of three reads two seconds apart. */
async function memory(): Promise<Record<string, number>> {
  const reads: Record<string, number>[] = [];
  for (let i = 0; i < 3; i++) {
    const out: Record<string, number> = { app: 0, sidecar: 0, total: 0 };
    for (const p of appTree(processes())) {
      const mb = p.bytes / 1048576;
      out[p.role] = (out[p.role] ?? 0) + mb;
      out.total += mb;
    }
    reads.push(out);
    await sleep(2000);
  }
  const median = (k: string) => reads.map((r) => r[k] ?? 0).sort((a, b) => a - b)[1];
  return Object.fromEntries(Object.keys(reads[0]).map((k) => [k, Math.round(median(k) * 10) / 10]));
}

async function footprint(server: "node" | "native") {
  const app = await prepareApp({ server, openStudioOnLaunch: false });
  try {
    app.launch();
    await expect.poll(async () => (await fetch(`${app.base}/api/health`).catch(() => null))?.status, { timeout: 60_000 }).toBe(200);
    await sleep(SETTLE_MS);
    const idle = await memory();
    const streams = await Promise.all(
      ["/events/control?profile=perf-heavy", "/events/control?profile=perf-light", "/events/control?profile=perf-viz", "/events/config", "/events/config"].map((p) => fetch(`${app.base}${p}`))
    );
    await sleep(10_000);
    const clients = (await (await fetch(`${app.base}/api/server/stats`)).json()).clients;
    const sse5 = await memory();
    for (const s of streams) await s.body?.cancel();
    return { idle, sse5, clients };
  } finally {
    app.stop();
  }
}

test("server footprint: node sidecar vs ips-server in process", async () => {
  test.setTimeout(10 * 60_000);
  const node = await footprint("node");
  const native = await footprint("native");
  expect(native.sse5.sidecar).toBe(0);
  expect(node.clients).toBeGreaterThanOrEqual(5);
  expect(native.clients).toBeGreaterThanOrEqual(5);
  writeResult("server-footprint", { settleMs: SETTLE_MS, cases: { node, native } });
  console.log(`node: idle ${JSON.stringify(node.idle)} sse5 ${JSON.stringify(node.sse5)}\nnative: idle ${JSON.stringify(native.idle)} sse5 ${JSON.stringify(native.sse5)}`);
});
