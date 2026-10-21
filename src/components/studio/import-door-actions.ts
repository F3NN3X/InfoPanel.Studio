/**
 * What the Import door does with the files it detected (SPEC §9.1): restore a config backup, add a screen from a
 * profile file, put Library files in My library, and hand an InfoPanel file to the wizard. The door's UI only
 * collects the choices; everything that changes the dashboard happens here.
 */
import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import type { ImportKind, Sniffed } from "@/lib/import-sniff";
import type { LibraryItem } from "@/lib/library";
import { missingCanvases, readConfigText } from "./config-file";
import { importToLibrary, LIBRARY_KINDS, type DoorGoto } from "./import-door-library";
import { importedProfile, parseProfileFile } from "./profile-file";

export interface DoorFile {
  id: number;
  file: File;
  /** Null while the file is being read. */
  sniffed: Sniffed | null;
}

/** The radio cards and checkboxes of the door. */
export interface DoorChoices {
  config: "replace" | "add-screens";
  /** Where an `.infopanel` or stored canvas lands. */
  canvas: "new-screen" | "canvas-zone";
  /** "Back up the current dashboard first (recommended)": the Replace everything path writes the backup file first. */
  backupFirst: boolean;
  /** "Also use ‹file› as the background for ‹screen›". */
  asBackground: boolean;
}

export const DEFAULT_CHOICES: DoorChoices = { config: "replace", canvas: "new-screen", backupFirst: true, asBackground: false };

export interface DoorContext {
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** Add a profile made from a file and edit it. */
  addScreen: (profile: MonitorProfile) => void;
  /** Write the current dashboard as a backup file; false when it cannot be written (a canvas that is not loaded) or the Save As is cancelled. */
  backup: (config: DashboardConfig) => Promise<boolean>;
  /** An imported image or video as the background of the edited screen. */
  useAsBackground: (item: LibraryItem) => void;
}

export type DoorGo = { to: "screens" } | DoorGoto;

export interface RunResult {
  done: string[];
  failed: string[];
  go: DoorGo | null;
  /** An InfoPanel file for the wizard, and where it lands. */
  wizard: { file: File; dest: "new" | "zone" } | null;
  /** Library items were added: the Library page reloads. */
  libraryChanged: boolean;
}

/**
 * The file's config, either replacing `current` or adding its screens to it. A replace waits for the backup to be
 * written first (unless `backupFirst` is off) and gives up, leaving `current` alone, when it is not: the desktop Save As
 * is a dialog the user can cancel.
 */
export async function restoreConfig(
  text: string,
  o: { current: DashboardConfig; mode: DoorChoices["config"]; backupFirst: boolean; backup: DoorContext["backup"] },
): Promise<{ config: DashboardConfig; missing: string[]; backedUp: boolean }> {
  const read = await readConfigText(text);
  if (o.mode === "add-screens") {
    const config = read.config.profiles.reduce(
      (acc, p) => ({ ...acc, profiles: [...acc.profiles, importedProfile(acc, p)] }),
      o.current,
    );
    return { config, missing: read.missing, backedUp: false };
  }
  if (o.backupFirst && !(await o.backup(o.current))) {
    throw new Error("the current dashboard could not be backed up first (the Save As was cancelled or failed), so nothing was replaced. Untick the backup box to replace without one");
  }
  return { config: read.config, missing: read.missing, backedUp: o.backupFirst };
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const kindOf = (f: DoorFile): ImportKind => f.sniffed?.kind ?? "unknown";

/** Carry out the door's import. A file that fails is reported and the others go on. */
export async function runImport(files: readonly DoorFile[], choices: DoorChoices, ctx: DoorContext): Promise<RunResult> {
  const result: RunResult = { done: [], failed: [], go: null, wizard: null, libraryChanged: false };
  let working = ctx.config;

  const configs = files.filter((f) => kindOf(f) === "config");
  const wizards = files.filter((f) => kindOf(f) === "infopanel" || kindOf(f) === "canvas-zip");
  // A restore and a wizard each take the whole window: the first goes, the rest wait for their own turn.
  for (const f of [...configs.slice(1), ...wizards.slice(1)]) result.failed.push(`${f.file.name}: import this one on its own`);

  for (const f of files.filter((x) => x.sniffed?.kind === "unknown")) result.failed.push(`${f.file.name}: ${f.sniffed!.label}`);

  if (configs[0]) {
    const f = configs[0];
    try {
      const r = await restoreConfig(await f.file.text(), { current: working, mode: choices.config, backupFirst: choices.backupFirst, backup: ctx.backup });
      ctx.setConfig(r.config);
      working = r.config;
      const added = choices.config === "add-screens" ? "Added" : "Restored";
      result.done.push(
        `${added} ${r.config.profiles.length - (choices.config === "add-screens" ? ctx.config.profiles.length : 0)} screens from ${f.file.name}` +
          (r.backedUp ? " · the old dashboard was backed up first" : "") +
          (r.missing.length ? ` · ${missingCanvases(r.missing)}` : ""),
      );
    } catch (e) {
      result.failed.push(`${f.file.name}: ${reason(e)}`);
    }
  }

  for (const f of files.filter((x) => kindOf(x) === "profile")) {
    const parsed = parseProfileFile(await f.file.text());
    if ("error" in parsed) {
      result.failed.push(`${f.file.name}: ${parsed.error}`);
      continue;
    }
    const screen = importedProfile(working, parsed.profile);
    working = { ...working, profiles: [...working.profiles, screen] };
    ctx.addScreen(screen);
    result.done.push(`Added screen ${screen.name}${parsed.skippedCanvases ? ` · ${parsed.skippedCanvases} canvas zones left out (their canvas is not in the file)` : ""}`);
    result.go = { to: "screens" };
  }

  const library = files.filter((f) => LIBRARY_KINDS.includes(kindOf(f))).map((f) => ({ file: f.file, kind: kindOf(f) }));
  if (library.length > 0) {
    const r = await importToLibrary(library);
    result.done.push(...r.done);
    result.failed.push(...r.failed);
    result.libraryChanged = r.changed;
    result.go ??= r.goto;
    if (choices.asBackground && r.media) ctx.useAsBackground(r.media);
  }

  if (wizards[0]) result.wizard = { file: wizards[0].file, dest: choices.canvas === "canvas-zone" ? "zone" : "new" };
  return result;
}
