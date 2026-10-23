import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, CDPSession, Page } from "@playwright/test";

// Shared method of the perf specs (docs/performance.md, "The harness"). Each page measurement:
// a fresh context, page load under a short trace (JS bytes, parse/compile time, first zone), a 5 s warm-up, then a
// 10 s window of CDP Performance.getMetrics deltas, rAF callbacks per second and running animations.

export const WARMUP_MS = Number(process.env.PERF_WARMUP_MS) || 5000;
export const WINDOW_MS = Number(process.env.PERF_WINDOW_MS) || 10_000;
export const REPEATS = Number(process.env.PERF_REPEATS) || 3;

/** The run's label: PERF_LABEL, else the git short SHA. */
export function perfLabel(): string {
  if (process.env.PERF_LABEL) return process.env.PERF_LABEL;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unlabelled";
  }
}

export type Sample = Record<string, number>;
export interface Stat {
  median: number;
  min: number;
  max: number;
  values: number[];
}

export function summarize(samples: Sample[]): Record<string, Stat> {
  const keys = [...new Set(samples.flatMap((s) => Object.keys(s)))];
  return Object.fromEntries(
    keys.map((k) => {
      const values = samples.map((s) => s[k]).filter((v) => Number.isFinite(v));
      const sorted = [...values].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return [k, { median: round(median), min: round(sorted[0]), max: round(sorted[sorted.length - 1]), values: values.map(round) }];
    })
  );
}

const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

/** Write `.cache/perf/<label>/<spec>.json`. */
export function writeResult(spec: string, data: Record<string, unknown>): string {
  const dir = path.join(".cache", "perf", perfLabel());
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${spec}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ spec, label: perfLabel(), at: new Date().toISOString(), ...data }, null, 2)}\n`);
  return file;
}

/**
 * Counts rAF callbacks that ran, and with `__rafStacks` on, who asked for them (the first stack frame outside this
 * wrapper). Read with `window.__raf`.
 */
export const RAF_INIT = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const stats = { callbacks: 0, callers: {} };
  window.__raf = stats;
  window.requestAnimationFrame = (cb) => {
    if (window.__rafStacks) {
      const line = (new Error().stack || "").split("\\n").slice(2).find((l) => l.trim()) || "?";
      const key = line.trim().replace(/^at /, "").replace(/\\?[^:)]*/, "");
      stats.callers[key] = (stats.callers[key] || 0) + 1;
    }
    return raf((t) => {
      stats.callbacks++;
      cb(t);
    });
  };
})();`;

/** Records the page time the first element matching `selector` appeared (`window.__firstZoneMs`). */
export const firstZoneInit = (selector: string) => `(() => {
  const check = () => {
    if (window.__firstZoneMs === undefined && document.querySelector(${JSON.stringify(selector)})) {
      window.__firstZoneMs = performance.now();
      obs.disconnect();
    }
  };
  const obs = new MutationObserver(check);
  const start = () => { obs.observe(document.documentElement, { childList: true, subtree: true }); check(); };
  if (document.documentElement) start(); else document.addEventListener("readystatechange", start, { once: true });
})();`;

const TRACE_CATEGORIES = ["v8", "disabled-by-default-v8.compile", "devtools.timeline"].join(",");
const COMPILE_EVENTS = ["v8.compile", "v8.parseOnBackground", "v8.compileModule", "V8.CompileCode", "v8.produceModuleCache", "v8.produceCache"];

interface TraceEvent {
  name: string;
  ph: string;
  dur?: number;
  args?: { data?: { url?: string }; fileName?: string };
}

async function collectTrace(cdp: CDPSession, run: () => Promise<void>): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (d) => {
    events.push(...(d.value as unknown as TraceEvent[]));
  });
  await cdp.send("Tracing.start", { categories: TRACE_CATEGORIES, transferMode: "ReportEvents" });
  await run();
  await new Promise<void>((done) => {
    cdp.once("Tracing.tracingComplete", () => done());
    void cdp.send("Tracing.end");
  });
  return events;
}

