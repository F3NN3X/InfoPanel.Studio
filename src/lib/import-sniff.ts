/**
 * What a file handed to the Import door is, read from its content and not only its name (PLAN decision 14):
 * a config backup, a Studio profile, an InfoPanel export or stored canvas, a gauge, a gauge frames zip,
 * an image, a video or a font. A `.zip` is told apart by what it holds. Pure; the door reads the bytes.
 */
import { FRAMES_FORMAT } from "@/lib/gauge-studio/frames-zip";
import { SPEC_FORMAT } from "@/lib/infopanel/gauges/spec-file";
import { FONT_FILE } from "@/lib/infopanel/font-requests";
import { listEntries, readEntry } from "@/lib/infopanel/zip";
import { classify, NOT_MEDIA, svgVars } from "@/lib/my-library/intake";

/** The `type` of a profile file, which tells it from a config file or any other JSON. */
export const PROFILE_FILE_TYPE = "infopanel-studio-profile";

export type ImportKind =
  | "config"
  | "profile"
  | "infopanel"
  | "canvas-zip"
  | "gauge"
  | "gauge-svg"
  | "frames-zip"
  | "image"
  | "video"
  | "font"
  | "fonts-zip"
  | "unknown";

export interface Sniffed {
  kind: ImportKind;
  /** The row's "Detected: …" text, or for an unknown file the error. */
  label: string;
  /** Why a recognised kind is refused (an image over 25 MB, an unsafe SVG); unknown otherwise. */
  reason?: string;
}

export const UNKNOWN_FILE = "We don't recognise this file.";

const LABEL: Record<Exclude<ImportKind, "unknown">, string> = {
  config: "Studio config backup",
  profile: "Studio screen",
  infopanel: "InfoPanel profile (.infopanel)",
  "canvas-zip": "Stored canvas (.canvas.zip)",
  gauge: "Gauge (.gauge.json)",
  "gauge-svg": "Gauge SVG template",
  "frames-zip": "Gauge frames (.zip)",
  image: "Image",
  video: "Video",
  font: "Font",
  "fonts-zip": "Fonts (.zip)",
};

const detected = (kind: Exclude<ImportKind, "unknown">): Sniffed => ({ kind, label: LABEL[kind] });
const unknown = (reason?: string): Sniffed => ({ kind: "unknown", label: reason ?? UNKNOWN_FILE, ...(reason ? { reason } : {}) });

/** The largest manifest a frames zip is read for. */
const MAX_MANIFEST = 256 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);
const looksJson = (b: Uint8Array) => {
  let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) i++;
  return b[i] === 0x7b;
};

/**
 * Whether a JSON document has a config's root shape: profiles that each have an id and their pages (or zones), and a
 * numeric version when it has one (the earliest configs had none; `mergeConfig` migrates them as version 0).
 */
export const looksLikeConfig = (json: Record<string, unknown>): boolean =>
  (json.version === undefined || typeof json.version === "number") &&
  Array.isArray(json.profiles) &&
  json.profiles.length > 0 &&
  json.profiles.every(
    (p) => isRecord(p) && typeof p.id === "string" && p.id !== "" && (Array.isArray(p.pages) || Array.isArray(p.placements) || Array.isArray(p.zones)),
  );

/** The kind a JSON document is, by its shape. */
function sniffJson(bytes: Uint8Array): Sniffed {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return unknown();
  }
  if (!isRecord(json)) return unknown();
  if (json.type === PROFILE_FILE_TYPE) return detected("profile");
  if (json.format === SPEC_FORMAT) return detected("gauge");
  if (looksLikeConfig(json)) return detected("config");
  // The bare profile "Copy profile JSON" used to give: pages or zones, a name and a size.
  if ((Array.isArray(json.pages) || Array.isArray(json.placements)) && typeof json.name === "string" && typeof json.width === "number" && typeof json.height === "number") {
    return detected("profile");
  }
  return unknown();
}

