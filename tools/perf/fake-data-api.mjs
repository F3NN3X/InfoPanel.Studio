#!/usr/bin/env node
// A stand-in for InfoPanel's Data API, for the perf and e2e harness: the same routes and message shapes the pages
// read (src/lib/sensor-store.ts, src/lib/sensor-stream.ts), with deterministic values.
//   GET /api            200 (the studio's reachability ping, src/lib/data-api.ts)
//   GET /api/sensors    { timestamp, sensors }
//   GET /api/sources    { plugins: [] } (no plugin tree)
//   GET /events         SSE: the full snapshot every second
//   GET /events?prefix=<p>&interval=<ms>   SSE: every key under <p> on connect, then only the changed and removed ones
//   POST /api/fonts/resolve   [] (no InfoPanel fonts)
//   GET /steam/logos/<file>   a 1×1 PNG: the capture's game art pointed at the capturing PC's image server, so its
//                             URLs (CAPTURE_ORIGIN) are rewritten to this server's own origin and answered here
//   GET /v1/forecast, /v1/search   a stand-in for Open-Meteo (Weather by place): scratch servers name this process as their
//                             provider (WEATHER_BASE_URL, scratch.mjs), so a test or a screenshot never reaches the real one
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
/** Where the capture's image URLs pointed: a port on the capturing PC, so nothing answers there on another machine. */
const CAPTURE_ORIGIN = "http://localhost:39482";
/** A transparent 1×1 PNG, for those images. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
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

/** The dashboard server's own namespaces (src/lib/sensor-store.ts SERVER_NS): the real Data API never carries them. */
const SERVER_NS = ["weather.", "battery."];

/** The captured sensors plus the synthetic extras (extra wins), as src/widgets/__fixtures__/index.ts does, less the server's own. */
export function loadSensors(dir = FIXTURES) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")).sensors ?? {};
  const all = { ...read("snapshot.json"), ...read("extra.json") };
  return Object.fromEntries(Object.entries(all).filter(([key]) => !SERVER_NS.some((ns) => key.startsWith(ns))));
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
    // A state (`playback-state`, `session-state`) is an enum: it holds, so a player stays playing.
    motion.set(key, { amp: key.endsWith("-state") ? 0 : range * 0.1, phase: rand() * Math.PI * 2, period: 5 + Math.floor(rand() * 25) });
  }
  // Each audio device also reports a moving 32-band spectrum (the plugin's `spectrum` entry since v1.3.0, 0..100 per
  // band), so a visualiser has real input; the capture predates the entry.
  const devices = keys.map((k) => new RegExp(`^${AUDIO_PREFIX}\\.([^.]+)\\.audio-level$`).exec(k)?.[1]).filter(Boolean);
  return {
    keys,
    at(tick, audioTick) {
      const out = {};
      for (const [d, dev] of devices.entries()) {
        const bands = Array.from({ length: 32 }, (_, i) => Math.round(60 - i * 1.2 + 25 * Math.sin(d + i * 0.7 + audioTick * 0.9)));
        out[`${AUDIO_PREFIX}.${dev}.spectrum`] = { text: bands.map((v) => Math.max(0, Math.min(100, v))).join(","), unit: "" };
      }
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

/** The places the fake place search knows. */
const PLACES = [
  { name: "Oslo", latitude: 59.9127, longitude: 10.7461, country: "Norway", admin1: "Oslo" },
  { name: "Brevik", latitude: 59.0533, longitude: 9.7007, country: "Norway", admin1: "Telemark" },
  { name: "Tokyo", latitude: 35.6895, longitude: 139.6917, country: "Japan", admin1: "Tokyo" },
  { name: "Bergen", latitude: 60.3913, longitude: 5.3221, country: "Norway", admin1: "Vestland" },
];
const CODES = [3, 61, 0, 2, 71, 45];

/**
 * An Open-Meteo forecast answer for a place, the same for the same coordinates and hour: a temperature from the latitude, a
 * condition from the coordinates, 24 hours that swing two degrees, 7 days.
 */
export function fakeForecast(lat, lon, now = Date.now()) {
  const hour = Math.floor(now / 3_600_000) * 3600;
  const temp = Math.round((25 - Math.abs(lat) * 0.4 + (Math.abs(lon) % 7)) * 10) / 10;
  const code = CODES[Math.abs(Math.round(lat + lon)) % CODES.length];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = Array.from({ length: 7 }, (_, i) => i);
  return {
    latitude: lat,
    longitude: lon,
    utc_offset_seconds: 0,
    current: { time: hour, temperature_2m: temp, apparent_temperature: temp - 2, relative_humidity_2m: 80, weather_code: code, wind_speed_10m: 12, is_day: 1, precipitation: 0 },
    hourly: { time: hours.map((i) => hour + i * 3600), temperature_2m: hours.map((i) => Math.round((temp + 2 * Math.sin(i / 4)) * 10) / 10), weather_code: hours.map(() => code), precipitation_probability: hours.map((i) => (i * 7) % 60) },
    daily: { time: days.map((i) => hour + i * 86_400), temperature_2m_max: days.map((i) => temp + 2 + (i % 3)), temperature_2m_min: days.map((i) => temp - 3 - (i % 2)), weather_code: days.map((i) => CODES[(i + 1) % CODES.length]) },
  };
}

/** An Open-Meteo place search answer: the known places whose name starts with the query. */
export const fakeSearch = (name) => ({ results: PLACES.filter((p) => p.name.toLowerCase().startsWith(String(name).toLowerCase())) });

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
  /** The body as JSON, the capture's image URLs pointed at this server as the request reached it. */
  const encode = (req, body) => JSON.stringify(body).replaceAll(CAPTURE_ORIGIN, `http://${req.headers.host}`);
  const json = (res, body, req) => {
    res.writeHead(200, { ...cors, "Content-Type": "application/json; charset=utf-8" });
    res.end(req ? encode(req, body) : JSON.stringify(body));
  };

  function stream(req, res, query) {
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", Connection: "keep-alive" });
    const filtered = query.has("prefix");
    const prefix = query.get("prefix") ?? "";
    const interval = filtered ? Math.max(MIN_INTERVAL_MS, num(query.get("interval"), 1000)) : 1000;
    const send = (body) => res.write(`data: ${encode(req, { timestamp: Date.now(), ...body })}\n\n`);
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
    if (pathname === "/api/sensors")return json(res, { timestamp: Date.now(), sensors: current }, req);
    if (pathname.startsWith("/steam/logos/")) {
      res.writeHead(200, { ...cors, "Content-Type": "image/png" });
      return res.end(PIXEL);
    }
    if (pathname === "/events") return stream(req, res, searchParams);
    if (pathname === "/v1/forecast") return json(res, fakeForecast(num(searchParams.get("latitude"), 0), num(searchParams.get("longitude"), 0)));
    if (pathname === "/v1/search") return json(res, fakeSearch(searchParams.get("name") ?? ""));
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
