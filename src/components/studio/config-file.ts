import { inlineCanvases, unresolvedCanvases } from "@/lib/canvas-store";
import { mergeConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { isTauri, openTextFile, saveTextFile } from "@/lib/desktop";

const EXPORT_NAME = "infopanel-studio-config.json";

/** Copy one profile (zones, style) to the clipboard as JSON. */
export function copyProfileJson(profile: MonitorProfile): Promise<void> {
  return navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
}

/** Tells the user why an import or export did not (fully) happen. */
export type ReportError = (message: string) => void;

const listOf = (zones: string[]) => (zones.length > 3 ? `${zones.slice(0, 3).join(", ")} and ${zones.length - 3} more` : zones.join(", "));

/**
 * Save the config as `infopanel-studio-config.json`: a native dialog in the desktop app, a download in a browser.
 * The studio's config holds its canvases inline (lib/canvas-store), so the file stands on its own; while a
 * canvas zone has only its ref (the store could not give its canvas), nothing is written and `onError` says which.
 */
export function exportConfigFile(config: DashboardConfig, onError: ReportError = () => {}): void {
  const missing = unresolvedCanvases(config);
  if (missing.length > 0) {
    onError(`Not exported: canvas not loaded for ${listOf(missing)}`);
    return;
  }
  const json = JSON.stringify(config, null, 2);
  if (isTauri()) {
    saveTextFile(EXPORT_NAME, json).catch((err) => console.error("Failed to export dashboard config", err));
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = EXPORT_NAME;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse config JSON and hand the migrated config to `onLoad`. Its canvases stay inline
 * (a copy of the server's config.json has refs: they are loaded); the next push lifts
 * them into the canvas store. A failure, or refs whose canvas can't be loaded (the zones
 * are named), goes to `onError`.
 */
export function importConfigText(text: string, onLoad: (config: DashboardConfig) => void, onError: ReportError = () => {}): void {
  const failed = (err: unknown) => {
    console.error("Failed to import dashboard config", err);
    onError(`Not imported: ${err instanceof Error ? err.message : String(err)}`);
  };
  try {
    const parsed = JSON.parse(text) as Partial<DashboardConfig>;
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      throw new Error("Missing profiles");
    }
    // mergeConfig runs the v1→v2 migration (explicit zone boxes, rows).
    inlineCanvases(mergeConfig(parsed)).then((config) => {
      onLoad(config);
      const missing = unresolvedCanvases(config);
      if (missing.length > 0) onError(`Imported, but no canvas could be loaded for ${listOf(missing)}`);
    }, failed);
  } catch (err) {
    failed(err);
  }
}

/** Read a config file and hand the migrated config to `onLoad`. */
export function importConfigFile(
  file: File,
  onLoad: (config: DashboardConfig) => void,
  onError: ReportError = () => {}
): void {
  file.text().then((text) => importConfigText(text, onLoad, onError));
}

/**
 * Begin an import: the native open dialog in the desktop app, else the hidden file input
 * (whose change handler calls `importConfigFile`). Either way `onLoad` is one config change.
 */
export function startConfigImport(
  input: HTMLInputElement | null,
  onLoad: (config: DashboardConfig) => void,
  onError: ReportError = () => {}
): void {
  if (!isTauri()) {
    input?.click();
    return;
  }
  openTextFile()
    .then((text) => {
      if (text !== null) importConfigText(text, onLoad, onError);
    })
    .catch((err) => console.error("Failed to import dashboard config", err));
}
