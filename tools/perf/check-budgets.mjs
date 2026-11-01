#!/usr/bin/env node
// CI check of the deterministic bundle budgets (tools/perf/budgets.json) against the build in dist/: the kiosk and
// studio entry closures' gzip bytes, no React server renderer in the kiosk closure, and no debug-only globals in either.
// Exit 1 on a breach.
//   npm run build && node tools/perf/check-budgets.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/perf/budgets.json"), "utf8"));

/**
 * The most an entry may weigh: its budget plus `entryGzipSlack` of it. The same build gzips a few bytes apart on Windows
 * and on each Linux runner image, so an exact budget fails on the platform it wasn't measured on.
 */
export const limitOf = (budget, b = budgets) => Math.floor(budget * (1 + (b.entryGzipSlack ?? 0)));

/** The breaches of a bundle report, as messages (empty when within budget). */
export function breaches(result, b = budgets) {
  const out = [];
  const { kiosk, studio } = result.entries;
  const kioskLimit = limitOf(b.kioskEntryGzipBytes, b);
  const studioLimit = limitOf(b.studioEntryGzipBytes, b);
  if (kiosk.jsGzip > kioskLimit) out.push(`kiosk entry ${kiosk.jsGzip} B gzip > ${kioskLimit} (budget ${b.kioskEntryGzipBytes} + slack)`);
  if (studio.jsGzip > studioLimit) out.push(`studio entry ${studio.jsGzip} B gzip > ${studioLimit} (budget ${b.studioEntryGzipBytes} + slack)`);
  if (kiosk.serverRenderer && !b.kioskServerRendererAllowed) out.push("react-dom/server code is in the kiosk closure");
  for (const [name, e] of Object.entries({ kiosk, studio })) for (const s of e.debugSymbols ?? []) out.push(`debug-only ${s} is in the ${name} closure`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Loaded here, so the tests import `breaches` without the report (Vitest can't transform it; Node runs it).
  const { report } = await import("./bundle-report.mjs");
  const result = report({ dist: path.join(ROOT, "dist") });
  const found = breaches(result);
  const { kiosk, studio } = result.entries;
  console.log(
    `kiosk ${kiosk.jsGzip} B gzip (budget ${budgets.kioskEntryGzipBytes}, limit ${limitOf(budgets.kioskEntryGzipBytes)}), studio ${studio.jsGzip} B gzip (budget ${budgets.studioEntryGzipBytes}, limit ${limitOf(budgets.studioEntryGzipBytes)}), server renderer in kiosk: ${kiosk.serverRenderer}`
  );
  for (const b of found) console.error(`over budget: ${b}`);
  process.exit(found.length ? 1 : 0);
}
