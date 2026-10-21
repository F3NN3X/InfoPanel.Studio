import { unresolvedCanvases } from "@/lib/canvas-store";
import { CONFIG_VERSION, mergeConfig, type DashboardConfig, type MonitorProfile, type StoredProfile } from "@/lib/layout";
import { isTauri, openTextFile, saveTextFile } from "@/lib/desktop";
import type { ReportError } from "./config-file";
import { uniqueProfileName, withFreshIds } from "./profile-actions";

/** The `type` of a profile file, which tells it from a config file or any other JSON. */
export const PROFILE_FILE_TYPE = "infopanel-studio-profile";
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
const isSize = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 1;

/**
 * The profile a file holds, normalised and migrated like a config's: the profile file, or the bare
 * profile "Copy profile JSON" gives (taken as the current config version). Anything else, or a
 * profile that has no name or size, is an error with the reason. Ids are the file's own: see `importedProfile`.
 */
export function parseProfileFile(text: string): { profile: MonitorProfile } | { error: string } {
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
  if (typeof raw.name !== "string" || raw.name.trim() === "" || !isSize(raw.width) || !isSize(raw.height)) {
    return { error: "Not a profile file: it needs a name and a size" };
  }
  try {
    const [profile] = mergeConfig({ version, profiles: [raw as unknown as StoredProfile] }).profiles;
    return { profile };
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
 * Save one profile as `‹name›.json`: a native dialog in the desktop app, a download in a browser.
 * A profile whose canvas zone has only its ref (see `exportConfigFile`) is not written; `onError` says so.
 */
export function exportProfileFile(config: DashboardConfig, profile: MonitorProfile, onError: ReportError = () => {}): void {
  if (unresolvedCanvases({ ...config, profiles: [profile] }).length > 0) {
    onError("Not exported: a canvas in this profile is not loaded");
    return;
  }
  const text = profileFileText(profile);
  const name = fileName(profile.name);
  if (isTauri()) {
    saveTextFile(name, text).catch((err) => console.error("Failed to export profile", err));
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a profile file and hand the profile to `onLoad`, or the reason it is not one to `onError`. */
export function loadProfileText(text: string, onLoad: (profile: MonitorProfile) => void, onError: ReportError): void {
  const parsed = parseProfileFile(text);
  if ("error" in parsed) onError(parsed.error);
  else onLoad(parsed.profile);
}

/** Read a picked file (the hidden input's change handler). */
export function importProfileFile(file: File, onLoad: (profile: MonitorProfile) => void, onError: ReportError): void {
  file.text().then(
    (text) => loadProfileText(text, onLoad, onError),
    () => onError("Not imported: the file could not be read")
  );
}

/** Begin an import: the native open dialog in the desktop app, else the hidden file input. */
export function startProfileImport(
  input: HTMLInputElement | null,
  onLoad: (profile: MonitorProfile) => void,
  onError: ReportError
): void {
  if (!isTauri()) {
    input?.click();
    return;
  }
  openTextFile()
    .then((text) => {
      if (text !== null) loadProfileText(text, onLoad, onError);
    })
    .catch((err) => console.error("Failed to import profile", err));
}
