#!/usr/bin/env node
// CI check of the deterministic bundle budgets (tools/perf/budgets.json) against the build in dist/: the kiosk and
// studio entry closures' gzip bytes against their warn/fail bands, no React server renderer in the kiosk closure, and no
// debug-only globals in either. With --packs: each built-in pack's lazy chunks and assets against the `packs` block (warn
// lines per pack, the ceiling as the fail line). With --idle [file]: the heavy kiosk screen's idle cost from a perf run
// (`kioskIdleWarn`, report-only). Exit 1 on a breach; a warning alone exits 0.
//   npm run build && node tools/perf/check-budgets.mjs [--packs | --idle [.cache/perf/<label>/kiosk-idle.json]]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/perf/budgets.json"), "utf8"));

const ENTRY_BUDGETS = { kiosk: "kioskEntryGzipBytes", studio: "studioEntryGzipBytes" };

/** An entry's band `{ warn, fail }` from `b`, or null when it is not two positive integers with warn <= fail. */
export function bandOf(name, b = budgets) {
  const band = b[ENTRY_BUDGETS[name]];
  const ok = band && Number.isInteger(band.warn) && Number.isInteger(band.fail) && band.warn > 0 && band.warn <= band.fail;
  return ok ? band : null;
}

/**
 * A bundle report against the entry bands and the hard rules, as `{ warnings, breaches }` of messages. Over `warn` is a
 * warning (the check still passes); over `fail`, a malformed band, the server renderer in the kiosk or a debug-only global
 * is a breach.
 */
export function check(result, b = budgets) {
  const warnings = [];
  const out = [];
  for (const name of Object.keys(ENTRY_BUDGETS)) {
    const size = result.entries[name].jsGzip;
    const band = bandOf(name, b);
    if (!band) out.push(`${name} entry has no { warn, fail } band in budgets.json (${ENTRY_BUDGETS[name]})`);
    else if (size > band.fail) out.push(`${name} entry ${size} B gzip > fail ${band.fail}`);
    else if (size > band.warn) warnings.push(`${name} entry ${size} B gzip > warn ${band.warn} (fail at ${band.fail})`);
  }
  const { kiosk, studio } = result.entries;
  if (kiosk.serverRenderer && !b.kioskServerRendererAllowed) out.push("react-dom/server code is in the kiosk closure");
  for (const [name, e] of Object.entries({ kiosk, studio })) for (const s of e.debugSymbols ?? []) out.push(`debug-only ${s} is in the ${name} closure`);
  return { warnings, breaches: out };
}

/** The breaches of a bundle report, as messages (empty when within the fail bands). */
export const breaches = (result, b = budgets) => check(result, b).breaches;

/**
 * The built-in packs' sizes (`measured`: id -> { chunks, codeGzip, assetBytes, layers? }) against `b.packs`, as
 * `{ warnings, breaches }`. Over a pack's code or asset line is a warning; over the ceiling (code gzip plus assets), more
 * layers than its line, no `layersPerPage`, or no chunk of its own is a breach. A pack with no entry is a warning that
 * names its measured bytes, so the change that adds a pack can set its lines from them.
 */
export function packCheck(measured, b = budgets) {
  const warnings = [];
  const out = [];
  const packs = b.packs ?? {};
  const ceiling = packs.packCeilingBytes;
  if (!Number.isInteger(ceiling) || ceiling <= 0) out.push("budgets.json packs has no packCeilingBytes");
  for (const [id, m] of Object.entries(measured)) {
    const budget = Object.hasOwn(packs, id) ? packs[id] : undefined;
    if (m.chunks === 0) out.push(`pack ${id} has no chunk of its own in the build`);
    if (Number.isInteger(ceiling) && m.codeGzip + m.assetBytes > ceiling) out.push(`pack ${id} is ${m.codeGzip + m.assetBytes} B, over the ${ceiling} B ceiling`);
    if (!budget || typeof budget !== "object") {
      warnings.push(`pack ${id} has no entry in budgets.json packs (measured ${m.codeGzip} B gzip code, ${m.assetBytes} B assets)`);
      continue;
    }
    if (!Number.isInteger(budget.layersPerPage) || budget.layersPerPage < 0) out.push(`pack ${id} has no layersPerPage in budgets.json packs`);
    else if (m.layers > budget.layersPerPage) out.push(`pack ${id} has ${m.layers} compositing layers per page > ${budget.layersPerPage}`);
    if (m.codeGzip > budget.codeGzipBytes) warnings.push(`pack ${id} code ${m.codeGzip} B gzip > warn ${budget.codeGzipBytes}`);
    if (m.assetBytes > budget.assetBytes) warnings.push(`pack ${id} assets ${m.assetBytes} B > warn ${budget.assetBytes}`);
  }
  return { warnings, breaches: out };
}

/** The breaches of the built-in packs' sizes, as messages (`packCheck`'s, without the warnings). */
export const packBreaches = (measured, b = budgets) => packCheck(measured, b).breaches;

