/**
 * The InfoPanel home's profile cards: their actions, for the ⋯ menu and the right-click one as on Screens' cards, and
 * the config changes behind Rename, Duplicate and Delete, each one undo step.
 */
import { Copy, Library, MonitorCog, Pencil, PenLine, Share, Trash2 } from "lucide-react";
import type { DashboardConfig, Placement } from "@/lib/layout";
import { copyOfProfile } from "@/lib/my-library/canvas-link";
import { deleteLines, deletePlan } from "@/lib/screens/delete-plan";
import type { CardAction } from "../../studio/screens/card-actions";
import { importAsProfile } from "../../studio/import-actions";
import { uniqueProfileName } from "../../studio/profile-actions";
import type { CanvasPlace } from "./canvas-places";

interface PlaceActionHandlers {
  /** "Open", or "Continue editing" for the open document. */
  openLabel: string;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  /** "Save to Library", or "Update in Library" once the profile has an item. */
  libraryLabel: string;
  onLibrary: () => void;
  onExport?: () => void;
  onShowInScreens?: () => void;
  /** Asks first. */
  onDelete: () => void;
}

/** A placed profile's actions, in the order Screens lists a screen's. */
export function placeActions(h: PlaceActionHandlers): CardAction[] {
  return [
    { id: "open", label: h.openLabel, icon: Pencil, run: h.onOpen },
    { id: "rename", label: "Rename", icon: PenLine, run: h.onRename, focusesField: true },
    { id: "duplicate", label: "Duplicate", icon: Copy, run: h.onDuplicate },
    { id: "library", label: h.libraryLabel, icon: Library, run: h.onLibrary },
    ...(h.onExport ? [{ id: "export", label: "Export as .infopanel…", icon: Share, run: h.onExport }] : []),
    ...(h.onShowInScreens ? [{ id: "screens", label: "Show in Screens", icon: MonitorCog, run: h.onShowInScreens }] : []),
    { id: "delete", label: "Delete", icon: Trash2, run: h.onDelete, danger: true },
  ];
}

/** The config with the zones of the page holding `zoneId` changed. */
function mapZones(config: DashboardConfig, zoneId: string, change: (zones: Placement[]) => Placement[]): DashboardConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.pages.some((pg) => pg.placements.some((z) => z.id === zoneId))
        ? { ...p, pages: p.pages.map((pg) => (pg.placements.some((z) => z.id === zoneId) ? { ...pg, placements: change(pg.placements) } : pg)) }
        : p,
    ),
  };
}

/** The profile renamed: InfoPanel's own Name, which the card, the editor and the export read. Its source stays, so its Library link holds. */
export function withPlaceName(config: DashboardConfig, zoneId: string, name: string): DashboardConfig {
  return mapZones(config, zoneId, (zones) => zones.map((z) => (z.id === zoneId && z.canvas ? { ...z, canvas: { ...z.canvas, profile: { ...z.canvas.profile, Name: name } } } : z)));
}

/** A copy of the profile as a new screen of its own, named "‹name› copy" (unique among the screens). */
export function withPlaceCopy(config: DashboardConfig, place: CanvasPlace): DashboardConfig {
  const name = uniqueProfileName(config.profiles, `${place.name} copy`);
  return importAsProfile(config, copyOfProfile(place.canvas, name), name, { width: place.width || 1, height: place.height || 1 }, false).config;
}

/** The profile's zone taken off its page; the rest of the screen stays. */
export function withoutPlace(config: DashboardConfig, zoneId: string): DashboardConfig {
  return mapZones(config, zoneId, (zones) => zones.filter((z) => z.id !== zoneId));
}

/**
 * What Delete takes. A screen that holds only this profile goes with it (as Screens deletes it, never the last
 * screen); a profile sharing its screen with other zones leaves just its zone. A copy in the Library is never touched.
 */
export function placeDeletion(config: DashboardConfig, place: CanvasPlace, shown: readonly string[] = []): { screen: boolean; lines: string[] } {
  const screen = config.profiles.find((p) => p.id === place.profileId);
  const zones = screen?.pages.flatMap((pg) => pg.placements) ?? [];
  const plan = zones.length === 1 && zones[0].id === place.zoneId ? deletePlan(config, place.profileId, shown) : null;
  const library = "A copy saved in the Library stays there.";
  if (plan?.allowed) return { screen: true, lines: [...deleteLines(plan).slice(0, -1), library, "Undo (Ctrl+Z) brings it back."] };
  return { screen: false, lines: [`This takes it off ${place.where}. The rest of the screen stays.`, library, "Undo (Ctrl+Z) brings it back."] };
}
