import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { appTree, processes, type Role } from "../../tools/perf/process-sampler.mjs";
import { type PreparedScratch, prepareScratch } from "../../tools/perf/scratch.mjs";

// The desktop debug build on scratch folders, driven over CDP (the `desktop` Playwright project, Windows only).
// Build it first: npm run desktop:web && npm run desktop:prepare && npx tauri build --debug --no-bundle.
// INFOPANEL_STUDIO_CDP_PORT opens WebView2's debugging port in debug builds only (src-tauri/src/windows.rs).
// The app is single-instance by identifier: an installed InfoPanel Studio that is running would take the launch, so
// the specs refuse to start while one runs.

export const EXE = path.resolve(process.env.DESKTOP_EXE ?? "src-tauri/target/debug/infopanel-studio.exe");

/** A port nothing listens on right now. */
export function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = net.createServer();
    srv.once("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => ok(port));
    });
  });
}

/** Processes of the app's tree by role (process-sampler's roles). */
export function roleCounts(): Record<Role, number> {
  const counts: Record<Role, number> = { app: 0, sidecar: 0, webview: 0, renderer: 0, gpu: 0, utility: 0 };
  for (const p of appTree(processes())) counts[p.role] += 1;
  return counts;
}

export interface DesktopApp {
  scratch: PreparedScratch;
  configDir: string;
  /** The dashboard server the app runs. */
  base: string;
  cdpPort: number;
  launch(): ChildProcess;
  /** Connects over CDP and returns the studio page (retries while WebView2 starts). */
  studio(timeoutMs?: number): Promise<{ browser: Browser; page: Page }>;
  /** The app's log so far. */
  log(): string;
  stop(): void;
}

/**
 * Scratch config and data folders, settings merged over safe defaults; the app is launched by `launch()`. `extraEnv`
 * adds to the app's environment (the debug build's spec hooks, e.g. INFOPANEL_STUDIO_BROWSER_PROFILE).
 */
export async function prepareApp(settings: Record<string, unknown> = {}, extraEnv: Record<string, string> = {}): Promise<DesktopApp> {
  if (process.platform !== "win32") throw new Error("the desktop specs need Windows");
  if (!fs.existsSync(EXE)) throw new Error(`no debug build at ${EXE}`);
  if (roleCounts().app > 0) throw new Error("InfoPanel Studio is running; quit it first (the app is single-instance)");
  const scratch = await prepareScratch();
  const configDir = path.join(scratch.tmp, "config");
  fs.mkdirSync(configDir);
  const port = await freePort();
  const cdpPort = await freePort();
  fs.writeFileSync(
    path.join(configDir, "settings.json"),
    JSON.stringify({ port, startAtLogin: false, startServer: true, closeToTray: true, closeWarningShown: true, checkForUpdates: false, agents: { enabled: false }, ...settings })
  );
  const env = {
    ...process.env,
    INFOPANEL_STUDIO_CONFIG_DIR: configDir,
    INFOPANEL_STUDIO_DATA_DIR: scratch.dataDir,
    INFOPANEL_STUDIO_CDP_PORT: String(cdpPort),
    INFOPANEL_DATA_DIR: scratch.infopanel,
    ...extraEnv,
    // USERPROFILE stays: with it pointed elsewhere WebView2 never opens the debugging port. Agents are off in the
    // scratch settings, so no hooks are written; the server's agent-usage scan only reads session metadata.
  };
  const base = `http://127.0.0.1:${port}`;
  const launched: ChildProcess[] = [];
  return {
    scratch,
    configDir,
    base,
    cdpPort,
    launch() {
      const child = spawn(EXE, [], { env, stdio: "ignore", detached: false });
      launched.push(child);
      return child;
    },
    async studio(timeoutMs = 30_000) {
      const end = Date.now() + timeoutMs;
      let last: unknown;
      while (Date.now() < end) {
        try {
          const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 5000 });
          const page = browser
            .contexts()
            .flatMap((c) => c.pages())
            .find((p) => p.url().startsWith(base));
          if (page) return { browser, page };
          await browser.close();
        } catch (err) {
          last = err;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`no studio page over CDP on ${cdpPort} in ${timeoutMs} ms: ${String(last)}`);
    },
    log() {
      const file = path.join(configDir, "logs", "app.log");
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    },
    stop() {
      // The app's tree: the exe, its server and WebView2.
      for (const p of appTree(processes())) {
        try {
          process.kill(p.pid);
        } catch {
          // already gone
        }
      }
      for (const c of launched) c.kill();
      scratch.stop();
    },
  };
}
