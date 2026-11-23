// The pack loader (P9): the one place a pack enters the app, and where G4 is enforced for it. A pack is code in a chunk of
// its own; before the app uses it, every CSS string and file path it names goes through `pack-urls`, its stage is held to
// 3 layers and its gradient numerals to 3:1 (G6). A pack that fails any check is refused whole, never trimmed.
import type { ScreenTemplate, ShapeClass, ShapeLayout } from "@/lib/screen-templates/kit";
import { modules } from "@/modules";
import { chromeOf, overlayCss } from "./chrome";
import { LOOK_IDS } from "./ids";
import { iconSetIssues } from "./icon-set";
import { setPackId, type Pack } from "./pack";
import { lintPackCss, scopePackCss } from "./pack-css";
import { MAX_LAYERS, numeralIssues, stageIssues } from "./pack-checks";
import PackStageLayers from "./pack-stage";
import { isPackRelativeUrl, packCssIssues } from "./pack-urls";

/** Built-in packs by Look id: one import() each, so a pack is a chunk the entries never carry. */
export const BUILTIN: Record<string, () => Promise<{ default: Pack }>> = {
  "field-kit": () => import("./packs/field-kit"),
  "tape-86": () => import("./packs/tape-86"),
  term: () => import("./packs/term"),
  "neon-stripe": () => import("./packs/neon-stripe"),
  overdrive: () => import("./packs/overdrive"),
  "swiss-mono": () => import("./packs/swiss-mono"),
  holo: () => import("./packs/holo"),
  "night-glow": () => import("./packs/night-glow"),
  "paper": () => import("./packs/paper"),
  "classy-black": () => import("./packs/classy-black"),
  "liquid-glass": () => import("./packs/liquid-glass"),
  "black-and-gold": () => import("./packs/black-and-gold"),
  cyberspec: () => import("./packs/cyberspec"),
};

/** Registers a pack source: how tests and the dev fixtures bring a pack that does not ship. Never called by the app. */
export function registerPack(id: string, load: () => Promise<{ default: Pack }>): void {
  BUILTIN[id] = load;
  setPackId(id, true);
}

/** Takes a registered pack source out again (tests). */
export function unregisterPack(id: string): void {
  delete BUILTIN[id];
  setPackId(id, false);
  shared.delete(id);
}

/** User packs by id (P12b): sources the app data folder gave, kept apart from `BUILTIN` so no user pack can take a built-in's place. */
const USER: Record<string, () => Promise<{ default: Pack }>> = Object.create(null);

/** Registers a user pack read from the app data folder (`user-packs.ts`); false for an id a built-in Look or pack has. */
export function registerUserPack(id: string, load: () => Promise<{ default: Pack }>): boolean {
  if (LOOK_IDS.includes(id) || Object.hasOwn(BUILTIN, id)) return false;
  USER[id] = load;
  setPackId(id, true);
  shared.delete(id);
  return true;
}

/** Takes a user pack out again (removed or replaced). */
export function unregisterUserPack(id: string): void {
  delete USER[id];
  setPackId(id, false);
  shared.delete(id);
}

