import { inlineCanvases, unresolvedCanvases } from "@/lib/canvas-store";
import { mergeConfig, type DashboardConfig } from "@/lib/layout";
import { isTauri, saveTextFile } from "@/lib/desktop";

const EXPORT_NAME = "infopanel-studio-config.json";

/** Tells the user why an import or export did not (fully) happen. */
export type ReportError = (message: string) => void;

/** A file the Export sheet writes: its name and exactly its text. "Copy JSON" copies `text` as it is. */
export interface FilePayload {
  name: string;
  text: string;
}

const listOf = (zones: string[]) => (zones.length > 3 ? `${zones.slice(0, 3).join(", ")} and ${zones.length - 3} more` : zones.join(", "));

/**
 * The config as `infopanel-studio-config.json`. The studio's config holds its canvases inline (lib/canvas-store),
 * so the file stands on its own; while a canvas zone has only its ref (the store could not give its canvas),
 * there is no payload and the error says which.
 */
export function configPayload(config: DashboardConfig): FilePayload | { error: string } {
  const missing = unresolvedCanvases(config);
  if (missing.length > 0) return { error: `Not exported: canvas not loaded for ${listOf(missing)}` };
  return { name: EXPORT_NAME, text: JSON.stringify(config, null, 2) };
}

/** Write a payload: a native dialog in the desktop app, a download in a browser. */
export function saveFilePayload({ name, text }: FilePayload): void {
  if (isTauri()) {
    saveTextFile(name, text).catch((err) => console.error(`Failed to export ${name}`, err));
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy a payload's text to the clipboard. */
export function copyPayload(payload: FilePayload): Promise<void> {
  return navigator.clipboard.writeText(payload.text);
}

/** Save the config as `infopanel-studio-config.json`; false (and `onError` says why) when it cannot be written. */
export function exportConfigFile(config: DashboardConfig, onError: ReportError = () => {}): boolean {
  const payload = configPayload(config);
  if ("error" in payload) {
    onError(payload.error);
    return false;
  }
  saveFilePayload(payload);
  return true;
}

/**
 * Parse config JSON into the migrated config. Its canvases stay inline (a copy of the server's config.json has refs:
 * they are loaded); the next push lifts them into the canvas store. `missing` names the zones whose ref could not be
 * loaded. A file that is not a config rejects with the reason.
 */
export async function readConfigText(text: string): Promise<{ config: DashboardConfig; missing: string[] }> {
  const parsed = JSON.parse(text) as Partial<DashboardConfig>;
  if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
    throw new Error("Missing profiles");
  }
  // mergeConfig runs the v1→v2 migration (explicit zone boxes, rows).
  const config = await inlineCanvases(mergeConfig(parsed));
  return { config, missing: unresolvedCanvases(config) };
}

/** The sentence for zones a restore could not load a canvas for. */
export const missingCanvases = (missing: string[]) => `no canvas could be loaded for ${listOf(missing)}`;
