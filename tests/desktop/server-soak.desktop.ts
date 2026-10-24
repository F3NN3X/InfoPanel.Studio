import { expect, test } from "@playwright/test";
import { appTree, processes } from "../../tools/perf/process-sampler.mjs";
import { writeResult } from "../perf/measure";
import { prepareApp, SERVER_MODE } from "./app";

// Phase 3.6's long run: the app in the tray (no WebView2) with five SSE clients, sampled every minute for
// PERF_SOAK_MS (30 minutes by default): CPU and private MB of the app, the sidecar (none with the native server) and
// the total. Use a release build (DESKTOP_EXE) and DESKTOP_SERVER to pick the server. Measures, never gates.

const DURATION_MS = Number(process.env.PERF_SOAK_MS) || 30 * 60_000;
const EVERY_MS = Number(process.env.PERF_SOAK_EVERY_MS) || 60_000;

function byRole(): Record<string, { cpu: number; mb: number }> {
  const out: Record<string, { cpu: number; mb: number }> = { app: { cpu: 0, mb: 0 }, sidecar: { cpu: 0, mb: 0 } };
  for (const p of appTree(processes())) {
    const r = (out[p.role] ??= { cpu: 0, mb: 0 });
    r.cpu += p.cpu100ns / 1e7;
    r.mb += p.bytes / 1048576;
  }
  return out;
}

test("server soak", async () => {
  test.setTimeout(DURATION_MS + 5 * 60_000);
  const app = await prepareApp({ openStudioOnLaunch: false });
  try {
    app.launch();
    await expect.poll(async () => (await fetch(`${app.base}/api/health`).catch(() => null))?.status, { timeout: 60_000 }).toBe(200);
    const streams = await Promise.all(
      ["/events/control?profile=perf-heavy", "/events/control?profile=perf-light", "/events/control?profile=perf-viz", "/events/config", "/events/config"].map((p) => fetch(`${app.base}${p}`))
    );
    const samples: Record<string, number>[] = [];
    let prev = byRole();
    let prevAt = Date.now();
    for (let at = EVERY_MS; at <= DURATION_MS; at += EVERY_MS) {
      await new Promise((r) => setTimeout(r, EVERY_MS));
      const now = byRole();
      const s = (Date.now() - prevAt) / 1000;
      const cores = (role: string) => ((now[role]?.cpu ?? 0) - (prev[role]?.cpu ?? 0)) / s;
      samples.push({
        minute: at / 60_000,
        appMb: now.app.mb,
        sidecarMb: now.sidecar.mb,
        totalMb: now.app.mb + now.sidecar.mb,
        appCores: cores("app"),
        sidecarCores: cores("sidecar"),
      });
      prev = now;
      prevAt = Date.now();
    }
    for (const s of streams) await s.body?.cancel();
    const last = samples[samples.length - 1];
    const first = samples[0];
    writeResult(`server-soak-${SERVER_MODE}`, { durationMs: DURATION_MS, samples });
    console.log(`${SERVER_MODE}: total ${first.totalMb.toFixed(1)} -> ${last.totalMb.toFixed(1)} MB over ${samples.length} min; app ${last.appMb.toFixed(1)} sidecar ${last.sidecarMb.toFixed(1)}; mean cores ${(samples.reduce((n, x) => n + x.appCores + x.sidecarCores, 0) / samples.length).toFixed(4)}`);
  } finally {
    app.stop();
  }
});
