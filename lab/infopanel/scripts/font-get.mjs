// Finds, downloads and (optionally) installs free fonts that corpus profiles need.
//
//   npm run lab:font-get -- --missing                 missing families and where to get them
//   npm run lab:font-get -- "Nunito Sans"             download to fonts/downloads/<family>/
//   npm run lab:font-get -- "Nunito Sans" --install   ...and install for the current user (Windows)
//   npm run lab:font-get -- "Nunito Sans" --uninstall remove what --install added
//   add --source google|fontsource|fontsquirrel to pick a source
//
// Installing is per user (no admin): the files go to %LOCALAPPDATA%\Microsoft\Windows\Fonts and
// are registered under HKCU. Apps that already loaded their font list (InfoPanel) need a restart.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTypeface } from "../src/fonts.ts";
import { downloadFamily, fetchCatalogs, findCandidates, searchName } from "../src/font-sources.ts";
import { readFaces } from "../src/sfnt.ts";

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(lab, "fonts");
const installedLog = path.join(fontsDir, "installed.json");
const REG_FONTS = "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
const REG_SYSTEM_FONTS = "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** True when a font registration with this value name exists, for the user or the machine. */
const registered = (value) =>
  [REG_FONTS, REG_SYSTEM_FONTS].some((key) => {
    try {
      execFileSync("reg", ["query", key, "/v", value], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const family = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--source");

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};

async function main() {
/* ---- report ---- */
if (flag("--missing")) {
  const ref = await readJson(path.join(fontsDir, "skia-reference.json"), null);
  if (!ref) throw new Error("No fonts/skia-reference.json: run npm run lab:fonts and tools/skia-fonts first (see README).");
  const fonts = { families: ref.families, defaultFamily: ref.default.family };
  const installed = new Set(ref.families.map((f) => f.name.toLowerCase()));
  const catalogs = await fetchCatalogs();
  for (const u of catalogs.unavailable) console.log(`(source unavailable: ${u})`);
  const seen = new Set();
  for (const { request } of ref.results) {
    if (installed.has(request.Font.toLowerCase()) || seen.has(request.Font)) continue;
    seen.add(request.Font);
    const t = createTypeface(fonts, request.Font, request.Style, request.Bold, request.Italic);
    // A legacy name ("Spotify Mix Extrabold") whose family is installed is not missing.
    const wanted = searchName(request.Font).toLowerCase();
    if (t.family.toLowerCase() === wanted || (wanted && t.family.toLowerCase().startsWith(wanted))) continue;
    const found = findCandidates(request.Font, catalogs);
    console.log(`\n${request.Font}  (InfoPanel draws ${t.family}, via ${t.via})`);
    if (found.length === 0) console.log("  no free source found: commercial or personal-use font; ask the user for the file");
    for (const c of found.slice(0, 3)) console.log(`  ${c.match.padEnd(7)} ${c.source.padEnd(12)} ${c.family}  [${c.license}]  ${c.page}`);
  }
  return 0;
}

if (!family) {
  console.error('Usage: npm run lab:font-get -- --missing | "<family>" [--source s] [--install | --uninstall]');
  return 1;
}

/* ---- uninstall ---- */
function broadcastFontChange() {
  // WM_FONTCHANGE to all top-level windows, so running apps may refresh their font lists.
  const script = `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr SendMessageTimeout(System.IntPtr h, uint m, System.UIntPtr w, System.IntPtr l, uint f, uint t, out System.UIntPtr r);'; $r = [System.UIntPtr]::Zero; [void][W.U]::SendMessageTimeout([System.IntPtr]0xffff, 0x1D, [System.UIntPtr]::Zero, [System.IntPtr]::Zero, 2, 1000, [ref]$r)`;
  execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
}

if (flag("--uninstall")) {
  const log = await readJson(installedLog, {});
  const entry = log[family];
  if (!entry) throw new Error(`Nothing installed for "${family}" by this script.`);
  for (const f of entry.files) {
    execFileSync("reg", ["delete", REG_FONTS, "/v", f.value, "/f"], { stdio: "ignore" });
    await rm(f.path, { force: true });
    console.log(`removed ${f.path}`);
  }
  delete log[family];
  await writeFile(installedLog, JSON.stringify(log, null, 1) + "\n");
  broadcastFontChange();
  console.log("Restart InfoPanel to drop the font.");
  return 0;
}

/* ---- download ---- */
const catalogs = await fetchCatalogs();
for (const u of catalogs.unavailable) console.log(`(source unavailable: ${u})`);
const pick = findCandidates(family, catalogs, option("--source") ? [option("--source")] : undefined)[0];
if (!pick) {
  console.error(`No free source for "${family}". Commercial or personal-use fonts need the user's own file.`);
  return 1;
}
console.log(`${pick.family} from ${pick.source} (${pick.match} match), license ${pick.license}`);
if (!pick.open) console.log("  note: not a standard open license; read the included license before redistributing");

const files = await downloadFamily(pick);
const dir = path.join(fontsDir, "downloads", pick.family.replace(/[^\w .-]/g, "_"));
await mkdir(dir, { recursive: true });
for (const f of files) await writeFile(path.join(dir, f.name), f.data);
const fonts = files.filter((f) => f.kind === "font");
console.log(`${fonts.length} font files -> ${dir}`);

/* ---- install ---- */
if (flag("--install")) {
  if (process.platform !== "win32") throw new Error("--install is Windows-only.");
  const target = path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts");
  await mkdir(target, { recursive: true });
  const log = await readJson(installedLog, {});
  const done = [];
  for (const f of fonts) {
    const dest = path.join(target, f.name);
    const exists = await stat(dest).then(() => true, () => false);
    if (exists) {
      console.log(`skip ${f.name}: a file with that name is already installed`);
      continue;
    }
    // The registry name comes from the downloaded file: it must name the family we asked for,
    // be plain text, and not take over an existing registration (a system font, say).
    const face = readFaces(f.data)[0];
    const name = face.fullName || face.family;
    if (!norm(face.family).startsWith(norm(pick.family)) || !/^[\p{L}\p{N} ._&+-]{1,100}$/u.test(name)) {
      console.log(`skip ${f.name}: it names itself "${face.family}" / "${name}", not ${pick.family}`);
      continue;
    }
    const value = `${name} (${/\.otf$/i.test(f.name) ? "OpenType" : "TrueType"})`;
    if (registered(value)) {
      console.log(`skip ${f.name}: "${value}" is already registered`);
      continue;
    }
    await copyFile(path.join(dir, f.name), dest);
    execFileSync("reg", ["add", REG_FONTS, "/v", value, "/t", "REG_SZ", "/d", dest, "/f"], { stdio: "ignore" });
    done.push({ path: dest, value });
    console.log(`installed ${dest}`);
  }
  log[family] = { source: pick.source, family: pick.family, files: [...(log[family]?.files ?? []), ...done] };
  await writeFile(installedLog, JSON.stringify(log, null, 1) + "\n");
  broadcastFontChange();
  console.log(`Installed ${done.length} files. Restart InfoPanel (and rerun tools/skia-fonts) to use them.`);
}
return 0;
}

// Not process.exit(): on Windows it can trip a libuv assertion while fetch sockets close.
process.exitCode = await main();