/** The kind a zip is, by its entries: a stored canvas, an InfoPanel export, a frames zip or a font pack. */
async function sniffZip(bytes: Uint8Array): Promise<Sniffed> {
  let entries;
  try {
    entries = listEntries(bytes).filter((e) => !e.name.endsWith("/") && !e.name.startsWith("__MACOSX/"));
  } catch {
    return unknown();
  }
  const has = (name: string) => entries.some((e) => e.name.toLowerCase() === name);
  if (has("canvas.json")) return detected("canvas-zip");
  const manifest = entries.find((e) => e.name === "manifest.json");
  if (manifest) {
    try {
      const m: unknown = JSON.parse(new TextDecoder().decode(await readEntry(bytes, manifest, MAX_MANIFEST)));
      if (isRecord(m) && m.format === FRAMES_FORMAT) return detected("frames-zip");
    } catch {
      // Not a frames manifest: the other rules below.
    }
  }
  if (entries.some((e) => /(^|\/)profile\.xml$/i.test(e.name))) return detected("infopanel");
  if (entries.some((e) => FONT_FILE.test(e.name))) return detected("fonts-zip");
  return unknown();
}

/** What `name` holding `bytes` is. `type` is the browser's MIME guess, used only where the bytes don't say. */
export async function sniffFile(name: string, type: string, bytes: Uint8Array): Promise<Sniffed> {
  if (/\.infopanel$/i.test(name)) return detected("infopanel");
  if (isZip(bytes)) return sniffZip(bytes);
  if (looksJson(bytes)) return sniffJson(bytes);
  const intake = classify(name, type, bytes);
  if (!intake.ok) return unknown(intake.reason === NOT_MEDIA ? undefined : intake.reason);
  // classify names a profile by its extension, which is handled above.
  if (intake.kind === "infopanel") return detected("infopanel");
  if (intake.kind === "svg") return detected(svgVars(new TextDecoder().decode(bytes)).length > 0 ? "gauge-svg" : "image");
  return detected(intake.kind);
}

export type DestinationId = "replace" | "add-screens" | "new-screen" | "canvas-zone" | "library";

export interface Destination {
  id: DestinationId;
  title: string;
  text: string;
}

const LIBRARY: Record<"gauge" | "gauge-svg" | "frames-zip" | "image" | "video" | "font" | "fonts-zip", Destination> = {
  gauge: { id: "library", title: "Library › Gauges", text: "Saved as a gauge you can edit and place" },
  "gauge-svg": { id: "library", title: "Library › Gauges", text: "Saved as an SVG gauge you can edit and place" },
  "frames-zip": { id: "library", title: "Library › Gauges", text: "Saved as an image-sequence gauge" },
  image: { id: "library", title: "Library › Media", text: "Saved to your library as an image" },
  video: { id: "library", title: "Library › Media", text: "Saved to your library as a video" },
  font: { id: "library", title: "Library › Fonts", text: "Saved to your library as a font" },
  "fonts-zip": { id: "library", title: "Library › Fonts", text: "Every font in the zip is saved to your library" },
};

/** Where a kind of file can go; the first is the default. Empty for a file the door refuses. */
export function destinationsOf(kind: ImportKind, current: { screen: string; page: string }): Destination[] {
  switch (kind) {
    case "config":
      return [
        { id: "replace", title: "Replace everything", text: "Every screen, theme, alert and setting becomes the file's" },
        { id: "add-screens", title: "Add its screens only", text: "Keeps what you have; the file's screens are added as new screens" },
      ];
    case "profile":
      return [{ id: "new-screen", title: "New screen", text: "Added beside your screens, with its pages and its own look" }];
    case "infopanel":
    case "canvas-zip":
      return [
        { id: "new-screen", title: "New screen", text: "One page per canvas, the canvas filling it" },
        { id: "canvas-zone", title: `Canvas zone on “${current.page}”`, text: `Sits beside the widgets on ${current.screen}` },
      ];
    case "unknown":
      return [];
    default:
      return [LIBRARY[kind]];
  }
}