/** Load cost: JS bytes over the wire, parse/compile ms of the server's scripts, first zone and FCP. */
export async function measureLoad(page: Page, cdp: CDPSession, url: string, zoneSelector: string, origin: string): Promise<Sample> {
  await cdp.send("Network.enable");
  const scripts = new Map<string, string>();
  const bytes = new Map<string, number>();
  let requests = 0;
  cdp.on("Network.requestWillBeSent", (e: { request: { url: string } }) => {
    if (e.request.url.startsWith(origin)) requests++;
  });
  cdp.on("Network.responseReceived", (e: { requestId: string; type: string; response: { url: string } }) => {
    if (e.type === "Script") scripts.set(e.requestId, e.response.url);
  });
  cdp.on("Network.loadingFinished", (e: { requestId: string; encodedDataLength: number }) => {
    if (scripts.has(e.requestId)) bytes.set(e.requestId, e.encodedDataLength);
  });
  const events = await collectTrace(cdp, async () => {
    await page.goto(url);
    await page.waitForSelector(zoneSelector, { timeout: 20_000 });
    await page.waitForTimeout(1500);
  });
  let compileMs = 0;
  for (const e of events) {
    if (e.ph !== "X" || !COMPILE_EVENTS.includes(e.name)) continue;
    const src = e.args?.data?.url ?? e.args?.fileName ?? "";
    if (src.startsWith(origin)) compileMs += (e.dur ?? 0) / 1000;
  }
  const timing = await page.evaluate(() => ({
    firstZone: (window as unknown as { __firstZoneMs?: number }).__firstZoneMs ?? Number.NaN,
    fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? Number.NaN,
  }));
  return {
    jsBytes: [...bytes.values()].reduce((a, b) => a + b, 0),
    compileMs,
    firstZoneMs: timing.firstZone,
    fcpMs: timing.fcp,
    loadRequests: requests,
  };
}

const METRICS = ["LayoutCount", "RecalcStyleCount", "ScriptDuration", "TaskDuration"] as const;

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics: list } = (await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

/** Idle cost over `WINDOW_MS`, per second (durations in ms of CPU per second). */
export async function measureIdle(page: Page, cdp: CDPSession, windowMs = WINDOW_MS): Promise<Sample> {
  await cdp.send("Performance.enable");
  const before = await metrics(cdp);
  const raf0 = await page.evaluate(() => (window as unknown as { __raf: { callbacks: number } }).__raf.callbacks);
  await page.waitForTimeout(windowMs);
  const after = await metrics(cdp);
  const raf1 = await page.evaluate(() => (window as unknown as { __raf: { callbacks: number } }).__raf.callbacks);
  const s = windowMs / 1000;
  const out: Sample = {};
  for (const m of METRICS) {
    const d = after[m] - before[m];
    out[m.endsWith("Duration") ? `${m}MsPerS` : `${m}PerS`] = m.endsWith("Duration") ? (d * 1000) / s : d / s;
  }
  out.jsHeapUsedMB = after.JSHeapUsedSize / 1048576;
  out.rafPerS = (raf1 - raf0) / s;
  out.animations = await page.evaluate(() => document.getAnimations().length);
  return out;
}

export interface PageRun {
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  load: Sample;
}

/** A fresh context and page with the rAF and first-zone probes, loaded and measured. */
export async function openMeasured(browser: Browser, url: string, zoneSelector: string, viewport: { width: number; height: number }): Promise<PageRun> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(RAF_INIT);
  await context.addInitScript(firstZoneInit(zoneSelector));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const load = await measureLoad(page, cdp, url, zoneSelector, new URL(url).origin);
  return { context, page, cdp, load };
}

/** The studio's rail is its first stable element; the studio opens on Screens, so Design is a click away. */
export const STUDIO_READY = '[aria-label="Design"]';

export async function openDesign({ page }: Pick<PageRun, "page">): Promise<void> {
  await page.locator(STUDIO_READY).click();
  await page.locator("[data-zone-id]").first().waitFor();
}

/** Load + warm-up + idle window, `REPEATS` times; each repeat in a fresh context. */
export async function measurePage(browser: Browser, url: string, zoneSelector: string, viewport: { width: number; height: number }, prepare?: (run: PageRun) => Promise<void>): Promise<Record<string, Stat>> {
  const samples: Sample[] = [];
  for (let i = 0; i < REPEATS; i++) {
    const run = await openMeasured(browser, url, zoneSelector, viewport);
    try {
      await prepare?.(run);
      await run.page.waitForTimeout(WARMUP_MS);
      samples.push({ ...run.load, ...(await measureIdle(run.page, run.cdp)) });
    } finally {
      await run.context.close();
    }
  }
  return summarize(samples);
}
