// Maps every bound item of every extracted corpus profile against a live
// Data API and prints how each was matched.
//
//   npm run lab:map -- [base-url]      (default http://127.0.0.1:3921)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDisplayItemsXml, walkItems } from "../src/parse.ts";
import { buildCatalog, isBound, mapBinding } from "../src/sensors.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3921";
const corpus = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../corpus");

const res = await fetch(`${base}/api/sensors`);
if (!res.ok) throw new Error(`${base}/api/sensors: HTTP ${res.status}`);
const { sensors } = await res.json();
const catalog = buildCatalog(sensors);
const withRef = Object.values(sensors).filter((v) => v.ref).length;
console.log(`${base}: ${Object.keys(sensors).length} keys, ${withRef} with ref\n`);

const rows = [];
const total = { ref: 0, "plugin-key": 0, name: 0, unmapped: 0 };
for (const id of (await readdir(corpus, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const { items } = parseDisplayItemsXml(await readFile(path.join(corpus, id, "DisplayItems.xml"), "utf8"));
  const counts = { ref: 0, "plugin-key": 0, name: 0, unmapped: 0 };
  const byType = {};
  for (const { item } of walkItems(items)) {
    if (!isBound(item)) continue;
    const via = mapBinding(item, catalog)?.via ?? "unmapped";
    counts[via]++;
    total[via]++;
    byType[item.SensorType] ??= { mapped: 0, of: 0 };
    byType[item.SensorType].of++;
    if (via !== "unmapped") byType[item.SensorType].mapped++;
  }
  const types = Object.entries(byType).map(([t, c]) => `${t} ${c.mapped}/${c.of}`).join(", ");
  rows.push({ profile: id, ...counts, types });
}
console.table(rows);
console.log("total", total);
