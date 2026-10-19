import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const freePort = () =>
  new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

// Starts server.mjs on a free port with the given env; it never touches the real data folder.
async function start(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], { env: { ...process.env, ...env, PORT: String(port), HOST: "127.0.0.1" } });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  for (let i = 0; i < 100 && !out.includes("InfoPanel Studio on"); i++) await new Promise((r) => setTimeout(r, 50));
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
