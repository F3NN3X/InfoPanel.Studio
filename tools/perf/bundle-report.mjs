#!/usr/bin/env node
// What each page entry downloads before it can run: from Vite's build manifest, the transitive closure of an entry's
// static imports, raw and gzip bytes, and the ten largest chunks of the build.
//   node tools/perf/bundle-report.mjs [--dist dist] [--settings-dist src-tauri/pages/app]
// Entries:
//   kiosk     index.html (the kiosk page loads only this; the studio is a lazy chunk)
//   studio    index.html plus the studio-view chunk's static closure
//   settings  settings.html of the settings window build (npm run desktop:settings), when it exists
// Writes .cache/perf/<label>/bundle.json (PERF_LABEL, else the git short SHA). Build first: `npm run build`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Strings only React's server renderer (react-dom/server) carries: the stream API and Fizz's boundary script. */
export const SERVER_RENDERER_MARKERS = ["renderToReadableStream", "$RC="];

export function label() {
  if (process.env.PERF_LABEL) return process.env.PERF_LABEL;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unlabelled";
  }
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

export function readManifest(dist) {
  const file = path.join(dist, ".vite", "manifest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Manifest keys statically reachable from `roots` (the roots included). */
export function closure(manifest, roots) {
  const seen = new Set();
  const walk = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const dep of manifest[key].imports ?? []) walk(dep);
  };
  for (const r of roots) walk(r);
  return [...seen];
}

const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

/** Sizes of a closure: JS (raw, gzip), CSS (raw, gzip), its chunk files, and the server-renderer check. */
export function measureClosure(dist, manifest, keys) {
  const js = keys.map((k) => manifest[k].file);
  const css = [...new Set(keys.flatMap((k) => manifest[k].css ?? []))];
  const sum = (files, f) => files.reduce((n, file) => n + f(fs.readFileSync(path.join(dist, file))), 0);
  const serverRenderer = js.some((file) => {
    const text = fs.readFileSync(path.join(dist, file), "utf8");
    return SERVER_RENDERER_MARKERS.some((m) => text.includes(m));
  });
  return {
    jsRaw: sum(js, (b) => b.length),
    jsGzip: sum(js, gzipSize),
    cssRaw: sum(css, (b) => b.length),
    cssGzip: sum(css, gzipSize),
    chunks: js.length,
    serverRenderer,
    files: js,
  };
}

function largest(dist, manifest, n = 10) {
  const files = [...new Set(Object.values(manifest).map((e) => e.file))];
  return files
    .map((file) => {
      const buf = fs.readFileSync(path.join(dist, file));
      return { file, raw: buf.length, gzip: gzipSize(buf) };
    })
    .sort((a, b) => b.raw - a.raw)
    .slice(0, n);
}

const entryKey = (manifest, name) => Object.keys(manifest).find((k) => manifest[k].isEntry && path.basename(k) === name);
/** A lazy chunk's key: by its source path, or by its file name when Rollup made it a shared chunk (`_name-hash.js`). */
const dynamicKey = (manifest, src) => {
  const name = path.basename(src).replace(/\.[jt]sx?$/, "");
  return Object.keys(manifest).find((k) => k.endsWith(src) || path.basename(manifest[k].file).startsWith(`${name}-`));
};

export function report({ dist = path.join(ROOT, "dist"), settingsDist = path.join(ROOT, "src-tauri/pages/app") } = {}) {
  const manifest = readManifest(dist);
  if (!manifest) throw new Error(`no build manifest in ${dist}/.vite; run npm run build`);
  const index = entryKey(manifest, "index.html");
  const studio = dynamicKey(manifest, "src/components/studio/studio-view.tsx");
  if (!index || !studio) throw new Error("the manifest has no index.html entry or studio-view chunk");
  const out = {
    entries: {
      kiosk: measureClosure(dist, manifest, closure(manifest, [index])),
      studio: measureClosure(dist, manifest, closure(manifest, [index, studio])),
    },
    largest: largest(dist, manifest),
  };
  const settings = readManifest(settingsDist);
  const settingsEntry = settings && entryKey(settings, "settings.html");
  if (settingsEntry) out.entries.settings = measureClosure(settingsDist, settings, closure(settings, [settingsEntry]));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = report({ dist: path.resolve(arg("--dist", "dist")), settingsDist: path.resolve(arg("--settings-dist", "src-tauri/pages/app")) });
  const dir = path.join(ROOT, ".cache", "perf", label());
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "bundle.json");
  fs.writeFileSync(file, `${JSON.stringify({ spec: "bundle", label: label(), at: new Date().toISOString(), ...result }, null, 2)}\n`);
  for (const [name, e] of Object.entries(result.entries)) {
    console.log(`${name.padEnd(8)} js ${(e.jsRaw / 1024).toFixed(0)} KB raw, ${(e.jsGzip / 1024).toFixed(0)} KB gzip, ${e.chunks} chunks${e.serverRenderer ? ", react-dom/server inside" : ""}`);
  }
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
