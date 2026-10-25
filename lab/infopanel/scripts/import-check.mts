// The import-check check: our .infopanel exports read by InfoPanel's own XmlSerializer (lab/infopanel/tools/import-check,
// .NET), then compared field by field with what we wrote.
//
//   node lab/infopanel/scripts/import-check.mts [--keep]
//
// Inputs: one export per item kind and one with all of them (tests/lib/infopanel/export/kind-cases.ts, every field set), plus
// one with the studio elements (tests/lib/infopanel/export/element-cases.ts), one with converted native widgets (native-cases.ts), plus every extracted corpus profile when lab/infopanel/corpus is there (INFOPANEL_CORPUS points elsewhere). Needs Windows, the
// .NET SDK and an InfoPanel checkout: INFOPANEL_PROJECT (the InfoPanel.csproj), else PublicRepos/infopanel-pr173 beside
// the repo's parent folders. Exit 0 passed, 1 a difference, 3 not run here (what is missing is printed).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { entriesFromZip, loadExport } from "../../../src/lib/infopanel/archive.ts";
import { infopanelExport } from "../../../src/lib/infopanel/export/write.ts";
import { parseDisplayItemsXml, parseProfileXml, walkItems } from "../../../src/lib/infopanel/parse.ts";
import { listEntries, readEntry } from "../../../src/lib/infopanel/zip.ts";
import type { DisplayItem } from "../../../src/lib/infopanel/schema.ts";
import { elementExport } from "../../../tests/lib/infopanel/export/element-cases.ts";
import { nativeExport } from "../../../tests/lib/infopanel/export/native-cases.ts";
import { EMPTY_LISTS, fixtures, fullProfile } from "../../../tests/lib/infopanel/export/kind-cases.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const notRun = (why: string): never => {
  console.error(`import-check: NOT RUN, ${why}`);
  process.exit(3);
};

if (process.platform !== "win32") notRun("InfoPanel is a Windows (WPF) app");
if (spawnSync("dotnet", ["--version"], { shell: true }).status !== 0) notRun("the .NET SDK is not installed");

/** The InfoPanel project: the env var, else PublicRepos/infopanel-pr173 beside any parent folder of the repo. */
function findProject(): string | null {
  if (process.env.INFOPANEL_PROJECT) return existsSync(process.env.INFOPANEL_PROJECT) ? process.env.INFOPANEL_PROJECT : null;
  for (let dir = root; dirname(dir) !== dir; dir = dirname(dir)) {
    const csproj = join(dir, "PublicRepos", "infopanel-pr173", "InfoPanel", "InfoPanel.csproj");
    if (existsSync(csproj)) return csproj;
  }
  return null;
}
const project = findProject() ?? notRun("no InfoPanel checkout (set INFOPANEL_PROJECT to its InfoPanel.csproj)");

const work = join(root, ".cache", "import-check");
rmSync(work, { recursive: true, force: true });
const inDir = join(work, "in");
const outDir = join(work, "out");
mkdirSync(inDir, { recursive: true });

