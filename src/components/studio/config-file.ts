import { mergeConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { isTauri, openTextFile, saveTextFile } from "@/lib/desktop";

const EXPORT_NAME = "infopanel-studio-config.json";

/** Copy one profile (zones, style) to the clipboard as JSON. */
export function copyProfileJson(profile: MonitorProfile): Promise<void> {
  return navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
}

/** Save the config as `infopanel-studio-config.json`: a native dialog in the desktop app, a download in a browser. */
export function exportConfigFile(config: DashboardConfig): void {
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

/** Parse config JSON and hand the migrated config to `onLoad`. */
export function importConfigText(text: string, onLoad: (config: DashboardConfig) => void): void {
  try {
    const parsed = JSON.parse(text) as Partial<DashboardConfig>;
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      throw new Error("Missing profiles");
    }
    // mergeConfig runs the v1→v2 migration (explicit zone boxes, rows).
    onLoad(mergeConfig(parsed));
  } catch (err) {
    console.error("Failed to import dashboard config", err);
  }
}

/** Read a config file and hand the migrated config to `onLoad`. */
export function importConfigFile(
  file: File,
  onLoad: (config: DashboardConfig) => void
): void {
  file.text().then((text) => importConfigText(text, onLoad));
}

/**
 * Begin an import: the native open dialog in the desktop app, else the hidden file input
 * (whose change handler calls `importConfigFile`). Either way `onLoad` is one config change.
 */
export function startConfigImport(
  input: HTMLInputElement | null,
  onLoad: (config: DashboardConfig) => void
): void {
  if (!isTauri()) {
    input?.click();
    return;
  }
  openTextFile()
    .then((text) => {
      if (text !== null) importConfigText(text, onLoad);
    })
    .catch((err) => console.error("Failed to import dashboard config", err));
}
