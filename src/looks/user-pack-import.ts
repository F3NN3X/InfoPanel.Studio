// Importing and removing a user pack (P12b), in the studio's lazy chunk. A folder or a zip becomes the files a pack has; the
// validator runs on them in `user` mode, and only a pack with no error is sent to `POST /api/packs`, where the server checks
// its structure and size again (it does not take the client's word). A pack with a `pack.css` passes the render check first, and
// its CSS goes in by `POST /api/packs/<id>/sign`, which refuses unless the hash of what the server holds is the hash of what was
// checked (L94). Removing a pack takes it off every level that wears it (Classic is drawn there) once the folder has gone: a
// failed removal changes no config.
import { listEntries, readEntry } from "@/lib/infopanel/zip";
import { cssText, forgetUserPack, registerUserPacks, USER_PACK_ID, userPackIssues } from "./user-packs";
import { FILE_COUNT_MAX, FILE_MAX_BYTES, PACK_CEILING_BYTES, type PackFile, type PackIssue, type PackSource } from "./pack-validate";

/** A file the user picked: its path from the pack folder (`/` separated) and its bytes. */
export interface PickedFile {
  path: string;
  bytes: Uint8Array;
}

/** What the importer says of a pick: the issues in plain words, whether it may be stored, and what it would store. */
export interface ImportReport {
  id?: string;
  name?: string;
  issues: PackIssue[];
  ok: boolean;
}

/** The files the server stores (`is_pack_file`, packs.rs): the fixed names and `assets/<name>.<ext>`, a `.js` only as the script pack.json names (the validator refuses any other). Everything else is left out. */
const STORED = /^(pack\.json|look\.json|icons\.json|OFL\.txt|thumb\.(png|jpg|webp)|assets\/[a-z0-9][a-z0-9-]{0,63}\.(woff2|png|jpg|webp|gif|svg|js))$/;

/** A licence file under another name than the one the server keeps (the validator accepts these names, the server stores `OFL.txt`). */
const LICENCE_NAME = /^(LICEN[CS]E(\.txt)?|OFL)$/;

/** What each rule means to someone who has not read the spec; a rule not here gives its own message. */
const PLAIN: Record<string, string> = {
  "user-css": "A pack cannot bring its own stylesheet (pack.css) unless every rule in it paints a documented part with plain colours.",
  provenance: "This pack takes the id or a font name of a built-in theme. Give it its own.",
  injection: "A value holds markup or a link; look.json and pack.json hold plain values only.",
  "remote-url": "A file is fetched from another address. A pack holds all its files itself.",
  "script-url": "A file is a script address, which a pack may not use.",
  "data-url": "A file is written inline as a data address. Put it in the assets folder.",
  "svg-unsafe": "An SVG holds script or a link out of the file.",
  size: "The pack is over the size limit.",
  "asset-listed": "pack.json's list of assets and the files in the assets folder do not match.",
  "asset-missing": "A file the pack names is not in the pack.",
  "font-licence": "Fonts need their licence (OFL.txt) in the pack, and the SIL Open Font License 1.1.",
  contrast: "Some text or mark could not be read on the card.",
  tone: "The card's tone does not suit its colour.",
  "blur-fallback": "A glass card must stay at least 90% opaque where the blur is off.",
  schema: "A file does not have the shape a pack has.",
  "not-stored": "This file is not part of a pack and is left out.",
  script: "The pack's effect script is one .js file of its assets, listed in pack.json, at most 64 KB of text.",
};

/** One issue as a line of plain words: where, then what. */
export const describeIssue = (i: PackIssue): string => `${i.file ? `${i.file}: ` : ""}${PLAIN[i.rule] ? `${PLAIN[i.rule]} (${i.message})` : i.message}`;

const normal = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "");
const rootOf = (paths: readonly string[]): string => paths.find((p) => /(^|\/)pack\.json$/.test(p))?.replace(/pack\.json$/, "") ?? "";

