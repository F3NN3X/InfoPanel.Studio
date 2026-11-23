// User packs (P12b): theme packs from the app data folder (`DATA_DIR/packs/<id>/`, served by `GET /api/packs/<id>/<file>`).
// Everything here is a lazy chunk: the kiosk reaches it only when a config names a Look it does not know, the studio when the
// Look gallery opens. A pack is read from the route, run through `validatePack` in `user` mode (the mode is decided here, by
// where the bytes came from, never by what they say), then built as a `Pack` from its declarative files: look.json, the stage
// of pack.json, icons.json and the font faces. Its stylesheet is the loader's own font-family rule from the families the validator
// has passed, then its `pack.css` if it has one: read by the grammar in the validator, and served only with the server's word for
// its signature (L94). The loader's checks (`packIssues`) run on it again.
import { cappedBlur } from "@/components/widget-style";
import { LOOK_IDS, registerUserLooks } from "./ids";
import type { Look } from "./look";
import { m, type Material, type MaterialKind } from "./materials";
import { addPackFonts } from "./pack-assets";
import { registerUserPack, unregisterUserPack } from "./pack-load";
import type { Pack } from "./pack";
import { type PackJson, packDecor } from "./pack-json";
import { FILE_COUNT_MAX, type PackFile, type PackIssue, type PackSource, parseColour, validatePack } from "./pack-validate";
import { cssColour } from "./colour";
import { lookLayers, sampleCards } from "./sample-cards";

/** What `GET /api/packs` says of a pack: its id, name and size, nothing else. */
export interface UserPackInfo {
  id: string;
  name: string;
  size: number;
}

/** The route's own id pattern (`is_pack_id`, packs.rs). */
export const USER_PACK_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const ROUTE = "/api/packs";
const LICENCES = ["OFL.txt"];

/** The packs the server lists (empty when the folder is off or the request fails). */
export async function listUserPacks(): Promise<UserPackInfo[]> {
  try {
    const res = await fetch(ROUTE, { cache: "no-store" });
    const list: unknown = res.ok ? await res.json() : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((p): UserPackInfo[] => (p && typeof p.id === "string" && USER_PACK_ID.test(p.id) ? [{ id: p.id, name: typeof p.name === "string" ? p.name : p.id, size: Number(p.size) || 0 }] : []));
  } catch {
    return [];
  }
}

/** Whether the server has its user packs switched off (`USER_PACKS=off`): the list is empty then and every write refused. */
export async function userPacksOff(): Promise<boolean> {
  try {
    return (await fetch(ROUTE, { cache: "no-store" })).headers.get("X-User-Packs") === "off";
  } catch {
    return false;
  }
}

/** A file's bytes, and whether the answer said the pack has a stylesheet (`X-Pack-Css`, on `pack.json`). */
const fileOf = async (id: string, file: string): Promise<{ bytes?: Uint8Array; styled?: boolean }> => {
  try {
    const res = await fetch(`${ROUTE}/${id}/${file}`, { cache: "no-cache" });
    return res.ok ? { bytes: new Uint8Array(await res.arrayBuffer()), styled: res.headers.get("X-Pack-Css") === "1" } : {};
  } catch {
    return {};
  }
};
const bytesOf = async (id: string, file: string): Promise<Uint8Array | undefined> => (await fileOf(id, file)).bytes;

/** The header the server puts on a `pack.css` whose signature it has just checked (`serve_css`, packs.rs). The key is the server's alone, so this is the only word the client can have. */
const SIGNATURE = "X-Pack-Signature";

/** A pack's `pack.css` as a file: anything but a 200 with the server's word for it comes back empty and unread, which the validator refuses. Asked for only when `pack.json` says there is one, so a pack with none makes no request that fails. */
async function cssFile(id: string): Promise<PackFile> {
  const unread: PackFile = { path: "pack.css", size: 0, bytes: new Uint8Array() };
  try {
    const res = await fetch(`${ROUTE}/${id}/pack.css`, { cache: "no-cache" });
    if (!res.ok || res.headers.get(SIGNATURE) !== "valid") return unread;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { path: "pack.css", size: bytes.length, bytes };
  } catch {
    return unread;
  }
}

/** The text of a `pack.css`, or undefined when its bytes are not UTF-8 (a byte-order mark stays in, and the grammar refuses it). */
export function cssText(bytes: Uint8Array | undefined): string | undefined {
  try {
    return bytes?.length ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) : undefined;
  } catch {
    return undefined;
  }
}

