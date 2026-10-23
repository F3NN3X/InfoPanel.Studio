#!/usr/bin/env node
// A stand-in for InfoPanel's Data API, for the perf and e2e harness: the same routes and message shapes the pages
// read (src/lib/sensor-store.ts, src/lib/sensor-stream.ts), with deterministic values.
//   GET /api            200 (the studio's reachability ping, src/lib/data-api.ts)
//   GET /api/sensors    { timestamp, sensors }
//   GET /api/sources    { plugins: [] } (no plugin tree)
//   GET /events         SSE: the full snapshot every second
//   GET /events?prefix=<p>&interval=<ms>   SSE: every key under <p> on connect, then only the changed and removed ones
//   POST /api/fonts/resolve   [] (no InfoPanel fonts)
// The sensors are the widget fixtures' capture (src/widgets/__fixtures__, extra wins). Numeric readings move on a
// seeded wave, so two runs with the same SEED serve the same sequence.
//   PORT (default 3921; 0 picks a free one)  HOST (127.0.0.1)  RATE_HZ (1)  AUDIO_HZ (10, the audio meter's keys)  SEED (1)
// Start line: "Fake Data API on http://<host>:<port>". Node built-ins only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = path.join(ROOT, "src/widgets/__fixtures__");
/** Keys that update at AUDIO_HZ: the visualisers read them on the 100 ms fast stream. */
const AUDIO_PREFIX = "plugins.audio-level-meter";
/** The Data API's minimum stream interval. */
const MIN_INTERVAL_MS = 100;

const num = (v, fallback) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));

/** mulberry32: a small seeded generator. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The captured sensors plus the synthetic extras (extra wins), as src/widgets/__fixtures__/index.ts does. */
export function loadSensors(dir = FIXTURES) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")).sensors ?? {};
  return { ...read("snapshot.json"), ...read("extra.json") };
}

/**
 * A deterministic sensor model: `at(tick, audioTick)` gives the map at those step counts. Each numeric reading
 * swings ±10% of its range (or of its value) around the captured value on its own seeded phase and period.
 */
export function createModel(base, seed = 1) {
  const rand = seeded(seed);
  const keys = Object.keys(base).sort();
  const motion = new Map();
  for (const key of keys) {
    const s = base[key];
    if (typeof s.value !== "number") continue;
    const range = typeof s.max === "number" && typeof s.min === "number" && s.max > s.min ? s.max - s.min : Math.abs(s.value) || 1;
    motion.set(key, { amp: range * 0.1, phase: rand() * Math.PI * 2, period: 5 + Math.floor(rand() * 25) });
  }
  return {
    keys,
    at(tick, audioTick) {
      const out = {};
      for (const key of keys) {
        const s = base[key];
        const m = motion.get(key);
        if (!m) {
          out[key] = s;
          continue;
        }
        const t = key.startsWith(AUDIO_PREFIX) ? audioTick : tick;
        let value = s.value + m.amp * Math.sin(m.phase + (2 * Math.PI * t) / m.period);
        if (s.unit === "%") value = Math.min(100, Math.max(0, value));
        else if (s.value >= 0) value = Math.max(0, value);
        out[key] = { ...s, value: Math.round(value * 100) / 100 };
      }
      return out;
    },
  };
}

const same = (a, b) => a === b || (a && b && a.value === b.value && a.text === b.text && a.unit === b.unit);

/** The keys under `prefix` that differ between two maps: `{ sensors, removed }` (both may be empty). */
export function diffUnder(prev, next, prefix) {
  const sensors = {};
  const removed = [];
  for (const [key, s] of Object.entries(next)) if (key.startsWith(prefix) && !same(prev[key], s)) sensors[key] = s;
  for (const key of Object.keys(prev)) if (key.startsWith(prefix) && !(key in next)) removed.push(key);
  return { sensors, removed };
}

const under = (map, prefix) => Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith(prefix)));

export function createFakeDataApi({ rateHz = 1, audioHz = 10, seed = 1, sensors = loadSensors() } = {}) {
  const model = createModel(sensors, seed);
  let tick = 0;
  let audioTick = 0;
  let current = model.at(0, 0);
  const timers = [
    setInterval(() => {
      tick += 1;
      current = model.at(tick, audioTick);
    }, 1000 / rateHz),
    setInterval(() => {
      audioTick += 1;
      current = model.at(tick, audioTick);
    }, 1000 / audioHz),
  ];
  const clients = new Set();

  const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const json = (res, body) => {
    res.writeHead(200, { ...cors, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  function stream(req, res, query) {
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", Connection: "keep-alive" });
    const filtered = query.has("prefix");
    const prefix = query.get("prefix") ?? "";
    const interval = filtered ? Math.max(MIN_INTERVAL_MS, num(query.get("interval"), 1000)) : 1000;
    const send = (body) => res.write(`data: ${JSON.stringify({ timestamp: Date.now(), ...body })}\n\n`);
    let sent = under(current, prefix);
    send({ sensors: sent });
    const timer = setInterval(() => {
      const now = under(current, prefix);
      if (!filtered) send({ sensors: now });
      else {
        const { sensors: changed, removed } = diffUnder(sent, now, prefix);
        if (Object.keys(changed).length > 0 || removed.length > 0) send({ sensors: changed, ...(removed.length ? { removed } : {}) });
      }
      sent = now;
    }, interval);
    const client = { res, timer };
    clients.add(client);
    req.on("close", () => {
      clearInterval(timer);
      clients.delete(client);
    });
  }

  const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "Access-Control-Allow-Headers": "*" });
      return res.end();
    }
    // The canvas font loader's probe and batches (src/lib/infopanel/font-loader.ts): no faces here, so it falls back.
    if (req.method === "POST" && pathname === "/api/fonts/resolve") {
      req.resume();
      return req.on("end", () => json(res, []));
    }
    if (req.method !== "GET") {
      res.writeHead(405, cors);
      return res.end();
    }
    if (pathname === "/api") return json(res, { name: "fake-data-api" });
    // The plugin tree (src/lib/catalog.ts); the flat namespaces come from the snapshot.
    if (pathname === "/api/sources") return json(res, { plugins: [] });
    if (pathname === "/api/sensors")return json(res, { timestamp: Date.now(), sensors: current });
    if (pathname === "/events") return stream(req, res, searchParams);
    res.writeHead(404, cors);
    res.end();
  });

  return {
    server,
    clients: () => clients.size,
    close() {
      for (const t of timers) clearInterval(t);
      for (const c of clients) {
        clearInterval(c.timer);
        c.res.destroy();
      }
      server.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "127.0.0.1";
  const api = createFakeDataApi({ rateHz: num(process.env.RATE_HZ, 1), audioHz: num(process.env.AUDIO_HZ, 10), seed: num(process.env.SEED, 1) });
  api.server.listen(num(process.env.PORT, 3921), host, () => {
    console.log(`Fake Data API on http://${host}:${api.server.address().port}`);
  });
  const stop = () => {
    api.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