/** A picked folder or archive with its one top folder taken off (`my-pack/pack.json` is `pack.json`). */
export function withoutRoot(files: readonly PickedFile[]): PickedFile[] {
  const norm = files.map((f) => ({ ...f, path: normal(f.path) }));
  const root = rootOf(norm.map((f) => f.path));
  return norm.filter((f) => f.path.startsWith(root)).map((f) => ({ ...f, path: f.path.slice(root.length) }));
}

/** The files of a pick as a pack source, and what was left out: only what the server stores goes in, and a `pack.css` for the validator to read. */
export function sourceOf(picked: readonly PickedFile[]): { src: PackSource; skipped: string[] } {
  const stored = picked.filter((f) => STORED.test(f.path) || f.path === "pack.css");
  const skipped = picked.filter((f) => !stored.includes(f)).map((f) => f.path);
  const files: PackFile[] = stored.map((f) => ({ path: f.path, size: f.bytes.length, bytes: f.bytes }));
  const json = (path: string): unknown => {
    const bytes = files.find((f) => f.path === path)?.bytes;
    try {
      return bytes && JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return undefined;
    }
  };
  return { src: { pack: json("pack.json"), look: json("look.json"), icons: json("icons.json"), css: cssText(files.find((f) => f.path === "pack.css")?.bytes), files }, skipped };
}

/** The validator's verdict on a pick: errors refuse it, warnings and the left-out files are shown. */
export function checkImport(picked: readonly PickedFile[]): ImportReport & { src: PackSource } {
  const { src, skipped } = sourceOf(withoutRoot(picked));
  const id = (src.pack as { id?: unknown } | undefined)?.id;
  const name = (src.pack as { name?: unknown } | undefined)?.name;
  const issues = [
    ...userPackIssues(src),
    ...skipped.map((p): PackIssue => ({ rule: "not-stored", severity: "warn", file: p, message: LICENCE_NAME.test(p) ? "a licence is kept only as OFL.txt: rename it to OFL.txt" : "not a file a pack has" })),
  ];
  const idOk = typeof id === "string" && USER_PACK_ID.test(id);
  if (!idOk) issues.unshift({ rule: "id", severity: "error", file: "pack.json", message: "the pack's id is lowercase letters, digits and hyphens, 48 at most" });
  return { id: idOk ? id : undefined, name: typeof name === "string" ? name : undefined, issues: [...issues.filter((i) => i.severity === "error"), ...issues.filter((i) => i.severity === "warn")], ok: !issues.some((i) => i.severity === "error"), src };
}

/** Whether a path of a pick is a file the server stores, its top folder taken off (or a `pack.css`, for the validator to read). */
function keeps(paths: readonly string[]): (name: string) => boolean {
  const root = rootOf(paths.map(normal));
  return (name) => {
    const path = normal(name).startsWith(root) ? normal(name).slice(root.length) : "";
    return STORED.test(path) || path === "pack.css";
  };
}

/** The files of a `.zip` (stored or deflated), under the pack's caps. A file the server does not store is listed but never read, so its size cannot fail the import; a file it stores is counted as it is unpacked, whatever its header says. */
export async function filesOfZip(buf: Uint8Array): Promise<PickedFile[]> {
  const entries = listEntries(buf).filter((e) => !e.name.endsWith("/"));
  if (entries.length > FILE_COUNT_MAX * 2) throw new Error(`the archive holds ${entries.length} files`);
  const kept = keeps(entries.map((e) => e.name));
  return Promise.all(
    entries.map(async (e) => {
      if (!kept(e.name)) return { path: e.name, bytes: new Uint8Array() };
      try {
        return { path: e.name, bytes: await readEntry(buf, e, FILE_MAX_BYTES + 1) };
      } catch {
        throw new Error(`${e.name} is too big for a pack (a file is ${FILE_MAX_BYTES} bytes at most), or the archive is damaged`);
      }
    }),
  );
}

