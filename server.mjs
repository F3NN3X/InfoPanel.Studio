// Standalone server for InfoPanel Studio: the studio, the kiosk dashboard and their config.
//
// Serves the production build (dist/), stores the studio config so every
// view of the dashboard (a browser tab, InfoPanel's native WebView2 page)
// shares it, tells open pages when that config changes, and proxies
// cover-art images so the page can sample their colours on a canvas, and
// stores uploaded media (backgrounds) under DATA_DIR/assets — see
// server/assets.mjs for its routes and security rules.
// Sensor data does not pass through here: pages read it straight from the
// InfoPanel Data API (http://127.0.0.1:3921 by default), which allows CORS.
// It also holds the runtime control state (active page per profile, page
// rotation; server/control.mjs) for kiosks, the studio and the Stream Deck,
// and the alert engine (server/alerts.mjs) that watches the Data API for the
// rules in config.alerts and publishes the active alerts through that state.
// The extras (server/extras.mjs) connect to OBS and fetch the calendar links
// for the Dynamic Island; their secrets live in integrations.json, which no
// page ever downloads.
// Imported canvases live in their own files, the config holding only a ref
// (server/canvases.mjs).
// For the InfoPanel import: the user's library (server/library.mjs), the
// profiles of the InfoPanel installed here, read-only
// (server/infopanel-local.mjs), and a proxy to Font Squirrel, which sends no
// CORS headers (server/font-proxy.mjs).
//
// Node built-ins only. Environment:
//   PORT  listen port (default 3922; 0 picks a free one, logged on start)
//   HOST  listen address (default 127.0.0.1)
//   ALLOW_REMOTE_UPLOAD=1  accept media uploads / deletes from other machines
//   ALLOW_REMOTE_EDIT=1  accept config and integrations writes from other machines (control and reads stay open)
//   ALLOWED_HOSTS  extra Host names to accept, comma separated (see
//                  server/request-guard.mjs)
//   ASSETS_MAX_BYTES  total size cap of the uploaded media (default 2 GB)
//   DASHBOARD_DIST  folder to serve instead of ./dist
//   DASHBOARD_DATA_DIR  folder for config.json, assets and the other state files
//   DASHBOARD_DEBUG=1  log each request and SSE connection; GET /api/debug/stats (this machine only)
// GET /api/server/stats (this machine only, any mode): uptime and open SSE clients for the app.
//   INFOPANEL_DATA_DIR  InfoPanel's data folder (default %LOCALAPPDATA%\InfoPanel)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { createAlerts } from "./server/alerts.mjs";
import { createAssets } from "./server/assets.mjs";
import { createCanvases, createCanvasStore, referencedCanvasIds, SWEEP_EVERY_MS } from "./server/canvases.mjs";
import { versionRefusal } from "./server/config-guard.mjs";
import { applySettingsPatch, reapplySettings } from "./server/config-settings.mjs";
import { createControl } from "./server/control.mjs";
import { createAgentUsage } from "./server/agent-usage.mjs";
import { createDebug } from "./server/debug.mjs";
import { readVersion, resolveDataDir, resolveDist } from "./server/env.mjs";
import { createExtras } from "./server/extras.mjs";
import { createFontProxy } from "./server/font-proxy.mjs";
import { createInstalledProfiles, createInstalledRoutes, infopanelDataDir } from "./server/infopanel-local.mjs";
import { createLibrary, createLibraryStore } from "./server/library.mjs";
import { fetchProxied, isValidProxyTarget, resolveProxyType } from "./server/proxy.mjs";
import { agentWriteRefusal, configWriteRefusal, controlWriteRefusal, createRequestGuard, isLoopback, parseAllowedHosts, remoteEditRefusal } from "./server/request-guard.mjs";
import { securityHeaders } from "./server/security-headers.mjs";