// ---- inputs ----
const files: string[] = [];
const add = (name: string, bytes: Uint8Array) => {
  const file = join(inDir, `${name}.infopanel`);
  writeFileSync(file, bytes);
  files.push(file);
};
for (const f of fixtures()) add(f.name, infopanelExport(f.profile, f.items, f.assets));
// The studio elements (composites, bars graph, threshold rings), baked with stand-in files.
add("Elements-8a", (await elementExport(fullProfile())).bytes);
// Converted native widgets (a panel, a decomposed zone and each dedicated converter), baked with stand-in files.
add("Native-6a", (await nativeExport(fullProfile())).bytes);
const corpus = process.env.INFOPANEL_CORPUS ?? join(root, "lab", "infopanel", "corpus");
if (existsSync(corpus)) {
  for (const id of readdirSync(corpus, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const read = (name: string) => readFileSync(join(corpus, id, name), "utf8");
    const profile = parseProfileXml(read("Profile.xml")).profile;
    const items = parseDisplayItemsXml(read("DisplayItems.xml")).items;
    add(`corpus-${id.replace(/[^\w-]+/g, "_")}`, infopanelExport(profile, items, []));
  }
}

// ---- InfoPanel's reader ----
console.error(`import-check: ${files.length} exports through ${project}`);
const run = spawnSync("dotnet", ["run", "--project", join(root, "lab", "infopanel", "tools", "import-check"), "-p:Platform=x64", `-p:InfoPanelProject=${project}`, "--", outDir, ...files], {
  stdio: ["ignore", "pipe", "inherit"],
  encoding: "utf8",
  shell: false,
  maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(`import-check: dotnet run exited ${run.status}`);
  process.exit(1);
}

// ---- compare ----
type Rec = Record<string, unknown>;
const noUnknown = (value: unknown): Rec => JSON.parse(JSON.stringify(value, (k, v) => (k === "unknown" ? undefined : v)));
const flat = (items: DisplayItem[]) => [...walkItems(items)].map(({ item }) => noUnknown(item));

/** What InfoPanel computes rather than reads back (read in its models, documented in lab/infopanel/README.md). */
const COMPUTED: { test: (kind: string, field: string, ours: unknown) => boolean; why: string }[] = [
  { test: (kind, field, ours) => kind === "TableSensor" && field === "Font" && ours === "", why: 'TableSensor Font "" means the first installed family, which InfoPanel fills in' },
  { test: (kind, field) => kind === "HttpImage" && (field === "HttpUrl" || field === "Type"), why: "HttpImage HttpUrl and Type are computed from the sensor (no-op setters)" },
];

const problems: string[] = [];
const allowed = new Map<string, number>();
for (const file of files) {
  const name = file.slice(inDir.length + 1, -".infopanel".length);
  const ours = await loadExport(entriesFromZip(new Uint8Array(readFileSync(file))));
  const theirsXml = readFileSync(join(outDir, `${name}.DisplayItems.xml`), "utf8");
  const theirs = parseDisplayItemsXml(theirsXml).items;
  // Empty lists are written as <X /> by XmlSerializer: ours must spell them the same way.
  if (name === EMPTY_LISTS) {
    const buf = new Uint8Array(readFileSync(file));
    const entry = listEntries(buf).find((e) => e.name === "DisplayItems.xml");
    const written = entry ? new TextDecoder().decode(await readEntry(buf, entry)) : "";
    for (const tag of ["<DisplayItems />", "<Images />"]) if (!theirsXml.includes(tag) || !written.includes(tag)) problems.push(`${name}: ${tag} is not written the way InfoPanel writes it`);
  }
  const a = flat(ours.items);
  const b = flat(theirs);
  if (a.length !== b.length) {
    problems.push(`${name}: ${a.length} items written, InfoPanel holds ${b.length}`);
    continue;
  }
  a.forEach((x, i) => {
    for (const field of Object.keys(x)) {
      if (field === "DisplayItems" || field === "Images" || JSON.stringify(x[field]) === JSON.stringify(b[i][field])) continue;
      const rule = COMPUTED.find((c) => c.test(String(x.kind), field, x[field]));
      if (rule) allowed.set(rule.why, (allowed.get(rule.why) ?? 0) + 1);
      else problems.push(`${name}: item ${i} ${x.kind}.${field}: ${JSON.stringify(x[field])} written, ${JSON.stringify(b[i][field])} held`);
    }
  });
  // Gauge frames are Image items of their own.
  const frames = (items: DisplayItem[]) => [...walkItems(items)].flatMap(({ item }) => (item.kind === "Gauge" ? item.Images.map((f) => noUnknown(f)) : []));
  if (JSON.stringify(frames(ours.items)) !== JSON.stringify(frames(theirs))) problems.push(`${name}: gauge frames differ`);

  const profileOut = readFileSync(join(outDir, `${name}.Profile.xml`), "utf8");
  const held = noUnknown(parseProfileXml(profileOut).profile);
  const written = noUnknown(ours.profile);
  // Fields an InfoPanel build does not have are not in its output at all (IsSelected is never serialised, older builds lack the WebView ones).
  const has = (field: string) => new RegExp(`<${field}[ />]`).test(profileOut);
  for (const field of Object.keys(written)) {
    if (field === "Guid" || JSON.stringify(written[field]) === JSON.stringify(held[field])) continue;
    if (!has(field)) allowed.set(`Profile ${field}: not in this InfoPanel build's output`, (allowed.get(`Profile ${field}: not in this InfoPanel build's output`) ?? 0) + 1);
    else problems.push(`${name}: Profile.${field}: ${JSON.stringify(written[field])} written, ${JSON.stringify(held[field])} held`);
  }
}

console.log(`import-check: ${files.length} exports read by InfoPanel's XmlSerializer (${run.stdout.trim().split("\n").length} summaries)`);
for (const [why, n] of allowed) console.log(`  allowed (${n}): ${why}`);
for (const p of problems) console.error(`  DIFFERENT: ${p}`);
if (!process.argv.includes("--keep")) rmSync(inDir, { recursive: true, force: true });
process.exit(problems.length ? 1 : 0);
