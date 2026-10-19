/**
 * An image-sequence gauge as a file (`<name>.gauge-frames.zip`): its frames as PNG plus a
 * `manifest.json`. A `.gauge.json` holds a spec only, so this is how a sequence goes out and back in.
 */
import { sniff } from "@/lib/infopanel/assets/assets";
import { listEntries, readEntry, writeZip } from "@/lib/infopanel/zip";

export const FRAMES_FORMAT = "infopanel-gauge-frames";
export const FRAMES_VERSION = 1;

/** Caps on an imported zip: frames, one frame's bytes, all frames' bytes, the manifest. */
export const MAX_FRAMES = 512;
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;

const FRAME_NAME = /^frames\/[\w.-]+\.png$/;

export interface FramesManifest {
  format: typeof FRAMES_FORMAT;
  version: number;
  name: string;
  frameCount: number;
  /** The frames' zip entry names, in value order. */
  frames: string[];
  width: number;
  height: number;
  min: number;
  max: number;
  /** Frames a second (0: jump to the frame). */
  animationSpeed: number;
}

export interface FramesFile {
  name: string;
  min: number;
  max: number;
  animationSpeed: number;
  /** PNG bytes in value order. */
  frames: Uint8Array[];
}

const frameName = (i: number) => `frames/${String(i + 1).padStart(4, "0")}.png`;

/** The zip for `file`; a frame that is not a still PNG is refused. */
export function framesZip(file: FramesFile): Uint8Array {
  if (!file.frames.length) throw new Error("There are no frames to export");
  const sizes = file.frames.map((bytes, i) => {
    const s = sniff(bytes);
    if (s.type !== "png" || s.animated) throw new Error(`Frame ${i + 1} is not a PNG: only PNG frames can be exported`);
    return s;
  });
  const manifest: FramesManifest = {
    format: FRAMES_FORMAT,
    version: FRAMES_VERSION,
    name: file.name,
    frameCount: file.frames.length,
    frames: file.frames.map((_, i) => frameName(i)),
    width: sizes[0].width ?? 0,
    height: sizes[0].height ?? 0,
    min: file.min,
    max: file.max,
    animationSpeed: file.animationSpeed,
  };
  return writeZip([
    { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
    ...file.frames.map((data, i) => ({ name: manifest.frames[i], data })),
  ]);
}

const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Not a frames file: ${what} is not a number`);
  return v;
};

/** The manifest from untrusted JSON text. */
export function parseManifest(text: string): FramesManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a frames file: manifest.json is not JSON");
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.format !== FRAMES_FORMAT) throw new Error("Not a gauge frames file");
  if (r.version !== FRAMES_VERSION) throw new Error(`Frames file version ${String(r.version)} is not supported`);
  const frames = r.frames;
  if (!Array.isArray(frames) || !frames.every((f) => typeof f === "string" && FRAME_NAME.test(f))) throw new Error("Not a frames file: bad frame list");
  if (!frames.length || frames.length > MAX_FRAMES) throw new Error(`A frames file has 1 to ${MAX_FRAMES} frames, this one lists ${frames.length}`);
  if (r.frameCount !== frames.length) throw new Error(`The manifest says ${String(r.frameCount)} frames but lists ${frames.length}`);
  if (new Set(frames).size !== frames.length) throw new Error("Not a frames file: a frame is listed twice");
  return {
    format: FRAMES_FORMAT,
    version: FRAMES_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : "Image sequence",
    frameCount: frames.length,
    frames: frames as string[],
    width: num(r.width, "width"),
    height: num(r.height, "height"),
    min: num(r.min, "min"),
    max: num(r.max, "max"),
    animationSpeed: Math.max(0, num(r.animationSpeed, "animationSpeed")),
  };
}

/** Reads a `.gauge-frames.zip`; anything but the manifest and its PNG frames is refused. */
export async function readFramesZip(buf: Uint8Array): Promise<FramesFile> {
  const entries = listEntries(buf).filter((e) => !e.name.endsWith("/"));
  const manifestEntry = entries.find((e) => e.name === "manifest.json");
  if (!manifestEntry) throw new Error("Not a gauge frames file: manifest.json is missing");
  const manifest = parseManifest(new TextDecoder().decode(await readEntry(buf, manifestEntry, MAX_MANIFEST_BYTES)));
  const byName = new Map(entries.map((e) => [e.name, e]));
  const extra = entries.find((e) => e !== manifestEntry && !manifest.frames.includes(e.name));
  if (extra) throw new Error(`${extra.name} is not a listed frame: only PNG frames are accepted`);
  let total = 0;
  const frames: Uint8Array[] = [];
  for (const name of manifest.frames) {
    const entry = byName.get(name);
    if (!entry) throw new Error(`${name} is listed but missing from the zip`);
    const bytes = await readEntry(buf, entry, MAX_FRAME_BYTES);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw new Error(`The frames are over ${MAX_TOTAL_BYTES / 1024 / 1024} MB together`);
    const s = sniff(bytes);
    if (s.type !== "png" || s.animated) throw new Error(`${name} is not a still PNG`);
    frames.push(bytes);
  }
  return { name: manifest.name, min: manifest.min, max: manifest.max, animationSpeed: manifest.animationSpeed, frames };
}

/** A download name for an exported sequence. */
export const framesFileName = (name: string): string => `${name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "gauge"}.gauge-frames.zip`;
