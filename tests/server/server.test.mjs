import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "../setup/repo-root.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listenOnGoodPort, startServer } from "./harness.mjs";

const root = repoRoot;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

// Starts the server (ips-server, tests/server/harness.mjs) with the given env. It never touches the real data folder.
// The server reads the user's home (os.homedir: USERPROFILE on Windows, HOME elsewhere) and %LOCALAPPDATA%\InfoPanel;
// both point inside the test's own folder, so a test never scans real files.
function isolatedHome(dataDir) {
  const home = path.join(dataDir, "home");
  return { HOME: home, USERPROFILE: home, INFOPANEL_DATA_DIR: path.join(dataDir, "infopanel") };
}

const start = (env) => startServer({ ...isolatedHome(env.DASHBOARD_DATA_DIR), ...env });

describe("server", () => {
  let dir, plain, debug, upstream, upstreamPort;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipd-server-"));
    const dist = path.join(dir, "dist");
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, "index.html"), "<p>custom dist</p>");
    fs.writeFileSync(path.join(dist, "a.txt"), "plain");
    // A stand-in for a cover-art source.
    upstream = http.createServer((req, res) => {
      if (req.url === "/png") res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(png);
      else if (req.url === "/jpg") res.writeHead(200, { "Content-Type": "image/jpeg" }).end(png);
      else if (req.url === "/hop") res.writeHead(302, { Location: "/jpg" }).end();
      else if (req.url === "/escape") res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }).end();
      else if (req.url === "/bin") res.writeHead(200, { "Content-Type": "application/octet-stream" }).end("<html>");
      else res.writeHead(200, { "Content-Type": "text/html" }).end("<html>");
    });
    upstreamPort = await listenOnGoodPort(upstream);
    const env = { DASHBOARD_DATA_DIR: path.join(dir, "data"), DASHBOARD_DIST: dist };
    plain = await start(env);
    debug = await start({ ...env, DASHBOARD_DEBUG: "1" });
  }, 20_000);
  afterAll(async () => {
    await Promise.all([plain?.stop(), debug?.stop()]);
    upstream?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("answers /api/health and serves DASHBOARD_DIST", async () => {
    const res = await fetch(`${plain.base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: "infopanel-dashboard", version: pkg.version, configVersion: 0 });
    expect(await (await fetch(`${plain.base}/`)).text()).toBe("<p>custom dist</p>");
    expect((await fetch(`${plain.base}/api/health`, { method: "POST" })).status).toBe(405);
    // The request guard still applies.
    const rebound = await new Promise((ok) => http.get({ host: "127.0.0.1", port: plain.port, path: "/api/health", headers: { host: "evil.example" } }, (r) => ok(r.statusCode)));
    expect(rebound).toBe(421);
  });

  it("sends the security headers: a CSP on HTML only, nosniff on every static file", async () => {
    const html = await fetch(`${plain.base}/`);
    const csp = html.headers.get("content-security-policy");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).not.toContain("frame-ancestors");
    expect((await fetch(`${plain.base}/?studio=1`)).headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(csp).toContain("ipc:");
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(html.headers.get("referrer-policy")).toBeTruthy();
    const other = await fetch(`${plain.base}/a.txt`);
    expect(other.headers.get("content-security-policy")).toBeNull();
    expect(other.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("proxies images only", async () => {
    const proxy = (p) => fetch(`${plain.base}/api/image-proxy?url=${encodeURIComponent(`http://127.0.0.1:${upstreamPort}${p}`)}`);
    const jpg = await proxy("/jpg");
    expect(jpg.status).toBe(200);
    expect(jpg.headers.get("content-type")).toBe("image/jpeg");
    expect(jpg.headers.get("x-content-type-options")).toBe("nosniff");
    const sniffed = await proxy("/png");
    expect(sniffed.headers.get("content-type")).toBe("image/png");
    expect((await proxy("/bin")).status).toBe(406);
    expect((await proxy("/html")).status).toBe(406);
  });

  it("follows image-proxy redirects only to allowed targets", async () => {
    const proxy = (p) => fetch(`${plain.base}/api/image-proxy?url=${encodeURIComponent(`http://127.0.0.1:${upstreamPort}${p}`)}`);
    const hop = await proxy("/hop");
    expect(hop.status).toBe(200);
    expect(hop.headers.get("content-type")).toBe("image/jpeg");
    expect((await proxy("/escape")).status).toBe(502);
  });

  it("keeps canvases apart from the config, so twenty imports fit under its cap", async () => {
    const canvas = (i) => JSON.stringify({ format: "infopanel-canvas", version: 1, source: { name: `ARCv2 ${i}` }, items: [], pad: "x".repeat(310 * 1024) });
    const post = (url, body, header) => fetch(`${plain.base}${url}`, { method: "POST", headers: { "Content-Type": "application/json", [header]: "1" }, body });
    const zone = (i, extra) => ({ id: `c${i}`, module: "infopanel-canvas", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...extra });
    const config = (zones) => JSON.stringify({ version: 5, profiles: [{ id: "p", pages: [{ id: "one", placements: zones }] }] });

    const inline = Array.from({ length: 20 }, (_, i) => zone(i, { canvas: JSON.parse(canvas(i)) }));
    // Inline, the config is over the server's 5 MB cap (MAX_CONFIG_BYTES).
    expect(Buffer.byteLength(config(inline))).toBeGreaterThan(5 * 1024 * 1024);

    const refs = [];
    for (let i = 0; i < 20; i++) {
      const res = await post("/api/canvases", canvas(i), "X-Dashboard-Canvas");
      expect(res.status).toBe(200);
      refs.push((await res.json()).id);
    }
    expect((await post("/api/config", config(refs.map((ref, i) => zone(i, { canvasRef: ref }))), "X-Dashboard-Config")).status).toBe(200);

    const saved = await (await fetch(`${plain.base}/api/config`)).json();
    const ref = saved.profiles[0].pages[0].placements[3].canvasRef;
    expect(ref).toBe(refs[3]);
    const back = await fetch(`${plain.base}/api/canvases/${ref}`);
    expect(back.status).toBe(200);
    expect(await back.text()).toBe(canvas(3));
    expect((await fetch(`${plain.base}/api/canvases/cnv_ffffffffffffffffffffffffffffffff`)).status).toBe(404);
    // A ref with no file in the store is refused, and the stored config stays.
    const dangling = await post("/api/config", config([zone(0, { canvasRef: refs[0] }), zone(1, { canvasRef: "cnv_ffffffffffffffffffffffffffffffff" })]), "X-Dashboard-Config");
    expect(dangling.status).toBe(422);
    expect(await dangling.text()).toContain("cnv_ffffffffffffffffffffffffffffffff");
    expect((await (await fetch(`${plain.base}/api/config`)).json()).profiles[0].pages[0].placements).toHaveLength(20);
    expect((await fetch(`${plain.base}/api/canvases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: canvas(0) })).status).toBe(403);
  });

  it("merges a Settings patch into the saved config behind the config write guards", async () => {
    const saved = { version: 11, general: { font: "inter" }, profiles: [{ id: "desk", pages: [{ id: "one", placements: [] }], performance: { maxFps: 30 } }] };
    const headers = { "Content-Type": "application/json", "X-Dashboard-Config": "1" };
    expect((await fetch(`${plain.base}/api/config`, { method: "POST", headers, body: JSON.stringify(saved) })).status).toBe(200);
    const patch = (body, h = headers, method = "PATCH") => fetch(`${plain.base}/api/config/settings`, { method, headers: h, body: JSON.stringify(body) });
    const stored = async () => (await fetch(`${plain.base}/api/config`)).json();

    expect((await patch({ general: { maxFps: 15 } }, { "Content-Type": "application/json" })).status).toBe(403);
    expect((await patch({ general: { maxFps: 15 } }, { "Content-Type": "text/plain", "X-Dashboard-Config": "1" })).status).toBe(415);
    expect((await patch({ general: { maxFps: 15 } }, headers, "POST")).status).toBe(405);
    expect((await patch({ general: { maxFps: 24 } })).status).toBe(400);
    expect((await patch({ profiles: { gone: { performance: null } } })).status).toBe(404);
    expect(await stored()).toEqual(saved);

    const before = (await (await fetch(`${plain.base}/api/health`)).json()).configVersion;
    const res = await patch({ general: { maxFps: 15 }, style: { clock: "12" }, profiles: { desk: { performance: null } } });
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBeGreaterThan(before);
    expect(await stored()).toEqual({ version: 11, general: { font: "inter", maxFps: 15 }, style: { clock: "12" }, profiles: [{ id: "desk", pages: [{ id: "one", placements: [] }] }] });
  });

  it("applies a Settings patch again over a Studio push built before it landed", async () => {
    const headers = { "Content-Type": "application/json", "X-Dashboard-Config": "1" };
    const saved = { version: 11, general: { maxFps: 60 }, profiles: [{ id: "desk", pages: [{ id: "one", placements: [] }] }] };
    const post = (config, rev) => fetch(`${plain.base}/api/config`, { method: "POST", headers: rev === undefined ? headers : { ...headers, "X-Settings-Rev": String(rev) }, body: JSON.stringify(config) });
    const stored = async () => (await fetch(`${plain.base}/api/config`)).json();
    await post(saved);
    const read = await fetch(`${plain.base}/api/config`);
    const known = Number(read.headers.get("X-Settings-Rev"));
    expect(known).toBeGreaterThan(0);

    const patched = await fetch(`${plain.base}/api/config/settings`, { method: "PATCH", headers, body: JSON.stringify({ general: { maxFps: 15 } }) });
    const { settingsRev } = await patched.json();
    expect(settingsRev).toBeGreaterThan(known);

    // The push was built from the config read before the patch: it names the older revision.
    await post({ ...saved, general: { maxFps: 60 }, theme: { mode: "dark" } }, known);
    expect(await stored()).toEqual({ ...saved, general: { maxFps: 15 }, theme: { mode: "dark" } });
    // One built after it names the new revision and is saved as it is; one that names none replaces the config whole.
    await post({ ...saved, general: { maxFps: 30 } }, settingsRev);
    expect((await stored()).general).toEqual({ maxFps: 30 });
    await post({ ...saved, general: { maxFps: 5 } });
    expect((await stored()).general).toEqual({ maxFps: 5 });
  });

  it("feeds a studio the Settings patches it missed, and names the newest on the config stream", async () => {
    const headers = { "Content-Type": "application/json", "X-Dashboard-Config": "1" };
    await fetch(`${plain.base}/api/config`, { method: "POST", headers, body: JSON.stringify({ version: 11, profiles: [{ id: "desk", pages: [{ id: "one", placements: [] }] }] }) });
    const known = Number((await fetch(`${plain.base}/api/config`)).headers.get("X-Settings-Rev"));
    const sse = await fetch(`${plain.base}/events/config`);
    const reader = sse.body.getReader();
    const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
    expect(first.settingsRev).toBe(known);

    await fetch(`${plain.base}/api/config/settings`, { method: "PATCH", headers, body: JSON.stringify({ general: { maxFps: 15 } }) });
    // The save's event names the patch's revision.
    const next = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
    expect(next.settingsRev).toBe(known + 1);
    await reader.cancel();

    const feed = await (await fetch(`${plain.base}/api/config/settings?since=${known}`)).json();
    expect(feed).toEqual({ settingsRev: known + 1, patches: [{ rev: known + 1, patch: { general: { maxFps: 15 } } }] });
    expect((await (await fetch(`${plain.base}/api/config/settings?since=${known + 1}`)).json()).patches).toEqual([]);
    expect((await fetch(`${plain.base}/api/config/settings`)).status).toBe(400);
  });

  it("keeps the studio's preferences in their own file, behind the config write headers", async () => {
    const put = (body, h = { "Content-Type": "application/json", "X-Dashboard-Config": "1" }) =>
      fetch(`${plain.base}/api/studio-prefs`, { method: "PUT", headers: h, body: JSON.stringify(body) });
    expect(await (await fetch(`${plain.base}/api/studio-prefs`)).json()).toEqual({});
    expect((await put({ "studio.previewData": "frozen" }, { "Content-Type": "application/json" })).status).toBe(403);
    expect((await put({ "studio.previewData": "frozen" }, { "Content-Type": "text/plain", "X-Dashboard-Config": "1" })).status).toBe(415);
    expect((await put({ "studio.previewData": "paused" })).status).toBe(400);
    expect((await put({ "studio.other": "x" })).status).toBe(400);
    expect((await fetch(`${plain.base}/api/studio-prefs`, { method: "POST" })).status).toBe(405);

    const res = await put({ "studio.previewData": "frozen" });
    expect(await res.json()).toEqual({ "studio.previewData": "frozen" });
    expect(await (await fetch(`${plain.base}/api/studio-prefs`)).json()).toEqual({ "studio.previewData": "frozen" });
    expect(JSON.parse(fs.readFileSync(path.join(dir, "data", "studio-prefs.json"), "utf8"))).toEqual({ "studio.previewData": "frozen" });
    // Never in the config every kiosk downloads.
    expect(await (await fetch(`${plain.base}/api/config`)).text()).not.toContain("previewData");
  });

  it("serves /api/server/stats in any mode with the open SSE clients", async () => {
    const sse = await fetch(`${plain.base}/events/config`);
    const res = await fetch(`${plain.base}/api/server/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.clients).toBeGreaterThanOrEqual(1);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(stats).sort()).toEqual(["clients", "studios", "uptimeSeconds"]);
    expect((await fetch(`${plain.base}/api/server/stats`, { method: "POST" })).status).toBe(405);
    await sse.body.cancel();
    expect(plain.output()).not.toContain("[debug]");
  });

  it("counts a studio's marked control stream in /api/server/stats until it closes", async () => {
    const studios = async () => (await (await fetch(`${plain.base}/api/server/stats`)).json()).studios;
    const before = await studios();
    const studio = await fetch(`${plain.base}/events/control?client=studio`);
    // A kiosk's stream (it names a profile) is never a studio, marked or not.
    const kiosk = await fetch(`${plain.base}/events/control?profile=desk&client=studio`);
    expect(await studios()).toBe(before + 1);
    await studio.body.cancel();
    await kiosk.body.cancel();
    let left = await studios();
    for (let i = 0; i < 40 && left !== before; i++) {
      await new Promise((r) => setTimeout(r, 25));
      left = await studios();
    }
    expect(left).toBe(before);
  });

  it("lists a kiosk in the control state while its control stream is open", async () => {
    const kiosks = async () => (await (await fetch(`${plain.base}/api/control`)).json()).kiosks;
    const kiosk = await fetch(`${plain.base}/events/control?profile=desk&page=two`);
    // The studio's stream reports no profile: not a kiosk.
    const studio = await fetch(`${plain.base}/events/control`);
    expect(await kiosks()).toEqual([expect.objectContaining({ profile: "desk", address: "127.0.0.1" })]);
    await kiosk.body.cancel();
    await studio.body.cancel();
    let left = await kiosks();
    for (let i = 0; i < 40 && left.length > 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
      left = await kiosks();
    }
    expect(left).toEqual([]);
  });

  it("serves /api/debug/stats only in debug mode and logs requests", async () => {
    expect((await fetch(`${plain.base}/api/debug/stats`)).status).toBe(404);
    const sse = await fetch(`${debug.base}/events/config`);
    await sse.body.cancel();
    const res = await fetch(`${debug.base}/api/debug/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.memory.rss).toBeGreaterThan(0);
    expect(stats.eventLoopDelayMs).toHaveProperty("p99");
    expect(stats.sseClients).toHaveProperty("config");
    // The server logs to its stdout as it serves, which reaches us a moment later.
    const logged = /\[debug\] GET \/api\/debug\/stats 200 \d+ms/;
    for (let i = 0; i < 100 && !(debug.output().includes("[debug] sse connect config") && logged.test(debug.output())); i++) await new Promise((r) => setTimeout(r, 25));
    expect(debug.output()).toContain("[debug] sse connect config");
    expect(debug.output()).toMatch(logged);
    expect(plain.output()).not.toContain("[debug]");
  });
});
