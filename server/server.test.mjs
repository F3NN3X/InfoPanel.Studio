import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

// Starts server.mjs with the given env on a port the OS picks (PORT=0), read back from its start
// line, so no other process can take the port between choosing and binding it. It never touches
// the real data folder.
async function start(env) {
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], { env: { ...process.env, ...env, PORT: "0", HOST: "127.0.0.1" } });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  let port = null;
  for (let i = 0; i < 200 && !port; i++) {
    await new Promise((r) => setTimeout(r, 50));
    port = Number(/InfoPanel Studio on http:\/\/[^:]+:(\d+)/.exec(out)?.[1]) || null;
  }
  if (!port) {
    child.kill();
    throw new Error(`server.mjs did not start:\n${out}`);
  }
  return { port, base: `http://127.0.0.1:${port}`, output: () => out, stop: () => child.kill() };
}

describe("server.mjs", () => {
  let dir, plain, debug, upstream, upstreamPort;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipd-server-"));
    const dist = path.join(dir, "dist");
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, "index.html"), "<p>custom dist</p>");
    // A stand-in for a cover-art source.
    upstream = http.createServer((req, res) => {
      if (req.url === "/png") res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(png);
      else if (req.url === "/jpg") res.writeHead(200, { "Content-Type": "image/jpeg" }).end(png);
      else if (req.url === "/hop") res.writeHead(302, { Location: "/jpg" }).end();
      else if (req.url === "/escape") res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }).end();
      else if (req.url === "/bin") res.writeHead(200, { "Content-Type": "application/octet-stream" }).end("<html>");
      else res.writeHead(200, { "Content-Type": "text/html" }).end("<html>");
    });
    await new Promise((ok) => upstream.listen(0, "127.0.0.1", ok));
    upstreamPort = upstream.address().port;
    const env = { DASHBOARD_DATA_DIR: path.join(dir, "data"), DASHBOARD_DIST: dist };
    plain = await start(env);
    debug = await start({ ...env, DASHBOARD_DEBUG: "1" });
  }, 20_000);
  afterAll(() => {
    plain?.stop();
    debug?.stop();
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

  it("serves /api/server/stats in any mode with the open SSE clients", async () => {
    const sse = await fetch(`${plain.base}/events/config`);
    const res = await fetch(`${plain.base}/api/server/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.clients).toBeGreaterThanOrEqual(1);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(stats).sort()).toEqual(["clients", "uptimeSeconds"]);
    expect((await fetch(`${plain.base}/api/server/stats`, { method: "POST" })).status).toBe(405);
    await sse.body.cancel();
    expect(plain.output()).not.toContain("[debug]");
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
    await new Promise((r) => setTimeout(r, 100));
    expect(debug.output()).toContain("[debug] sse connect config");
    expect(debug.output()).toMatch(/\[debug\] GET \/api\/debug\/stats 200 \d+ms/);
    expect(plain.output()).not.toContain("[debug]");
  });
});
