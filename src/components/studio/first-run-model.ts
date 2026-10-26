import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import type { Role } from "@/lib/infopanel/templates/roles";
import { newProfile, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { onPage, zoneCount } from "@/lib/pages";
import { sampleLayout } from "@/lib/sample-layout";
import { withSampleZones } from "./studio-actions";

/*
 * First-run setup (SPEC §7): the pure parts of its Screen, Start and Finish steps. Which size a screen is, the
 * templates offered for its shape, which InfoPanel profiles start ticked, and what config the setup makes. The checks
 * are `first-run/checks.ts`; the page (`first-run/first-run-page.tsx`) only collects the choices.
 */

/** The size the setup starts on: a 7″ panel. */
export const DEFAULT_SIZE = { width: 1024, height: 600 } as const;

/** A screen size a person can type: whole pixels, 100 to 8192. */
export const validSize = (n: number): boolean => Number.isInteger(n) && n >= 100 && n <= 8192;

export type StartChoice = "template" | "import" | "blank" | "browse" | "none";

export interface FirstRunChoices {
  width: number;
  height: number;
  start: StartChoice;
  /** The screen the chosen template makes at this size (A template); without one, the sample layout. */
  template?: MonitorProfile;
}

/** A fresh install: the one blank screen and nothing on it (the old empty-layout moment). */
export function isPristine(config: DashboardConfig): boolean {
  return config.profiles.length === 1 && zoneCount(config.profiles[0]) === 0;
}

/** The start choices that add a screen here; Import, Browse all and Don't add a screen leave the config alone. */
export const makesScreen = (start: StartChoice): boolean => start === "template" || start === "blank";

/** The screen a size makes: a new profile's grid and fit, under the given name. */
function screenAt(base: MonitorProfile, name: string, c: FirstRunChoices): MonitorProfile {
  const grid = newProfile(name, c.width, c.height);
  const sized: MonitorProfile = { ...base, name, width: c.width, height: c.height, cols: grid.cols, rows: grid.rows, fit: grid.fit };
  if (c.start === "template" && c.template) {
    // The template's grid, look and pages on this screen; its first page is called "Main" and keeps the screen's id.
    const { id: _id, name: _name, pages, ...made } = c.template;
    return { ...sized, ...made, pages: pages.map((p, i) => (i === 0 ? { ...p, id: sized.pages[0].id, name: "Main" } : p)) };
  }
  const named: MonitorProfile = { ...sized, pages: sized.pages.map((p, i) => (i === 0 ? { ...p, name: "Main" } : p)) };
  if (c.start === "template") {
    // The sample layout is a 1920×550 bar's own grid; any other shape scales it onto the grid it has.
    const bar = shapeClassOf(c.width, c.height) !== "standard" && shapeClassOf(c.width, c.height) !== "tall";
    return onPage(undefined, (view) => withSampleZones(view, sampleLayout(), !bar))(named);
  }
  return named;
}

/**
 * What the setup makes of the config. A fresh install sets up its one blank screen; with screens already there (run
 * again) the setup adds a new screen and leaves the rest alone. Import, Browse all and Don't add a screen change
 * nothing here (their own flows add screens). `profileId` is the screen to open.
 */
export function applyFirstRun(config: DashboardConfig, c: FirstRunChoices): { config: DashboardConfig; profileId: string } {
  if (!makesScreen(c.start)) return { config, profileId: config.activeProfile ?? config.profiles[0].id };
  if (isPristine(config)) {
    const first = config.profiles[0];
    return { config: { ...config, profiles: [screenAt(first, first.name, c)] }, profileId: first.id };
  }
  const fresh = screenAt(newProfile(`${c.width}×${c.height}`, c.width, c.height), `${c.width}×${c.height}`, c);
  return { config: { ...config, profiles: [...config.profiles, fresh] }, profileId: fresh.id };
}

/** What the top picks read of a template. */
export interface Pickable {
  id: string;
  fits: readonly ShapeClass[];
}

/** Up to four templates made for the size's class, in catalog order (SPEC §7.4). */
export function topPicks<T extends Pickable>(templates: readonly T[], width: number, height: number, n = 4): T[] {
  const cls = shapeClassOf(width, height);
  return templates.filter((t) => t.fits.includes(cls)).slice(0, n);
}

/** How many of the templates are made for a size's class. */
export const templatesFor = (templates: readonly Pickable[], width: number, height: number): number =>
  templates.filter((t) => t.fits.includes(shapeClassOf(width, height))).length;

/** Readings that come from HWiNFO or LibreHardwareMonitor, not from a plugin. */
const HARDWARE_ROLE = /^(cpu|gpu|vram|disk\.temp|psu|ram\.speed)/;

/** Whether the templates read hardware sensors: then a Data API without HWiNFO or LibreHardwareMonitor is a warning. */
export const needsHardware = (roles: readonly Role[]): boolean => roles.some((r) => HARDWARE_ROLE.test(r) && r !== "cpu.load");