/** Warnings for the heavy kiosk screen's idle cost (a kiosk-idle perf result's `cases.heavy` medians) against `b.kioskIdleWarn`. Never a breach. */
export function idleWarnings(kioskIdle, b = budgets) {
  const lines = b.kioskIdleWarn ?? {};
  const heavy = kioskIdle?.cases?.heavy;
  if (!heavy) return ["the perf result has no heavy kiosk case to compare"];
  const out = [];
  const task = heavy.TaskDurationMsPerS?.median;
  const heap = heavy.jsHeapUsedMB?.median;
  if (Number.isFinite(lines.taskMsPerS) && task > lines.taskMsPerS) out.push(`heavy kiosk idles at ${task} ms/s of task time > warn ${lines.taskMsPerS}`);
  if (Number.isFinite(lines.jsHeapMB) && heap > lines.jsHeapMB) out.push(`heavy kiosk holds ${heap} MB of JS heap > warn ${lines.jsHeapMB}`);
  return out;
}

const warn = (title, w) => console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning title=${title}::${w}` : `warning: ${w}`);

const gzipSize = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
const dirBytes = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirBytes(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0) : 0;

/** Manifest keys statically reachable from `roots` (the roots included). */
function reach(manifest, roots) {
  const seen = new Set();
  const walk = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const dep of manifest[key].imports ?? []) walk(dep);
  };
  for (const r of roots) walk(r);
  return seen;
}

/**
 * The built-in packs (src/looks/packs/<id>.ts{,x}) measured in `dist`. A pack's chunks come from the Vite manifest: the
 * chunk built from its source file, plus the chunks that one imports which no page entry loads, and their CSS. `chunks` is 0
 * when the build has none for it (the pack was never built, or its code sits in a chunk an entry carries).
 */
export function measurePacks(dist = path.join(ROOT, "dist"), root = ROOT) {
  const dir = path.join(root, "src/looks/packs");
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).flatMap((f) => (/^[\w-]+\.tsx?$/.test(f) ? [f.replace(/\.tsx?$/, "")] : [])) : [];
  const file = path.join(dist, ".vite", "manifest.json");
  const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const inEntries = reach(manifest, Object.keys(manifest).filter((k) => manifest[k].isEntry));
  return Object.fromEntries(
    ids.map((id) => {
      const keys = Object.keys(manifest).filter((k) => k === `src/looks/packs/${id}.ts` || k === `src/looks/packs/${id}.tsx`);
      const own = [...reach(manifest, keys)].filter((k) => !inEntries.has(k));
      const files = [...new Set(own.flatMap((k) => [manifest[k].file, ...(manifest[k].css ?? [])]))].filter((f) => /\.(js|css)$/.test(f));
      return [
        id,
        {
          chunks: keys.length && !keys.some((k) => inEntries.has(k)) ? files.length : 0,
          codeGzip: files.reduce((n, f) => n + gzipSize(path.join(dist, f)), 0),
          assetBytes: dirBytes(path.join(dir, id, "assets")),
        },
      ];
    })
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--packs")) {
    const measured = measurePacks();
    const { warnings, breaches: found } = packCheck(measured);
    for (const [id, m] of Object.entries(measured)) console.log(`pack ${id}: ${m.codeGzip} B gzip code, ${m.assetBytes} B assets`);
    console.log(`${Object.keys(measured).length} built-in packs`);
    for (const w of warnings) warn("Pack budget", w);
    for (const b of found) console.error(`over budget: ${b}`);
    process.exit(found.length ? 1 : 0);
  }
  const idle = process.argv.indexOf("--idle");
  if (idle !== -1) {
    // the newest kiosk-idle result unless a file is named (`.cache/perf/<label>/kiosk-idle.json`, tests/perf/measure.ts)
    const named = process.argv[idle + 1];
    const dir = path.join(ROOT, ".cache", "perf");
    const newest = () =>
      fs.existsSync(dir)
        ? fs.readdirSync(dir).map((d) => path.join(dir, d, "kiosk-idle.json")).filter((f) => fs.existsSync(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
        : undefined;
    const file = named && !named.startsWith("--") ? path.resolve(named) : newest();
    if (!file) {
      console.log("no kiosk-idle perf result to read (run npm run perf:all)");
      process.exit(0);
    }
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    const heavy = result.cases?.heavy;
    console.log(`${path.relative(ROOT, file)}: heavy kiosk ${heavy?.TaskDurationMsPerS?.median} ms/s task time (warn ${budgets.kioskIdleWarn?.taskMsPerS}), ${heavy?.jsHeapUsedMB?.median} MB heap (warn ${budgets.kioskIdleWarn?.jsHeapMB})`);
    for (const w of idleWarnings(result)) warn("Kiosk idle", w);
    process.exit(0);
  }
  // Loaded here, so the tests import `breaches` without the report (Vitest can't transform it; Node runs it).
  const { report } = await import("./bundle-report.mjs");
  const result = report({ dist: path.join(ROOT, "dist") });
  const { warnings, breaches: found } = check(result);
  const { kiosk, studio } = result.entries;
  const band = (name) => bandOf(name) ?? { warn: "?", fail: "?" };
  console.log(
    `kiosk ${kiosk.jsGzip} B gzip (warn ${band("kiosk").warn}, fail ${band("kiosk").fail}), studio ${studio.jsGzip} B gzip (warn ${band("studio").warn}, fail ${band("studio").fail}), server renderer in kiosk: ${kiosk.serverRenderer}`
  );
  // An Actions annotation puts the warning on the run's summary page without turning the job red.
  for (const w of warnings) warn("Bundle budget", w);
  for (const b of found) console.error(`over budget: ${b}`);
  process.exit(found.length ? 1 : 0);
}
