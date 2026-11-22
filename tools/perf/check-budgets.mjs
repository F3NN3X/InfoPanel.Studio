#!/usr/bin/env node
// CI check of the deterministic bundle budgets (tools/perf/budgets.json) against the build in dist/: the kiosk and
// studio entry closures' gzip bytes against their warn/fail bands, no React server renderer in the kiosk closure, and no
// debug-only globals in either. With --packs: each built-in pack's lazy chunks and assets against the `packs` block.
// Exit 1 on a breach; a warning alone exits 0.
//   npm run build && node tools/perf/check-budgets.mjs [--packs]
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
 * The breaches of the built-in packs' sizes (`measured`: id -> { chunks, codeGzip, assetBytes, layers? }) against `b.packs`, as messages.
 * A pack with no budget entry is a breach: its budget is set (measured + 25 %) in the change that adds the pack.
 */
export function packBreaches(measured, b = budgets) {
  const out = [];
  const packs = b.packs ?? {};
  const ceiling = packs.packCeilingBytes ?? 512000;
  for (const [id, m] of Object.entries(measured)) {
    const budget = Object.hasOwn(packs, id) ? packs[id] : undefined;
    if (!budget || typeof budget !== "object") {
      out.push(`pack ${id} has no entry in budgets.json packs`);
      continue;
    }
    if (m.chunks === 0) out.push(`pack ${id} has no chunk of its own in the build`);
    if (!Number.isInteger(budget.layersPerPage) || budget.layersPerPage < 0) out.push(`pack ${id} has no layersPerPage in budgets.json packs`);
    else if (m.layers > budget.layersPerPage) out.push(`pack ${id} has ${m.layers} compositing layers per page > ${budget.layersPerPage}`);
    if (m.codeGzip > budget.codeGzipBytes) out.push(`pack ${id} code ${m.codeGzip} B gzip > ${budget.codeGzipBytes}`);
    if (m.assetBytes > budget.assetBytes) out.push(`pack ${id} assets ${m.assetBytes} B > ${budget.assetBytes}`);
    if (m.codeGzip + m.assetBytes > ceiling) out.push(`pack ${id} is ${m.codeGzip + m.assetBytes} B, over the ${ceiling} B ceiling`);
  }
  return out;
}

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
    const found = packBreaches(measured);
    for (const [id, m] of Object.entries(measured)) console.log(`pack ${id}: ${m.codeGzip} B gzip code, ${m.assetBytes} B assets`);
    console.log(`${Object.keys(measured).length} built-in packs`);
    for (const b of found) console.error(`over budget: ${b}`);
    process.exit(found.length ? 1 : 0);
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
  for (const w of warnings) console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning title=Bundle budget::${w}` : `warning: ${w}`);
  for (const b of found) console.error(`over budget: ${b}`);
  process.exit(found.length ? 1 : 0);
}