const MAX_TEMPLATES = 8;
const BURN_INS: readonly string[] = ["static-safe", "needs-shift", "needs-dim"];
const ID = /^[a-z0-9][a-z0-9-]*$/;
/** A folder URL the pack's files are served from: relative or a root path of this origin, ending in `/`, never a scheme or `//host`. */
function baseIssue(base: string): boolean {
  const rest = base.replace(/^\/(?!\/)/, "");
  return !(base.endsWith("/") && !/["'()\s]/.test(base) && (rest === "" || isPackRelativeUrl(rest)));
}

const SHAPE_CLASSES: readonly string[] = ["strip", "wide", "standard", "tall"];
const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 64;
const isPx = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 16384;
const MODULE_IDS = new Set(modules.map((m) => m.id));

/** What a layout needs to make a screen: a grid, a zone on every page, each zone a known widget inside the grid. */
function layoutIssues(at: string, layout: ShapeLayout | undefined): string[] {
  if (!layout || !isCount(layout.cols) || !isCount(layout.rows)) return [`${at} grid`];
  if (!Array.isArray(layout.pages) || layout.pages.length === 0) return [`${at} has no page`];
  const issues: string[] = [];
  layout.pages.forEach((zones, p) => {
    if (!Array.isArray(zones) || zones.length === 0) return void issues.push(`${at} page ${p} has no zone`);
    for (const z of zones) {
      if (!MODULE_IDS.has(z?.module)) issues.push(`${at} page ${p} widget ${String(z?.module)}`);
      const box = z?.at;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(isCount) || box[0] + box[2] - 1 > layout.cols || box[1] + box[3] - 1 > layout.rows) issues.push(`${at} page ${p} zone ${String(z?.module)} is off the grid`);
    }
  });
  return issues;
}

/** The problems with a pack's page templates: each is made for this pack's Look, its id starts with the pack's so two packs never clash. */
function templateIssues(pack: Pack): string[] {
  const list = pack.templates ?? [];
  if (!Array.isArray(list)) return ["templates is not a list"];
  const issues = list.length > MAX_TEMPLATES ? [`${list.length} templates, at most ${MAX_TEMPLATES}`] : [];
  const seen = new Set<string>();
  for (const t of list) {
    if (typeof t?.id !== "string" || !t.id.startsWith(`${pack.id}-`) || seen.has(t.id)) issues.push(`template id ${String(t?.id)}`);
    else seen.add(t.id);
    if (t?.look?.style?.lookId !== pack.id) issues.push(`template ${t?.id} does not wear the pack's Look`);
    if (!t?.layouts || Object.keys(t.layouts).length === 0) issues.push(`template ${t?.id} has no layout`);
    if (typeof t?.name !== "string" || !isPx(t.size?.width) || !isPx(t.size?.height)) issues.push(`template ${t?.id} name or size`);
    if (!Array.isArray(t?.fits) || t.fits.length === 0 || t.fits.some((c: ShapeClass) => !t.layouts?.[c])) issues.push(`template ${t?.id} fits a class with no layout`);
    for (const [cls, layout] of Object.entries(t?.layouts ?? {})) issues.push(...layoutIssues(`template ${t.id} ${cls}`, SHAPE_CLASSES.includes(cls) ? layout : undefined));
  }
  return issues;
}

/** What is wrong with a pack, one line each (empty = it may load). */
export function packIssues(pack: Pack): string[] {
  const issues: string[] = [];
  if (!ID.test(pack.id)) issues.push("id is not lowercase letters, digits and hyphens");
  if (pack.look.id !== pack.id) issues.push("look.id is not the pack id");
  if (!Array.isArray(pack.look.modes?.supported)) return [...issues, "look.modes.supported"];
  if (pack.base !== undefined && (typeof pack.base !== "string" || baseIssue(pack.base))) issues.push(`base ${pack.base}`);
  if (pack.css) issues.push(...packCssIssues(pack.css).map((i) => `css: ${i}`), ...lintPackCss(pack.css).map((i) => `css: ${i}`));
  for (const a of pack.assets ?? []) if (!isPackRelativeUrl(a)) issues.push(`asset ${a}`);
  const layers = pack.stage?.layers ?? [];
  if (layers.length > MAX_LAYERS) issues.push(`stage has ${layers.length} layers, at most ${MAX_LAYERS}`);
  issues.push(...stageIssues(pack.stage));
  if (pack.burnIn !== undefined && !BURN_INS.includes(pack.burnIn)) issues.push(`burnIn ${String(pack.burnIn)}`);
  if (pack.statusBar?.edge !== undefined && pack.statusBar.edge !== "top" && pack.statusBar.edge !== "bottom") issues.push("statusBar.edge");
  if (pack.connectors && pack.connectors.style !== "line" && pack.connectors.style !== "elbow") issues.push("connectors.style");
  if (pack.slots?.icons) issues.push(...iconSetIssues(pack.slots.icons));
  issues.push(...templateIssues(pack));
  issues.push(...numeralIssues(pack.look));
  return issues;
}

/** The pack `id` names, or undefined: no such pack, a module that is not that pack, or any issue (the pack is refused whole). */
export async function loadPack(id: string, sources: Record<string, () => Promise<{ default: Pack }>> = BUILTIN): Promise<Pack | undefined> {
  const load = Object.hasOwn(sources, id) ? sources[id] : undefined;
  if (!load) return undefined;
  const pack = (await load()).default;
  if (pack?.id !== id || !pack.look || packIssues(pack).length) return undefined;
  const chrome = chromeOf(pack.look);
  return { ...pack, Stage: PackStageLayers, chrome, ...(pack.stage ? { stage: { ...pack.stage, accent: chrome.accent } } : null) };
}

/** The page templates of every built-in pack, for the New screen flow (a pack that fails to load or is refused adds none). */
export async function loadPackTemplates(): Promise<ScreenTemplate[]> {
  const packs = await Promise.all(Object.keys(BUILTIN).map((id) => sharedPack(id).catch(() => undefined)));
  return packs.flatMap((p) => p?.templates ?? []);
}

const shared = new Map<string, { load: () => Promise<{ default: Pack }>; pack: Promise<Pack | undefined> }>();

/** `loadPack` once per pack id: every zone, the page and the studio canvas share one import and one validation. A failed import is tried again. */
export function sharedPack(id: string): Promise<Pack | undefined> {
  const sources = Object.hasOwn(BUILTIN, id) ? BUILTIN : USER;
  const load = Object.hasOwn(sources, id) ? sources[id] : undefined;
  if (!load) return Promise.resolve(undefined);
  const known = shared.get(id);
  if (known?.load === load) return known.pack;
  const pack = loadPack(id, sources);
  shared.set(id, { load, pack });
  pack.catch(() => shared.get(id)?.pack === pack && shared.delete(id));
  return pack;
}

let worn = 0;
const mounted = new Map<string, { el: HTMLStyleElement; users: number }>();

/** Puts a pack's CSS in the page, scoped and in `@layer look` (one `<style data-pack>` per pack, however many users); returns the function that lets go of it. */
export function mountPackCss(pack: Pack): () => void {
  // Whatever the pack brings, wearing it is a root flag (lite mode then drops widget blur, index.css `data-pack-worn`).
  worn++;
  document.documentElement.setAttribute("data-pack-worn", "");
  let held = true;
  const letGo = () => {
    if (!held) return false;
    held = false;
    if (--worn === 0) document.documentElement.removeAttribute("data-pack-worn");
    return true;
  };
  const plates = pack.chrome?.panel.overlay ? overlayCss(pack.id) : "";
  if (!pack.css && !plates) return () => void letGo();
  let entry = mounted.get(pack.id);
  if (!entry) {
    const el = document.createElement("style");
    el.dataset.pack = pack.id;
    // a user pack's URLs are rewritten to its route; which it is comes from where the loader read it, never from the pack
    el.textContent = scopePackCss(pack.id, pack.css ?? "", { user: Object.hasOwn(USER, pack.id) }) + plates;
    document.head.append(el);
    entry = { el, users: 0 };
    mounted.set(pack.id, entry);
  }
  entry.users++;
  const mine = entry;
  return () => {
    if (!letGo()) return;
    if (--mine.users === 0) {
      mine.el.remove();
      if (mounted.get(pack.id) === mine) mounted.delete(pack.id);
    }
  };
}
