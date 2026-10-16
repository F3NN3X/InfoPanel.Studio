// Extracts every .infopanel export in a folder into lab/infopanel/corpus/<name>/
// and writes corpus/index.json for the lab page. The corpus is gitignored.
//
//   npm run lab:extract -- [source-folder]
//
// Archives are untrusted: entry names that escape the target folder are skipped.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEntries, readEntry } from "../src/zip.ts";

const DEFAULT_SOURCE = "G:/win_user-folders/Downloads/infopanel-profiles";
const source = path.resolve(process.argv[2] ?? process.env.INFOPANEL_CORPUS ?? DEFAULT_SOURCE);
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../corpus");

/** Resolves an entry under `dir`, or null if the name escapes it. */
function safeJoin(dir, name) {
  const out = path.resolve(dir, name);
  return out.startsWith(dir + path.sep) ? out : null;
}

const files = (await readdir(source)).filter((f) => f.toLowerCase().endsWith(".infopanel")).sort();
if (files.length === 0) {
  console.error(`No .infopanel files in ${source}`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const index = [];
for (const file of files) {
  const id = file.slice(0, -".infopanel".length);
  const dir = path.join(target, id);
  const buf = new Uint8Array(await readFile(path.join(source, file)));
  const entries = listEntries(buf).filter((e) => !e.name.endsWith("/"));
  const skipped = [];
  for (const entry of entries) {
    const out = safeJoin(dir, entry.name);
    if (!out) {
      skipped.push(entry.name);
      continue;
    }
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, await readEntry(buf, entry));
  }
  index.push({ id, file, bytes: buf.length, entries: entries.map((e) => e.name), skipped });
  console.log(`${id}: ${entries.length - skipped.length} entries${skipped.length ? `, ${skipped.length} skipped` : ""}`);
}

await writeFile(path.join(target, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${index.length} profiles to ${target}`);