const PORT = process.env.PORT === undefined || process.env.PORT === "" ? 3922 : Number(process.env.PORT);
const HOST = process.env.HOST || "127.0.0.1";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = resolveDist(process.env, path.join(ROOT, "dist"));
const VERSION = readVersion(path.join(ROOT, "package.json"));
const debug = createDebug({ enabled: process.env.DASHBOARD_DEBUG === "1" });
const LOCAL = process.env.LOCALAPPDATA || path.join(process.env.HOME || ".", ".local", "share");
const DATA_DIR = resolveDataDir(process.env, path.join(LOCAL, "InfoPanel", "Dashboard"));
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const ASSETS_DIR = path.join(DATA_DIR, "assets");
const CONTROL_FILE = path.join(DATA_DIR, "control.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const INTEGRATIONS_FILE = path.join(DATA_DIR, "integrations.json");
const LIBRARY_DIR = path.join(DATA_DIR, "library");
const CANVASES_DIR = path.join(DATA_DIR, "canvases");
const CACHE_DIR = path.join(DATA_DIR, "cache");

const MAX_CONFIG_BYTES = 5 * 1024 * 1024;
/** A Settings window patch: a few keys. */
const MAX_SETTINGS_BYTES = 16 * 1024;
const MAX_PROXY_BYTES = 25 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 10_000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------------- config store ---------------- */

fs.mkdirSync(DATA_DIR, { recursive: true });

// Bumped on every save; open pages compare it to decide when to reload.
let configVersion = fs.existsSync(CONFIG_FILE) ? Math.floor(fs.statSync(CONFIG_FILE).mtimeMs) : 0;
const configListeners = new Set();
// Settings patches (PATCH /api/config/settings) numbered, newest last: a Studio push that was built before one landed
// names the revision it knew (X-Settings-Rev) and gets the newer patches applied again. Starts at the clock so a
// restart never numbers below what a still-open Studio saw.
let settingsRev = Date.now();
const settingsLog = [];
const SETTINGS_LOG_MAX = 50;

function saveConfig(json) {
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, CONFIG_FILE);
  configVersion = Math.max(Date.now(), configVersion + 1);
  const event = `data: ${JSON.stringify({ version: configVersion })}\n\n`;
  for (const res of configListeners) res.write(event);
  control.configChanged();
  alerts.configChanged();
  sweepCanvases();
}

// Canvas files the config no longer references (server/canvases.mjs `sweep`): at start and
// after saves, at most every SWEEP_EVERY_MS, off the request that triggered it.
let lastSweep = -Infinity;
function sweepCanvases() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  setImmediate(() => {
    try {
      if (fs.existsSync(CONFIG_FILE)) canvases.sweep(fs.readFileSync(CONFIG_FILE, "utf8"), now);
    } catch (err) {
      console.error("canvas sweep failed:", err);
    }
  });
}

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

/* ---------------- control state ---------------- */

const control = createControl({ file: CONTROL_FILE, readConfig: readConfigFile });
const MAX_CONTROL_BYTES = 4096;
const CONTROL_ACTIONS = new Set(["page", "profile", "rotate", "touch", "alert", "kiosk"]);
const alerts = createAlerts({ file: ALERTS_FILE, readConfig: readConfigFile, control });
// The coding agents' token use, read from their own session files under the user's home.
// Each scan publishes at once; started after `extras` exists, as a scan with no files ends synchronously.
const agentUsage = createAgentUsage({ onScan: () => extras.agents.refresh() });
const extras = createExtras({ file: INTEGRATIONS_FILE, log: (m) => console.log(m), agentUsage });
agentUsage.start();
const MAX_INTEGRATIONS_BYTES = 16 * 1024;
/** A hook's or statusline's JSON (a tool's input can be large; only metadata is kept). */
const MAX_AGENT_BYTES = 512 * 1024;

/**
 * GET /api/control → the state; POST /api/control/<action> with a JSON body → the new state.
 * POST /api/control/alert takes { id, action: "ack" | "dismiss" }, { ruleId, action: "test" } or
 * { action: "mute", minutes } (0 unmutes) → { alerts, mutedUntil }.
 * POST /api/control/kiosk takes { action: "reload" | "dim" | "island", profile?, state?, level? } → the state.
 */
