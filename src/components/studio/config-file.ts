import { inlineCanvases, unresolvedCanvases } from "@/lib/canvas-store";
import { looksLikeConfig } from "@/lib/import-sniff";
import { CONFIG_VERSION, readImportedConfig, type DashboardConfig } from "@/lib/layout";
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

/** Write a payload: a native dialog in the desktop app, a download in a browser. Resolves to false when the user cancels the dialog or the write fails. */
export async function saveFilePayload({ name, text }: FilePayload): Promise<boolean> {
  if (isTauri()) {
    try {
      return await saveTextFile(name, text);
    } catch (err) {
      console.error(`Failed to export ${name}`, err);
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Copy a payload's text to the clipboard. */
export function copyPayload(payload: FilePayload): Promise<void> {
  return navigator.clipboard.writeText(payload.text);
}

/** Save the config as `infopanel-studio-config.json`; false (and `onError` says why) when it cannot be written, or when the Save As is cancelled. */
export async function exportConfigFile(config: DashboardConfig, onError: ReportError = () => {}): Promise<boolean> {
  const payload = configPayload(config);
  if ("error" in payload) {
    onError(payload.error);
    return false;
  }
  return saveFilePayload(payload);
}

/**
 * Parse config JSON into the migrated config. Its canvases stay inline (a copy of the server's config.json has refs:
 * they are loaded); the next push lifts them into the canvas store. `missing` names the zones whose ref could not be
 * loaded. A file that is not a config rejects with the reason.
 */
export async function readConfigText(text: string): Promise<{ config: DashboardConfig; missing: string[] }> {
  const parsed = (JSON.parse(text) ?? {}) as Partial<DashboardConfig>;
  if (!looksLikeConfig(parsed)) {
    throw new Error("Not a Studio config: it needs a version and screens with ids and pages");
  }
  if ((parsed.version as number) > CONFIG_VERSION) throw new Error("This config is from a newer version of InfoPanel Studio");
  // A file goes through the upgrade, whatever version it says (readImportedConfig).
  const config = await inlineCanvases(await readImportedConfig(parsed));
  return { config, missing: unresolvedCanvases(config) };
}

/** The sentence for zones a restore could not load a canvas for. */
export const missingCanvases = (missing: string[]) => `no canvas could be loaded for ${listOf(missing)}`;
