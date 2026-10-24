/**
 * Media uploaded to the dashboard server (ips-server's assets.rs): images and
 * videos stored by content hash and served at `/api/assets/<id>`, so
 * every view of the dashboard — the kiosk's WebView2 included — loads
 * them from the server rather than from browser storage.
 */

export const ASSETS_URL = "/api/assets";

export type AssetKind = "image" | "video";

export interface Asset {
  id: string;
  /** Same-origin URL to use as a `src`. */
  url: string;
  /** MIME type (sniffed from the file by the server). */
  type: string;
  kind: AssetKind;
  size: number;
  /** Upload time, ms since the epoch. */
  mtime: number;
}

/** The server's upload limits, checked here first for a quicker answer. */
export const ASSET_LIMITS: Record<AssetKind, number> = {
  image: 25 * 1024 * 1024,
  video: 300 * 1024 * 1024,
};

/** Accepted MIME types per kind (the `accept` of a file input). */
export const ASSET_TYPES: Record<AssetKind, readonly string[]> = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"],
  video: ["video/mp4", "video/webm", "video/x-matroska"],
};

// The type of a file the browser leaves untyped (Windows often does for
// .webm and .mkv), from its extension. The server still sniffs the bytes.
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

/** The `accept` of a file input for a kind: its types and extensions. */
export function acceptOf(kind: AssetKind): string {
  const exts = Object.keys(EXTENSION_TYPES).filter((e) => ASSET_TYPES[kind].includes(EXTENSION_TYPES[e]));
  return [...ASSET_TYPES[kind], ...exts.map((e) => `.${e}`)].join(",");
}

/** A file's MIME type: the browser's, else guessed from its name. */
export function fileType(file: Pick<File, "name" | "type">): string {
  if (assetKind(file.type)) return file.type;
  return EXTENSION_TYPES[/.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() ?? ""] ?? file.type;
}

/** An upload or library request that failed, with a message for the user. */
export class AssetError extends Error {}

/** The kind of an accepted MIME type, or undefined. */
export function assetKind(mime: string): AssetKind | undefined {
  return (Object.keys(ASSET_TYPES) as AssetKind[]).find((k) => ASSET_TYPES[k].includes(mime));
}

/** "1.2 MB" style size. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const TOO_LARGE = `Too large: images up to ${formatBytes(ASSET_LIMITS.image)}, videos up to ${formatBytes(ASSET_LIMITS.video)}.`;
const UNSUPPORTED = "Unsupported file: use PNG, JPEG, GIF, WebP or AVIF images, MP4, WebM or MKV videos.";

/** The message for a failed asset request's HTTP status. */
export function assetErrorMessage(status: number): string {
  switch (status) {
    case 413:
      return TOO_LARGE;
    case 415:
      return UNSUPPORTED;
    case 403:
      return "The server only accepts uploads from its own computer (start it with ALLOW_REMOTE_UPLOAD=1 to allow others).";
    case 404:
      return "That file is no longer on the server.";
    default:
      return `The server refused the request (${status}).`;
  }
}

/** The asset id in a URL that points at one, or undefined. */
export function assetIdOf(url: string | undefined): string | undefined {
  return url ? /\/api\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/.exec(url)?.[1] : undefined;
}

// A server started before uploads existed answers 404 to them.
const OUTDATED = "This dashboard server can't take uploads yet: restart it (close it and run start-dashboard.bat again).";

async function request(input: string, init?: RequestInit, messages: Record<number, string> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new AssetError("The dashboard server could not be reached.");
  }
  if (!res.ok) throw new AssetError(messages[res.status] ?? assetErrorMessage(res.status));
  return res;
}

// Required on writes: a custom header makes a cross-site request preflight,
// which the server never allows.
const WRITE_HEADERS = { "X-Dashboard-Asset": "1" };

/**
 * Upload a file; resolves with the stored asset (deduplicated by content).
 * With `expected`, a file of the other kind is refused before it is sent.
 */
export async function uploadAsset(
  file: File,
  expected?: AssetKind
): Promise<Pick<Asset, "id" | "url" | "type" | "size">> {
  const type = fileType(file);
  const kind = assetKind(type);
  if (!kind) throw new AssetError(UNSUPPORTED);
  if (expected && kind !== expected) {
    throw new AssetError(
      expected === "image"
        ? "This field takes an image (PNG, JPEG, GIF, WebP or AVIF), not a video."
        : "This field takes a video (MP4, WebM or MKV), not an image."
    );
  }
  if (file.size > ASSET_LIMITS[kind]) throw new AssetError(TOO_LARGE);
  const res = await request(
    ASSETS_URL,
    { method: "POST", headers: { ...WRITE_HEADERS, "Content-Type": type }, body: file },
    { 404: OUTDATED, 405: OUTDATED }
  );
  return (await res.json()) as Pick<Asset, "id" | "url" | "type" | "size">;
}

/** Tries of an upload the server turns away as busy (429: it runs two at a time). */
const BUSY_TRIES = 6;

/** Uploads in flight at once: the server takes two, so a burst (87 baked frames) queues here instead of being refused. */
const UPLOAD_SLOTS = 2;
let uploading = 0;
const queued: (() => void)[] = [];

/** `run` once one of the upload slots is free. */
async function inSlot<T>(run: () => Promise<T>): Promise<T> {
  if (uploading >= UPLOAD_SLOTS) await new Promise<void>((r) => queued.push(r));
  uploading++;
  try {
    return await run();
  } finally {
    uploading--;
    queued.shift()?.();
  }
}

/**
 * Upload bytes of a known type (an imported profile's asset, a font, an SVG): the
 * server sniffs them and refuses a mismatch. Resolves with the stored asset id and URL.
 * A busy server (429) is asked again after a growing pause; at most two uploads run at once.
 */
export async function uploadBytes(
  bytes: Uint8Array,
  mime: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<Pick<Asset, "id" | "url" | "type" | "size">> {
  const body = new Blob([bytes.slice()], { type: mime });
  return inSlot(async () => {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(ASSETS_URL, { method: "POST", headers: { ...WRITE_HEADERS, "Content-Type": mime }, body });
      } catch {
        throw new AssetError("The dashboard server could not be reached.");
      }
      if (res.status === 429 && attempt < BUSY_TRIES) {
        await wait(250 * attempt);
        continue;
      }
      if (!res.ok) {
        const messages: Record<number, string> = { 404: OUTDATED, 405: OUTDATED, 415: "The server does not take this file type.", 429: "The server stayed busy: try again." };
        throw new AssetError(messages[res.status] ?? assetErrorMessage(res.status));
      }
      return (await res.json()) as Pick<Asset, "id" | "url" | "type" | "size">;
    }
  });
}

/** Every uploaded asset, newest first. */
export async function listAssets(): Promise<Asset[]> {
  const res = await request(ASSETS_URL, { cache: "no-store" });
  return (await res.json()) as Asset[];
}

/** The assets the saved config does not refer to. */
export async function unusedAssets(): Promise<Asset[]> {
  const res = await request(`${ASSETS_URL}?unused=1`, { cache: "no-store" });
  return (await res.json()) as Asset[];
}

export async function deleteAsset(id: string): Promise<void> {
  await request(`${ASSETS_URL}/${encodeURIComponent(id)}`, { method: "DELETE", headers: WRITE_HEADERS });
}
