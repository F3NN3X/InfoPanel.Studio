import type { DashboardConfig } from "@/lib/layout";

/** The Edit left panel's tabs, as `LeftTab` (design-left-panel.tsx). */
export type FixtureLeftTab = "layers" | "add";

/** What the studio does on its first render when a fixture is loaded (the rest of the Fixture is read by the App). */
export interface FixtureStart {
  /** Part and group ids to select on a grid page (a zone, an item placement or a page group). */
  selection: string[];
  /** Item paths to select in the canvas editor of a Free page (`canvas-edit` paths, "0", "1.2"). */
  canvasSelection?: string[];
  leftTab: FixtureLeftTab;
  /** Add's segment (`add-prefs.ts` `AddFilter`), the tile whose details card is open, and Recently used (tile keys). */
  addSegment?: "all" | "widgets" | "items";
  hoverTile?: string;
  recent?: string[];
  /** The toast after adding the selected widget (the reference's state 3). */
  toast?: "addw";
  /** The tile just added, by name: Add's 1.5 s highlight on it (the reference's state 3). */
  added?: string;
}

/**
 * One state of the Edit v3 reference (`?fixture=one-editor/<name>`, dev and fixtures builds only). `route` names the
 * screen and page Edit opens on. The fields after `route` are the reference's per-state UI (Alt drag, layer menu):
 * nothing reads them until the phase that builds that UI.
 */
export interface Fixture extends FixtureStart {
  config: DashboardConfig;
  route: { profileId: string; pageId: string };
  altDrag?: { part: string };
  contextMenuFor?: string;
}

export const FIXTURE_NAMES = ["screen", "profile", "addw", "alt", "export", "layersF", "layersG", "hover"] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];
