// Builds lab/infopanel/fonts/ (gitignored):
//   packs/<zip>/...   font files from the font-pack zips in the corpus folder
//   index.json        every installed and pack font face, plus the corpus's font requests
//   requests.json     the requests alone, for tools/skia-fonts
//
//   npm run lab:fonts -- [source-folder]
//
// Only .ttf/.otf/.ttc entries leave a zip; anything else (DLLs, nested zips) stays put.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDisplayItemsXml, walkItems } from "../src/parse.ts";
import { readFaces } from "../src/sfnt.ts";
import { listEntries, readEntry } from "../src/zip.ts";

const DEFAULT_SOURCE = "G:/win_user-folders/Downloads/infopanel-profiles";
const source = path.resolve(process.argv[2] ?? process.env.INFOPANEL_CORPUS ?? DEFAULT_SOURCE);
const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(lab, "fonts");
const FONT = /\.(ttf|otf|ttc)$/i;

// Keep tools/skia-fonts' output (skia-reference.json, faces/): it takes a separate .NET run.
await rm(path.join(out, "packs"), { recursive: true, force: true });
await mkdir(out, { recursive: true });

/* ---- font packs ---- */
const faces = [];
for (const zip of (await readdir(source)).filter((f) => f.toLowerCase().endsWith(".zip"))) {
  const buf = new Uint8Array(await readFile(path.join(source, zip)));
  const fonts = listEntries(buf).filter((e) => FONT.test(e.name));
  if (fonts.length === 0) continue;
  const dir = path.join(out, "packs", zip.replace(/\.zip$/i, ""));
  for (const e of fonts) {
    const file = path.resolve(dir, e.name);
    if (!file.startsWith(dir + path.sep)) continue;
    const data = await readEntry(buf, e);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    const url = "/" + path.relative(lab, file).split(path.sep).join("/");
    for (const face of readFaces(data)) faces.push({ ...face, source: "pack", url });
  }
  console.log(`${zip}: ${fonts.length} font files`);
}

/* ---- installed fonts (what InfoPanel's Skia sees on this machine) ---- */
function registryFonts(hive) {
  try {
    const text = execFileSync("reg", ["query", `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], {
      encoding: "utf8",
    });
    return [...text.matchAll(/^\s+.+?\s+REG_SZ\s+(.+?)\s*$/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}
const windir = process.env.WINDIR ?? "C:\\Windows";
const installed = new Set();
for (const value of [...registryFonts("HKLM"), ...registryFonts("HKCU")]) {
  if (FONT.test(value)) installed.add(path.isAbsolute(value) ? value : path.join(windir, "Fonts", value));
}
let unreadable = 0;
for (const file of installed) {
  try {
    for (const face of readFaces(new Uint8Array(await readFile(file)))) faces.push({ ...face, source: "system" });
  } catch {
    unreadable++;
  }
}
console.log(`installed: ${installed.size} font files${unreadable ? `, ${unreadable} unreadable` : ""}`);

/* ---- font requests in the corpus ---- */
const TEXT_KINDS = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);
const requests = new Map();
const profiles = {};
const corpus = path.join(lab, "corpus");
for (const id of (await readdir(corpus, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const { items } = parseDisplayItemsXml(await readFile(path.join(corpus, id, "DisplayItems.xml"), "utf8"));
  const used = new Set();
  for (const { item } of walkItems(items)) {
    if (!TEXT_KINDS.has(item.kind)) continue;
    const r = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
    const key = JSON.stringify(r);
    requests.set(key, r);
    used.add(key);
  }
  profiles[id] = [...used].map((k) => [...requests.keys()].indexOf(k));
}

await writeFile(path.join(out, "requests.json"), JSON.stringify([...requests.values()], null, 1) + "\n");
await writeFile(path.join(out, "index.json"), JSON.stringify({ faces, requests: [...requests.values()], profiles }) + "\n");
console.log(`${faces.length} faces, ${requests.size} distinct font requests -> ${out}`);