async function handleControl(req, res, pathname) {
  if (pathname === "/api/control") {
    if (req.method !== "GET") return send(res, 405);
    return send(res, 200, JSON.stringify(control.get()), TYPES[".json"]);
  }
  const type = pathname.slice("/api/control/".length);
  if (!CONTROL_ACTIONS.has(type)) return send(res, 404);
  if (req.method !== "POST") return send(res, 405);
  const refusal = controlWriteRefusal(req.headers);
  if (refusal) return send(res, refusal.status, refusal.message);
  let body;
  try {
    body = JSON.parse((await readBody(req, MAX_CONTROL_BYTES)) || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return send(res, 400, "expected a JSON object");
  }
  if (type === "alert") {
    const done = alerts.act(body);
    if (done.error) return send(res, 400, done.error);
    return send(res, 200, JSON.stringify({ alerts: done.alerts, mutedUntil: done.mutedUntil }), TYPES[".json"]);
  }
  const result = control.dispatch({ ...body, type });
  if (result.error) return send(res, 400, result.error);
  send(res, 200, JSON.stringify(result.state), TYPES[".json"]);
}

/** GET /api/alerts/history → the alert history, newest first. */
function handleAlertHistory(req, res) {
  if (req.method !== "GET") return send(res, 405);
  send(res, 200, JSON.stringify(alerts.history()), TYPES[".json"]);
}

/**
 * SSE of the control state; `?profile=<id>` reports the profile this kiosk shows (and `?page=<id>` its
 * page pin), which lists the stream as a kiosk in the state until it closes. Only a kiosk on this machine
 * has its address listed: the state is public, and a LAN kiosk's address is not for every reader.
 */
function handleControlEvents(req, res, query) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  const shown = query.get("profile");
  if (shown) control.dispatch({ type: "shown", profile: shown });
  const kiosk = shown ? control.connect({ profile: shown, page: query.get("page"), address: isLoopback(req.socket.remoteAddress) ? req.socket.remoteAddress : null }) : null;
  const write = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
  write(control.get());
  const unsubscribe = control.subscribe(write);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  const untrack = debug.sseOpen("control");
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    untrack();
    control.disconnect(kiosk);
  });
}

/** SSE of the extras (OBS on air, upcoming calendar events): the state now, then each change. */
function handleExtrasEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  const write = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
  write(extras.state());
  const unsubscribe = extras.subscribe(write);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  const untrack = debug.sseOpen("extras");
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    untrack();
  });
}

/**
 * GET /api/integrations → the OBS and calendar settings without their secrets; PUT with a patch
 * (server/integrations.mjs `applyIntegrations`) → the same. Writes need the config write header.
 */
async function handleIntegrations(req, res) {
  if (req.method === "GET") return send(res, 200, JSON.stringify(extras.integrations.public()), TYPES[".json"]);
  if (req.method !== "PUT") return send(res, 405);
  if (refuseRemoteEdit(req, res)) return;
  const refusal = configWriteRefusal(req.headers);
  if (refusal) return send(res, refusal.status, refusal.message);
  let body;
  try {
    body = JSON.parse((await readBody(req, MAX_INTEGRATIONS_BYTES)) || "{}");
  } catch {
    return send(res, 400, "expected a JSON object");
  }
  const result = extras.integrations.apply(body);
  if (result.error) return send(res, 400, result.error);
  send(res, 200, JSON.stringify(extras.integrations.public()), TYPES[".json"]);
}

/**
 * POST /api/agents/event?agent=claude|codex (a hook's JSON) and POST /api/agents/statusline (Claude
 * Code's statusline JSON), from tools/agent-status.mjs on this machine. Answers 204 at once.
 */
async function handleAgentPost(req, res, pathname, searchParams) {
  if (req.method !== "POST") return send(res, 405);
  const refusal = agentWriteRefusal(req.headers, req.socket.remoteAddress);
  if (refusal) return send(res, refusal.status, refusal.message);
  let payload;
  try {
    payload = JSON.parse(await readBody(req, MAX_AGENT_BYTES));
  } catch {
    return send(res, 400, "invalid JSON");
  }
  if (pathname === "/api/agents/statusline") extras.agents.statusline(payload);
  else extras.agents.event(searchParams.get("agent") ?? "", payload);
  send(res, 204);
}

/* ---------------- helpers ---------------- */

