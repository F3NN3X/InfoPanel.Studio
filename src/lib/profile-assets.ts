/**
 * The images a profile file carries (pinned layer P5, decision 9): a screen's images (rail icons and logos, backgrounds,
 * a Status Bar logo) live in the asset store and the profile names them by id. On export the images it names are written
 * into the file as base64, smallest first, while the file stays within the import's 5 MB; on import each goes through the
 * server's upload (which sniffs it and sanitises an SVG), and the profile is pointed at the id it got. Videos and fonts
 * stay out: they are too big for a file the import reads whole.
 */
import { uploadBytes } from "./assets";

/** An image in a profile file: its asset id where it was exported, its type, and its bytes as base64. */
export interface BundledAsset {
  id: string;
  type: string;
  data: string;
}

/** The image types a profile file carries, by the extension of an asset id. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/** An image asset's id: 64 lowercase hex digits and an image extension, not part of a longer run. */
const IMAGE_ID = /(?<![0-9a-f])[0-9a-f]{64}\.(png|jpg|gif|webp|avif|bmp|ico|svg)(?![a-z0-9])/g;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The image assets a profile names (in a URL, an icon or a setting), each once, in order. */
export function profileAssetIds(profile: unknown): string[] {
  return [...new Set(JSON.stringify(profile).match(IMAGE_ID) ?? [])];
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
};
const fromBase64 = (data: string): Uint8Array => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

/** An asset's bytes from the server, or undefined when it is gone. */
async function readAsset(id: string): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(`/api/assets/${encodeURIComponent(id)}`);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

/** What an image costs in the file's text besides its base64: its id, type and the JSON around them. */
const ENTRY_COST = 120;

/**
 * The images `ids` names, as a file carries them, within `budget` characters of the file's text: the smallest first, so
 * the most icons fit. `left` counts the ones left out (gone from the server, or past the budget).
 */
export async function bundleAssets(ids: readonly string[], budget: number, read: (id: string) => Promise<Uint8Array | undefined> = readAsset): Promise<{ assets: BundledAsset[]; left: number }> {
  const found = (await Promise.all(ids.map(async (id) => ({ id, bytes: await read(id) })))).filter((a): a is { id: string; bytes: Uint8Array } => a.bytes !== undefined);
  let room = budget;
  const assets: BundledAsset[] = [];
  for (const { id, bytes } of found.sort((a, b) => a.bytes.length - b.bytes.length)) {
    const cost = Math.ceil(bytes.length / 3) * 4 + ENTRY_COST;
    if (cost > room) continue;
    room -= cost;
    assets.push({ id, type: IMAGE_TYPES[id.slice(65)], data: toBase64(bytes) });
  }
  return { assets: assets.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)), left: ids.length - assets.length };
}

/** A file's `assets`, guarded: an entry with an image id, the type its extension names and base64 data; anything else is dropped. */
export function readBundled(raw: unknown): BundledAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): BundledAsset[] => {
    if (typeof a !== "object" || a === null) return [];
    const { id, type, data } = a as Record<string, unknown>;
    if (typeof id !== "string" || typeof data !== "string" || !new RegExp(`^${IMAGE_ID.source}$`).test(id) || type !== IMAGE_TYPES[id.slice(65)] || !BASE64.test(data)) return [];
    return [{ id, type, data }];
  });
}

/**
 * The file's images stored on this server and `profile` pointed at the ids they got (the same, unless the server's copy
 * differs: an SVG it sanitised). Only images the profile names are stored. `failed` counts the ones the server refused;
 * the profile keeps their old ids, which draw nothing here.
 */
export async function restoreAssets<T>(profile: T, assets: readonly BundledAsset[], upload: typeof uploadBytes = uploadBytes): Promise<{ profile: T; failed: number }> {
  const named = new Set(profileAssetIds(profile));
  let text = JSON.stringify(profile);
  let failed = 0;
  for (const a of assets.filter((x) => named.has(x.id))) {
    try {
      const stored = await upload(fromBase64(a.data), a.type);
      if (stored.id !== a.id) text = text.split(a.id).join(stored.id);
    } catch {
      failed++;
    }
  }
  return { profile: JSON.parse(text) as T, failed };
}