/** The files of a picked folder (`webkitdirectory`) or of several files at once. As in a zip, a file the server does not store is listed but never read, so its size cannot fail the import. */
export async function filesOfInput(list: FileList): Promise<PickedFile[]> {
  const files = [...list];
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) return filesOfZip(new Uint8Array(await files[0].arrayBuffer()));
  const pathOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const kept = keeps(files.map(pathOf));
  if (files.filter((f) => kept(pathOf(f))).reduce((n, f) => n + f.size, 0) > PACK_CEILING_BYTES * 4) throw new Error("that is far more than a pack holds");
  return Promise.all(files.map(async (f) => ({ path: pathOf(f), bytes: kept(pathOf(f)) ? new Uint8Array(await f.arrayBuffer()) : new Uint8Array() })));
}

const WRITE = { "Content-Type": "application/json", "X-Dashboard-Pack": "1" };

const base64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
};

/** The hash the server signs: over each file in path order, `<path>\0<length>\0<bytes>` (`content_hash`, pack_sign.rs). Needs a secure context, so a pack with CSS cannot be imported over plain http from another machine. */
export async function packContentHash(files: readonly { path: string; bytes?: Uint8Array }[]): Promise<string> {
  const enc = new TextEncoder();
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const parts = sorted.flatMap((f) => [enc.encode(`${f.path}\0${f.bytes?.length ?? 0}\0`), f.bytes ?? new Uint8Array()]);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (all.set(p, at), at + p.length), 0);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", all))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The render check on a pack's CSS, in words; undefined when it passed (the chunk loads only for a pack with CSS). */
async function renderRefusal(src: PackSource): Promise<string | undefined> {
  const refusals = await (await import("./pack-render-check")).runRenderCheck(src);
  return refusals.length ? `The render check refused this pack: ${refusals.join("; ")}` : undefined;
}

/** Stores the pack's CSS and has the server sign the pack; undefined when it did. */
async function signPack(id: string, src: PackSource): Promise<string | undefined> {
  const css = src.files.find((f) => f.path === "pack.css")?.bytes ?? new Uint8Array();
  const res = await fetch(`/api/packs/${id}/sign`, { method: "POST", headers: WRITE, body: JSON.stringify({ css: base64(css), hash: await packContentHash(src.files) }) });
  return res.ok ? undefined : (await res.text()) || `the server would not sign the pack (${res.status})`;
}

/** Stores a pack the importer passed, then reads it back through the route the way the kiosk will (the validator runs again on those bytes). Returns the issues of that second read, empty when the pack is worn-ready. */
export async function storePack(report: ImportReport & { src: PackSource }): Promise<string | undefined> {
  if (!report.ok || !report.id) return "the pack has errors";
  const styled = report.src.css !== undefined;
  const refused = styled ? await renderRefusal(report.src) : undefined;
  if (refused) return refused;
  const files = report.src.files.filter((f) => f.path !== "pack.css").map((f) => ({ path: f.path, data: base64(f.bytes ?? new Uint8Array()) }));
  const res = await fetch("/api/packs", { method: "POST", headers: WRITE, body: JSON.stringify({ id: report.id, files }) });
  if (!res.ok) return (await res.text()) || `the server refused the pack (${res.status})`;
  const unsigned = styled ? await signPack(report.id, report.src).catch((e: Error) => e.message) : undefined;
  if (unsigned) {
    await removePack(report.id);
    return unsigned;
  }
  forgetUserPack(report.id);
  const [registered] = await registerUserPacks([report.id]);
  if (registered === report.id) return undefined;
  await removePack(report.id);
  return "the pack was stored but did not pass the check when it was read back, so it was taken off again";
}

/** Takes a pack off the server and out of the app. */
export async function removePack(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/packs/${encodeURIComponent(id)}`, { method: "DELETE", headers: WRITE });
    // a 404 is a pack already gone (removed elsewhere): the card and the config's references still go
    const gone = res.ok || res.status === 404;
    if (gone) forgetUserPack(id);
    return gone;
  } catch {
    return false;
  }
}