function send(res, status, body = "", type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

/** Answers 403 and returns true when this write comes from another machine and ALLOW_REMOTE_EDIT is off. */
function refuseRemoteEdit(req, res) {
  const refusal = remoteEditRefusal(req.socket.remoteAddress);
  if (!refusal) return false;
  send(res, refusal.status, JSON.stringify({ error: refusal.message }), TYPES[".json"]);
  return true;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------------- routes ---------------- */

const library = createLibraryStore(LIBRARY_DIR);
const canvases = createCanvasStore(CANVASES_DIR);
// Every canvas file counts, referenced or not: an asset is only "unused" when no canvas could draw it.
const handleAssets = createAssets({ dir: ASSETS_DIR, configFile: CONFIG_FILE, send, references: () => [...library.texts(), ...canvases.texts()] });
const handleLibrary = createLibrary({ store: library, send, readBody });
const handleCanvases = createCanvases({ store: canvases, send, readBody });
sweepCanvases();
const handleInstalled = createInstalledRoutes({ installed: createInstalledProfiles(infopanelDataDir(process.env)), send });
const handleFontProxy = createFontProxy({ cacheDir: CACHE_DIR, send });

async function handleConfig(req, res) {
  if (req.method === "GET") {
    if (!fs.existsSync(CONFIG_FILE)) return send(res, 404);
    res.setHeader("X-Settings-Rev", String(settingsRev));
    return send(res, 200, fs.readFileSync(CONFIG_FILE), TYPES[".json"]);
  }
  if (req.method !== "POST") return send(res, 405);
  if (refuseRemoteEdit(req, res)) return;

  const refusal = configWriteRefusal(req.headers);
  if (refusal) return send(res, refusal.status, refusal.message);

  let body;
  try {
    body = await readBody(req, MAX_CONFIG_BYTES);
  } catch {
    return send(res, 413);
  }
  let parsed;
  try {
    // Must be the config object itself, so a stray client can't clobber it.
    parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
  } catch {
    return send(res, 400, "expected a config object");
  }
  // An older build must not overwrite a config a newer one saved.
  if (fs.existsSync(CONFIG_FILE)) {
    const stale = versionRefusal(fs.readFileSync(CONFIG_FILE, "utf8"), parsed);
    if (stale) return send(res, stale.status, stale.message);
  }
  // A push built before a Settings patch landed gets that patch again (see settingsRev).
  const knownRev = Number(req.headers["x-settings-rev"]);
  if (Number.isFinite(knownRev) && settingsLog.some((entry) => entry.rev > knownRev)) {
    body = JSON.stringify(reapplySettings(parsed, settingsLog, knownRev));
  }
  // Every canvasRef must name a file in the canvas store, or its zone would save blank.
  const missing = [...(referencedCanvasIds(body) ?? [])].filter((id) => !canvases.has(id));
  if (missing.length > 0) return send(res, 422, `canvas files missing from the store: ${missing.slice(0, 5).join(", ")}`);
  saveConfig(body);
  send(res, 200, JSON.stringify({ ok: true, version: configVersion }), TYPES[".json"]);
}

/**
 * PATCH /api/config/settings → the Settings window's instant change (server/config-settings.mjs): merged into the
 * saved config, which kiosks then pull like any save. Same guards as POST /api/config.
 */
async function handleConfigSettings(req, res) {
  if (req.method !== "PATCH") return send(res, 405);
  if (refuseRemoteEdit(req, res)) return;
  const refusal = configWriteRefusal(req.headers);
  if (refusal) return send(res, refusal.status, refusal.message);
  let body;
  try {
    body = await readBody(req, MAX_SETTINGS_BYTES);
  } catch {
    return send(res, 413);
  }
  let patch;
  try {
    patch = JSON.parse(body);
  } catch {
    return send(res, 400, "expected a settings patch");
  }
  if (!fs.existsSync(CONFIG_FILE)) return send(res, 404, "no config saved yet");
  const result = applySettingsPatch(readConfigFile(), patch);
  if (!result.config) return send(res, result.status, result.message);
  saveConfig(JSON.stringify(result.config));
  settingsRev += 1;
  settingsLog.push({ rev: settingsRev, patch });
  if (settingsLog.length > SETTINGS_LOG_MAX) settingsLog.shift();
  send(res, 200, JSON.stringify({ ok: true, version: configVersion, settingsRev }), TYPES[".json"]);
}

function handleConfigEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ version: configVersion })}\n\n`);
  configListeners.add(res);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  const untrack = debug.sseOpen("config");
  req.on("close", () => {
    clearInterval(keepAlive);
    configListeners.delete(res);
    untrack();
  });
}

async function handleImageProxy(req, res, query) {
  if (req.method !== "GET") return send(res, 405);
  let target;
  try {
    target = new URL(query.get("url") ?? "");
  } catch {
    return send(res, 400);
  }
  if (!isValidProxyTarget(target)) return send(res, 400);

  let upstream;
  try {
    upstream = await fetchProxied(target, { signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
  } catch {
    return send(res, 504);
  }
  if (!upstream) return send(res, 502, "redirect refused");
  if (!upstream.ok) return send(res, upstream.status);
  if (Number(upstream.headers.get("content-length")) > MAX_PROXY_BYTES) return send(res, 413);

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of upstream.body) {
      size += chunk.length;
      if (size > MAX_PROXY_BYTES) return send(res, 413);
      chunks.push(chunk);
    }
  } catch {
    return send(res, 502);
  }
  const body = Buffer.concat(chunks);
  const type = resolveProxyType(upstream.headers.get("content-type"), body);
  if (!type) return send(res, 406, "not an image");
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}

/** GET /api/health → what is running here; the desktop app uses it to recognise its own server. */
function handleHealth(req, res) {
  if (req.method !== "GET") return send(res, 405);
  // The id predates the InfoPanel Studio name; the desktop app matches on it (src-tauri/src/probe.rs).
  send(res, 200, JSON.stringify({ app: "infopanel-dashboard", version: VERSION, configVersion }), TYPES[".json"]);
}

/** GET /api/debug/stats → process and SSE numbers; only with DASHBOARD_DEBUG=1, only from this machine. */
function handleDebugStats(req, res) {
  if (!debug.enabled) return send(res, 404);
  if (req.method !== "GET") return send(res, 405);
  if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, "debug stats are served to this machine only");
  send(res, 200, JSON.stringify(debug.stats()), TYPES[".json"]);
}

/** GET /api/server/stats → { uptimeSeconds, clients } for the desktop app; only from this machine. */
function handleServerStats(req, res) {
  if (req.method !== "GET") return send(res, 405);
  if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, "server stats are served to this machine only");
  send(res, 200, JSON.stringify(debug.serverStats()), TYPES[".json"]);
}

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405);
  if (!fs.existsSync(DIST)) return send(res, 503, "No build found. Run `npm run build` first.");

  let rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  if (rel.split("/").some((seg) => seg === ".." || seg.startsWith("."))) return send(res, 404);

  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // SPA fallback: the app routes client-side via query strings.
    file = path.join(DIST, "index.html");
  }
  const isHtml = file.endsWith(".html");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    // index.html must track the latest build (hashed asset names change).
    "Cache-Control": isHtml ? "no-store" : "no-cache",
    ...securityHeaders(isHtml, new URL(req.url, "http://x").search),
  });
  if (req.method === "HEAD") return res.end();
  const stream = fs.createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const guard = createRequestGuard({
  host: HOST,
  allowedHosts: parseAllowedHosts(process.env.ALLOWED_HOSTS),
  machineName: os.hostname(),
});

const server = http.createServer(async (req, res) => {
  const refused = guard(req);
  if (refused) {
    res.setHeader("Connection", "close");
    return send(res, refused.status, refused.message);
  }
  const { pathname, searchParams } = new URL(req.url ?? "/", "http://localhost");
  const done = debug.request(req);
  res.on("close", () => done(res.statusCode));
  try {
    if (pathname === "/api/health") return handleHealth(req, res);
    if (pathname === "/api/debug/stats") return handleDebugStats(req, res);
    if (pathname === "/api/server/stats") return handleServerStats(req, res);
    if (pathname === "/api/config") return await handleConfig(req, res);
    if (pathname === "/api/config/settings") return await handleConfigSettings(req, res);
    if (pathname === "/events/config") return handleConfigEvents(req, res);
    if (pathname === "/api/control" || pathname.startsWith("/api/control/")) return await handleControl(req, res, pathname);
    if (pathname === "/api/alerts/history") return handleAlertHistory(req, res);
    if (pathname === "/events/control") return handleControlEvents(req, res, searchParams);
    if (pathname === "/api/extras") return req.method === "GET" ? send(res, 200, JSON.stringify(extras.state()), TYPES[".json"]) : send(res, 405);
    if (pathname === "/events/extras") return handleExtrasEvents(req, res);
    if (pathname === "/api/integrations") return await handleIntegrations(req, res);
    if (pathname === "/api/agents/event" || pathname === "/api/agents/statusline") return await handleAgentPost(req, res, pathname, searchParams);
    if (pathname === "/api/image-proxy") return await handleImageProxy(req, res, searchParams);
    if (pathname === "/api/assets" || pathname.startsWith("/api/assets/")) {
      return await handleAssets(req, res, pathname, searchParams);
    }
    if (pathname === "/api/library" || pathname.startsWith("/api/library/")) return await handleLibrary(req, res, pathname);
    if (pathname === "/api/canvases" || pathname.startsWith("/api/canvases/")) return await handleCanvases(req, res, pathname);
    if (pathname === "/api/infopanel/installed" || pathname.startsWith("/api/infopanel/installed/")) return await handleInstalled(req, res, pathname);
    if (pathname === "/api/font-proxy") return await handleFontProxy(req, res, searchParams);
    if (pathname.startsWith("/api/")) return send(res, 404);
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(`${req.method} ${pathname} failed:`, err);
    if (!res.headersSent) send(res, 500, "internal error");
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`InfoPanel Studio on http://${HOST}:${server.address().port} (config: ${CONFIG_FILE})`);
  if (debug.enabled) console.log("[debug] DASHBOARD_DEBUG=1: logging requests and SSE clients; stats at /api/debug/stats");
});
