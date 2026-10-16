// Extracts every .infopanel export in a folder into lab/infopanel/corpus/<name>/
// and writes corpus/index.json for the lab page. The corpus is gitignored.
//
//   npm run lab:extract -- [source-folder]
//
// Archives are untrusted: entry names that escape the target folder are skipped.
//
// A screenshot of InfoPanel's own render (a .png in the same folder) is attached to the
// profile whose name it matches, allowing one typo, and only when it has the profile's size.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

/** Lower-case letters and digits only: "Umbrella_V.2" → "umbrellav2". */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Width and height from a PNG's IHDR, or null. */
function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (buf.length < 24 || sig.some((b, i) => buf[i] !== b)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

const all = await readdir(source);
const screenshots = [];
for (const f of all.filter((f) => f.toLowerCase().endsWith(".png"))) {
  const size = pngSize(new Uint8Array(await readFile(path.join(source, f))));
  if (size) screenshots.push({ file: f, name: norm(f.slice(0, -4)), ...size });
}

/** The profile's name and size, from its Profile.xml. */
async function profileInfo(dir) {
  const xml = await readFile(path.join(dir, "Profile.xml"), "utf8").catch(() => "");
  const field = (n) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1];
  return { name: field("Name") ?? "", width: Number(field("Width") ?? 600), height: Number(field("Height") ?? 400) };
}

const files = all.filter((f) => f.toLowerCase().endsWith(".infopanel")).sort();
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
  const info = await profileInfo(dir);
  const shot = screenshots.find(
    (s) => s.width === info.width && s.height === info.height && distance(s.name, norm(info.name)) <= 1,
  );
  if (shot) await copyFile(path.join(source, shot.file), path.join(dir, "screenshot.png"));
  index.push({ id, file, bytes: buf.length, entries: entries.map((e) => e.name), skipped, screenshot: shot ? "screenshot.png" : null });
  console.log(
    `${id}: ${entries.length - skipped.length} entries${skipped.length ? `, ${skipped.length} skipped` : ""}${shot ? `, screenshot ${shot.file}` : ""}`,
  );
}

await writeFile(path.join(target, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${index.length} profiles to ${target}`);