const parsed = (bytes: Uint8Array | undefined): unknown => {
  try {
    return bytes && JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
};

/** The files of a pack as the route holds them: pack.json, look.json, icons.json, the licence and each asset pack.json lists (the route has no folder listing), but its script, which the server serves only by the pack's trust (pack-script/trust.ts). */
export async function readUserPack(id: string): Promise<PackSource> {
  const [{ bytes: pack, styled }, look, icons] = await Promise.all([fileOf(id, "pack.json"), bytesOf(id, "look.json"), bytesOf(id, "icons.json")]);
  const css = styled ? await cssFile(id) : undefined;
  const meta = parsed(pack) as { assets?: { file?: unknown }[]; script?: { file?: unknown } } | undefined;
  const listed = (meta?.assets ?? []).flatMap((a) => (typeof a?.file === "string" && a.file !== meta?.script?.file ? [`assets/${a.file}`] : [])).slice(0, FILE_COUNT_MAX);
  const names = [...LICENCES, ...listed];
  const rest = await Promise.all(names.map((f) => bytesOf(id, f)));
  const found: [string, Uint8Array | undefined][] = [["pack.json", pack], ["look.json", look], ["icons.json", icons], ...names.map((n, k): [string, Uint8Array | undefined] => [n, rest[k]])];
  const files: PackFile[] = [...found.flatMap(([path, bytes]) => (bytes ? [{ path, size: bytes.length, bytes }] : [])), ...(css ? [css] : [])];
  return { pack: parsed(pack), look: parsed(look), icons: parsed(icons), css: cssText(css?.bytes), files };
}

/** What is wrong with a pack's files, as a user pack: the validator in `user` mode, always; `script` says where its script is (`route`: read back from the server, which keeps it). */
export const userPackIssues = (src: PackSource, script: "files" | "route" = "files"): PackIssue[] => validatePack(src, { source: "user", script });

/** The font-family rules the loader writes from the families the validator passed (`pack-` names, plain characters): the only CSS a user pack has. */
export function fontCss(fonts: Look["fonts"]): string {
  const stack = (family: string | undefined, rest: string) => (family ? `${family}, ${rest}` : rest);
  const body = stack(fonts.body, "system-ui, sans-serif");
  return `* { font-family: ${body}; }\n${fonts.display ? `[data-part="num"] { font-family: ${stack(fonts.display, body)}; }\n` : ""}${fonts.mono ? `[data-part="mono"] { font-family: ${stack(fonts.mono, "ui-monospace, monospace")}; }\n` : ""}`;
}

const rgba = (value: string | undefined, factor = 1): string | undefined => {
  const c = value ? parseColour(value) : undefined;
  if (!c?.hex) return undefined;
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(c.hex!.slice(k, k + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, c.alpha * factor))})`;
};

/** The Look's card as a material: the paint of its default T2 material (fill, fill-alpha, fill-2, fill-angle, blur, border). A blur's fallback is `resolveMaterial`'s own (`BLUR_FALLBACK_ALPHA`): the card is never painted under 0.9 where the blur is off. */
export function cardOf(id: string, look: Look): Material | undefined {
  const mat = look.t2?.materials?.[look.t2.default];
  if (!mat) return undefined;
  const tone = mat.tone === "light" ? "light" : "dark";
  const alpha = mat["fill-alpha"] ?? 1;
  const first = rgba(mat.fill ?? mat.export ?? undefined, alpha) ?? "transparent";
  const second = rgba(mat["fill-2"], alpha);
  const angle = /^-?\d+(\.\d+)?deg$/.test(mat["fill-angle"] ?? "") ? mat["fill-angle"] : "155deg";
  const blur = mat.blur !== undefined ? Math.min(64, parseFloat(mat.blur)) : 0;
  const edge = rgba(mat.border);
  const paint = m(mat.kind as MaterialKind, "", {
    background: second ? `linear-gradient(${angle}, ${first}, ${second})` : first,
    ...(edge ? { boxShadow: `inset 0 0 0 1px ${edge}` } : null),
    ...(blur > 0 ? { backdropFilter: `blur(${cappedBlur(blur)})`, WebkitBackdropFilter: `blur(${cappedBlur(blur)})` } : null),
  }, mat.export ?? undefined);
  return { id: `look-${id}`, origin: "sample", tone, ...paint };
}

/** The widget-style values the Look sets under its level's own (the Look layer): its card, accent, text and status colours, resolved in its first mode. */
function layerOf(id: string, look: Look): Record<string, string> {
  const mode = look.modes.supported[0];
  const t1: Record<string, { value: string } | undefined> = look.t1[mode] ?? {};
  const v = (name: string) => {
    const raw = t1[name]?.value ?? "";
    const alias = /^\{([\w-]+)\}$/.exec(raw)?.[1];
    return cssColour(alias ? (t1[alias]?.value ?? raw) : raw);
  };
  return { surface: `look-${id}`, accent: v("accent"), textColor: v("fg"), mutedColor: v("muted"), ok: v("ok"), warn: v("warn"), crit: v("crit") };
}

/** The font faces each user pack added to the document, taken out again when the pack is forgotten. */
const faces = new Map<string, FontFace[]>();

/** A validated pack's files as a `Pack`: the stage and slots its pack.json and icons.json declare, served from the route; fonts added to the document unless it is a candidate, which is not stored yet (the render check reads computed paint, not glyphs or images). */
export function userPackOf(src: PackSource, candidate = false): Pack {
  const meta = src.pack as PackJson;
  const look = src.look as Look;
  const base = `${ROUTE}/${meta.id}/assets/`;
  const { frame, ornaments } = packDecor(meta);
  if (!candidate) faces.set(meta.id, addPackFonts({ base, names: Object.fromEntries(meta.fonts.map((f) => [f.file, f.file])) }, meta.fonts));
  return {
    id: meta.id,
    look,
    base,
    css: fontCss(look.fonts) + (src.css ?? ""),
    assets: (meta.assets ?? []).map((a) => a.file),
    slots: { icons: src.icons as NonNullable<Pack["slots"]>["icons"] },
    stage: { layers: meta.stage.layers, effects: meta.stage.effects, overlayMinSizeClass: meta.stage.overlayMinSizeClass },
    burnIn: meta.burnIn,
    fonts: meta.fonts.map((f) => ({ source: f.source, licence: f.licence })),
    statusBar: meta.statusBar,
    connectors: meta.connectors,
    ...(frame ? { frame } : null),
    ...(ornaments.length ? { ornaments } : null),
    // the render check measures the pack's own paint at rest: the app's motion is checked as numbers, and a run mid-measure would make the check flake
    ...(meta.motion && !candidate ? { motion: meta.motion } : null),
    // a candidate is the render check's: its script never runs there
    ...(meta.script && !candidate ? { script: meta.script } : null),
  };
}

const registered = new Set<string>();

/** Registers a checked pack like a built-in one: its id a pack, its card and Look layer where the theme resolution looks. */
function register(id: string, pack: Pack): boolean {
  const card = cardOf(id, pack.look);
  if (!card || !registerUserPack(id, async () => ({ default: pack }))) return false;
  sampleCards[card.id] = card;
  lookLayers[id] = layerOf(id, pack.look);
  return true;
}

/**
 * The loader's candidate path, for the render check's frame alone: a pack that is not stored, worn from the files the studio holds.
 * The frame is a page of its own, so this registers nothing in the studio or a kiosk. Returns the pack's id and the widget style
 * that wears it, or undefined for a pack the validator or the loader refuses.
 */
export function wearCandidate(src: PackSource): { id: string; style: Record<string, string> } | undefined {
  if (userPackIssues(src).some((i) => i.severity === "error")) return undefined;
  const pack = userPackOf(src, true);
  if (!register(pack.id, pack)) return undefined;
  registerUserLooks([pack.id]);
  return { id: pack.id, style: { lookId: pack.id, ...lookLayers[pack.id] } };
}

/**
 * Reads, validates and registers the user packs `only` names (every listed pack without it): its id becomes a Look id, the
 * pack loads like a built-in one, its card and Look layer are where the theme resolution looks. A pack with an error, or an
 * id a built-in Look has, is not registered and the Look it names is Classic. Returns the ids registered now.
 */
export async function registerUserPacks(only?: readonly string[]): Promise<string[]> {
  const ids = (only ?? (await listUserPacks()).map((p) => p.id)).filter((id) => USER_PACK_ID.test(id) && !registered.has(id) && !LOOK_IDS.includes(id));
  const done = await Promise.all(ids.map(async (id) => {
    const src = await readUserPack(id);
    if (userPackIssues(src, "route").some((i) => i.severity === "error")) return undefined;
    const pack = userPackOf(src);
    if (!register(id, pack)) return undefined;
    registered.add(id);
    return id;
  }));
  const loaded = done.flatMap((id) => id ?? []);
  registerUserLooks(loaded);
  return loaded;
}

/** Lets go of a pack (it was removed, or replaced and is read again). */
export function forgetUserPack(id: string): void {
  // a pack a later build's built-in shadows was never registered: the card and layer under that id are the built-in's
  if (LOOK_IDS.includes(id)) return;
  registered.delete(id);
  if (typeof document !== "undefined") for (const face of faces.get(id) ?? []) document.fonts.delete(face);
  faces.delete(id);
  unregisterUserPack(id);
  registerUserLooks([id], false);
  delete sampleCards[`look-${id}`];
  delete lookLayers[id];
}
