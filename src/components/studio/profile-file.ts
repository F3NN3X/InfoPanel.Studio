import { unresolvedCanvases } from "@/lib/canvas-store";
import { CONFIG_VERSION, mergeConfig, type DashboardConfig, type MonitorProfile, type Placement, type StoredProfile } from "@/lib/layout";
import { PROFILE_FILE_TYPE } from "@/lib/import-sniff";
import { saveFilePayload, type FilePayload, type ReportError } from "./config-file";
import { uniqueProfileName, withFreshIds } from "./profile-actions";

/** The `type` of a profile file, which tells it from a config file or any other JSON. */
export { PROFILE_FILE_TYPE };
const PROFILE_FILE_VERSION = 1;

/** A profile file: one profile with the config version it was saved under, so an old one migrates on import. */
interface ProfileFile {
  type: typeof PROFILE_FILE_TYPE;
  version: typeof PROFILE_FILE_VERSION;
  configVersion: number;
  profile: MonitorProfile;
}

/** The profile as the text of a profile file. */
export function profileFileText(profile: MonitorProfile): string {
  const file: ProfileFile = { type: PROFILE_FILE_TYPE, version: PROFILE_FILE_VERSION, configVersion: CONFIG_VERSION, profile };
  return JSON.stringify(file, null, 2);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A profile file's largest size; a bigger one is refused before it is parsed. */
const MAX_PROFILE_FILE_BYTES = 5 * 1024 * 1024;
const TOO_BIG = "Not imported: the file is over 5 MB";
const MAX_SIZE_PX = 20000;
// The grid limits the studio itself enforces (studio-actions changeCols / changeRows).
const COLS = [2, 24] as const;
const ROWS = [1, 24] as const;

/** The fields of a profile the app knows (MonitorProfile, and the legacy ones a migration reads); anything else is not imported. */
const PROFILE_KEYS = [
  "id", "name", "width", "height", "cols", "rows", "fit", "pages", "placements", "rotate", "widgetTheme", "background",
  "theme", "radius", "gap", "padding", "island", "performance", "font", "sampleVersion", "style", "styleEnforce",
] as const;
/** The fields of a page (ProfilePage). */
const PAGE_KEYS = ["id", "name", "icon", "placements", "widgetTheme"] as const;

const pick = (from: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));

/** Placements of a canvas that lives only in the sender's canvas store (a ref, no canvas): this machine can't load them. */
const hasOnlyCanvasRef = (p: unknown): boolean => isRecord(p) && p.canvas === undefined && typeof p.canvasRef === "string";

/**
 * The profile a file holds, normalised and migrated like a config's: the profile file, or the bare
 * profile "Copy profile JSON" gives (taken as the current config version). Anything else, a file over
 * 5 MB, or a profile with no name, a bad size or a grid outside the studio's limits, is an error with
 * the reason. Only the app's known profile and page fields are kept. Canvas zones holding only a ref
 * are dropped (`skippedCanvases` counts them). Ids are the file's own: see `importedProfile`.
 */
export function parseProfileFile(text: string): { profile: MonitorProfile; skippedCanvases: number } | { error: string } {
  if (text.length > MAX_PROFILE_FILE_BYTES) return { error: TOO_BIG };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "Not a profile file: it is not valid JSON" };
  }
  if (!isRecord(json)) return { error: "Not a profile file" };
  const enveloped = json.type === PROFILE_FILE_TYPE;
  if (enveloped && (typeof json.version !== "number" || json.version > PROFILE_FILE_VERSION)) {
    return { error: "This profile file is from a newer version of InfoPanel Studio" };
  }
  const raw = enveloped ? json.profile : json;
  const version = enveloped && typeof json.configVersion === "number" ? json.configVersion : CONFIG_VERSION;
  if (version > CONFIG_VERSION) return { error: "This profile is from a newer version of InfoPanel Studio" };
  if (!isRecord(raw) || !(Array.isArray(raw.pages) || Array.isArray(raw.placements))) {
    return { error: "Not a profile file: no pages found" };
  }
  if (typeof raw.name !== "string" || raw.name.trim() === "" || !isInt(raw.width, 1, MAX_SIZE_PX) || !isInt(raw.height, 1, MAX_SIZE_PX)) {
    return { error: "Not a profile file: it needs a name and a size" };
  }
  if ((raw.cols !== undefined && !isInt(raw.cols, ...COLS)) || (raw.rows !== undefined && !isInt(raw.rows, ...ROWS))) {
    return { error: `Not a profile file: the grid must be ${COLS[0]}–${COLS[1]} columns and ${ROWS[0]}–${ROWS[1]} rows` };
  }
  let skippedCanvases = 0;
  const keepable = (list: unknown): unknown => {
    if (!Array.isArray(list)) return list;
    const kept = list.filter((p) => !hasOnlyCanvasRef(p));
    skippedCanvases += list.length - kept.length;
    return kept as Placement[];
  };
  const picked = pick(raw, PROFILE_KEYS);
  if (picked.fit !== "fill" && picked.fit !== "scroll") delete picked.fit;
  if (Array.isArray(picked.pages)) {
    picked.pages = picked.pages.map((pg) => {
      if (!isRecord(pg)) return pg;
      const page = pick(pg, PAGE_KEYS);
      return page.placements === undefined ? page : { ...page, placements: keepable(page.placements) };
    });
  }
  if (picked.placements !== undefined) picked.placements = keepable(picked.placements);
  try {
    const [profile] = mergeConfig({ version, profiles: [picked as unknown as StoredProfile] }).profiles;
    return { profile, skippedCanvases };
  } catch {
    return { error: "Not a profile file: it could not be read" };
  }
}

/** `profile` as a new profile of `config`: fresh ids and a name no other profile has. */
export function importedProfile(config: DashboardConfig, profile: MonitorProfile): MonitorProfile {
  return { ...withFreshIds(profile), name: uniqueProfileName(config.profiles, profile.name) };
}

const fileName = (name: string) => `${name.replace(/[\\/:*?"<>|]/g, "_").trim() || "profile"}.json`;

/**
 * One profile as `‹name›.json`: the profile file's envelope, which is also what "Copy JSON" copies. A profile whose
 * canvas zone has only its ref (see `configPayload`) has no payload; the error says so.
 */
export function screenPayload(config: DashboardConfig, profile: MonitorProfile): FilePayload | { error: string } {
  if (unresolvedCanvases({ ...config, profiles: [profile] }).length > 0) return { error: "Not exported: a canvas in this profile is not loaded" };
  return { name: fileName(profile.name), text: profileFileText(profile) };
}

/** Save one profile as `‹name›.json`; `onError` says why when it cannot be written. */
export function exportProfileFile(config: DashboardConfig, profile: MonitorProfile, onError: ReportError = () => {}): void {
  const payload = screenPayload(config, profile);
  if ("error" in payload) onError(payload.error);
  else void saveFilePayload(payload);
}
