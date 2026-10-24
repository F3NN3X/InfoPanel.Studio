import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { appTree, processes, type WinProcess } from "../../tools/perf/process-sampler.mjs";
import { writeResult } from "../perf/measure";
import { type DesktopApp, prepareApp, roleCounts } from "./app";

// Open the studio in › Edge app / Default browser (src-tauri/src/studio_target.rs) on the debug build: the studio
// opens on launch in the browser, the app starts no WebView2, the server sees the studio connect, and the log names
// where it opened. Then the memory of app plus browser studio against the app-window studio, with Edge already
// running and not. Edge runs on a scratch profile (the debug-only INFOPANEL_STUDIO_BROWSER_PROFILE), and Edge also
// stands in for the default browser (INFOPANEL_STUDIO_BROWSER_EXE): a spec never opens the user's own browser.

const WEBVIEW_ROLES = ["webview", "renderer", "gpu", "utility"] as const;
const SETTLE_MS = Number(process.env.PERF_SETTLE_MS) || 20_000;

/** Microsoft Edge from App Paths, as the app finds it. */
function edgeExe(): string {
  const ps = "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe' -ErrorAction SilentlyContinue).'(default)'";
  const exe = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim();
  if (!exe || !fs.existsSync(exe)) throw new Error("Microsoft Edge isn't installed");
  return exe;
}

/** Private MB of the scratch profile's Edge processes. */
function edgeMb(profile: string, all: WinProcess[] = processes()): number {
  return all.filter((p) => /^msedge\.exe$/i.test(p.Name) && p.CommandLine?.includes(profile)).reduce((mb, p) => mb + Number(p.PrivatePageCount) / 1048576, 0);
}

/** Private MB of the app's tree (the exe, its server and any WebView2), without an Edge it started (counted above). */
function appMb(all = processes()): number {
  const edge = new Set(all.filter((p) => /^msedge\.exe$/i.test(p.Name)).map((p) => p.ProcessId));
  return appTree(all)
    .filter((p) => !edge.has(p.pid))
    .reduce((mb, p) => mb + p.bytes / 1048576, 0);
}

const webviews = () => {
  const counts = roleCounts();
  return WEBVIEW_ROLES.reduce((n, role) => n + counts[role], 0);
};

function killEdge(profile: string): void {
  for (const p of processes()) {
    if (!/^msedge\.exe$/i.test(p.Name) || !p.CommandLine?.includes(profile)) continue;
    try {
      process.kill(p.ProcessId);
    } catch {
      // already gone
    }
  }
}

/** Median of three samples after the studio settled. */
async function settledMb(profile: string | null): Promise<{ app: number; browser: number }> {
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const samples: { app: number; browser: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const all = processes();
    samples.push({ app: appMb(all), browser: profile ? edgeMb(profile, all) : 0 });
    await new Promise((r) => setTimeout(r, 2000));
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[1];
  return { app: median(samples.map((s) => s.app)), browser: median(samples.map((s) => s.browser)) };
}

const studios = async (app: DesktopApp): Promise<number> => (await (await fetch(`${app.base}/api/server/stats`)).json()).studios;

interface Run {
  target: "edgeApp" | "defaultBrowser";
  name: string;
  edgeRunning: boolean;
}

async function browserStudio({ target, name, edgeRunning }: Run) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ips-edge-"));
  const edge = edgeExe();
  const env: Record<string, string> = { INFOPANEL_STUDIO_BROWSER_PROFILE: profile, ...(target === "defaultBrowser" ? { INFOPANEL_STUDIO_BROWSER_EXE: edge } : {}) };
  const app = await prepareApp({ openStudioIn: target, openStudioOnLaunch: true }, env);
  let warm: ChildProcess | undefined;
  try {
    let before = 0;
    if (edgeRunning) {
      warm = spawn(edge, [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      before = edgeMb(profile);
    }
    app.launch();
    const line = `studio opened in ${name}: ${app.base}/?studio=1`;
    await expect.poll(() => app.log().includes(line), { timeout: 90_000, intervals: [500] }).toBe(true);
    await expect.poll(() => studios(app), { timeout: 60_000, intervals: [1000] }).toBeGreaterThan(0);
    // No WebView2 at any point after the open.
    for (let i = 0; i < 3; i++) {
      expect(webviews()).toBe(0);
      await new Promise((r) => setTimeout(r, 1000));
    }
    const mb = await settledMb(profile);
    expect(webviews()).toBe(0);
    return { appMb: mb.app, browserMb: mb.browser - before, totalMb: mb.app + mb.browser - before, edgeBeforeMb: before };
  } finally {
    app.stop();
    warm?.kill();
    killEdge(profile);
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("the studio opens in a browser with no WebView2, and what that saves", async () => {
  test.setTimeout(15 * 60_000);
  // The baseline: the app-window studio, on the view it opens to (Screens), like the browser studios below.
  const app = await prepareApp({ openStudioOnLaunch: true });
  let appWindow: { appMb: number; totalMb: number };
  try {
    app.launch();
    // The first WebView2 start after a fresh build can take over a minute.
    const { browser } = await app.studio(120_000);
    await browser.close().catch(() => {});
    const mb = await settledMb(null);
    expect(webviews()).toBeGreaterThan(0);
    appWindow = { appMb: mb.app, totalMb: mb.app };
  } finally {
    app.stop();
  }

  const edgeCold = await browserStudio({ target: "edgeApp", name: "edge app", edgeRunning: false });
  const edgeWarm = await browserStudio({ target: "edgeApp", name: "edge app", edgeRunning: true });
  const browserCold = await browserStudio({ target: "defaultBrowser", name: "default browser", edgeRunning: false });

  writeResult("studio-in-browser", { settleMs: SETTLE_MS, cases: { appWindow, edgeCold, edgeWarm, browserCold } });
  const r = (x: number) => Math.round(x);
  console.log(
    `app window ${r(appWindow.totalMb)} MB; edge app cold ${r(edgeCold.totalMb)} MB (app ${r(edgeCold.appMb)}); edge app warm +${r(edgeWarm.totalMb)} MB (app ${r(edgeWarm.appMb)}, edge +${r(edgeWarm.browserMb)}); default browser cold ${r(browserCold.totalMb)} MB`
  );
});
