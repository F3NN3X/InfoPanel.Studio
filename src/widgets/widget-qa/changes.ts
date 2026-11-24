import { DEFAULT_STATE, type QaState } from "./params";

/** One setting away from its default, as the active changes row shows it: a label and the patch its × applies. */
export interface Change {
  /** The params it stands for, as a stable key. */
  key: string;
  label: string;
  clear: Partial<QaState>;
}

/** How the row names a Look: its name (the pack's or the Look's own) and the variant's, where they are known. */
export interface LookNames {
  look?: string;
  variant?: string;
}

const DENSITY: Record<string, string> = { default: "Standard", studio: "Dense" };
const DATA: Record<string, string> = { stress: "Stress", live: "Live" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Every setting not at its default, in the top bar's order (what the page wears, the overrides, the grid, the data, the page and
 * the list), each with the patch that puts it back. Nothing set: an empty list, and the row is not drawn.
 */
export function activeChanges(s: QaState, names: LookNames = {}): Change[] {
  const out: Change[] = [];
  const add = (key: string, label: string, clear: Partial<QaState>) => out.push({ key, label, clear });
  if (s.look) add("look", `Look: ${names.look ?? s.look}${s.lookVariant ? ` · ${names.variant ?? s.lookVariant}` : ""}`, { look: "", lookVariant: "" });
  else if (s.lookVariant) add("lookVariant", `Variant: ${s.lookVariant}`, { lookVariant: "" });
  if (s.fx) add("fx", `Effects: ${cap(s.fx)}`, { fx: "" });
  if (!s.script) add("script", "Pack script off", { script: true });
  if (s.skin) add("skin", `Skin: ${s.skin}`, { skin: "" });
  if (s.variant) add("variant", `Density: ${DENSITY[s.variant] ?? s.variant}`, { variant: "" });
  if (s.surface) add("surface", `Surface: ${s.surface}`, { surface: "" });
  if (s.graph) add("graph", `Graph style: ${s.graph}`, { graph: "" });
  if (s.meter) add("meter", `Meter style: ${s.meter}`, { meter: "" });
  if (s.accent) add("accent", `Accent: ${s.accent}`, { accent: "" });
  if (s.radius) add("radius", `Corners: ${s.radius}`, { radius: "" });
  if (s.settings) add("settings", `Settings: ${s.settings.length > 32 ? `${s.settings.slice(0, 31)}…` : s.settings}`, { settings: "" });
  if (s.cell !== DEFAULT_STATE.cell) add("cell", `Cell ${s.cell}`, { cell: DEFAULT_STATE.cell });
  if (s.gap !== DEFAULT_STATE.gap) add("gap", `Gap ${s.gap}`, { gap: DEFAULT_STATE.gap });
  if (s.spans !== DEFAULT_STATE.spans) add("spans", `Sizes: ${s.spans}`, { spans: DEFAULT_STATE.spans });
  if (s.grid) add("grid", "Grid drawn", { grid: false });
  if (s.data !== DEFAULT_STATE.data) add("data", `Data: ${DATA[s.data] ?? s.data} (reloads)`, { data: DEFAULT_STATE.data });
  if (s.theme) add("theme", `Page background: ${s.theme}`, { theme: "" });
  if (s.gallery) add("gallery", `Galleries: ${s.gallery}`, { gallery: "" });
  if (!s.surfaces) add("surfaces", "App surfaces hidden", { surfaces: true });
  if (s.eager) add("eager", "Mount every frame", { eager: false });
  if (s.module?.length) add("module", `Only: ${s.module.join(", ")}`, { module: undefined });
  if (s.q) add("q", `Filter: ${s.q}`, { q: "" });
  if (s.flagged) add("flagged", "Theme flags only", { flagged: false });
  if (s.noted) add("noted", "Notes only", { noted: false });
  return out;
}

/** How many overrides go over every placement (the Overrides button's count): the look keys set, and the raw settings. */
export function overrideCount(s: QaState): number {
  return [s.skin, s.variant, s.surface, s.graph, s.meter, s.accent, s.radius, s.settings].filter(Boolean).length;
}

/** The raw settings JSON's parse error, or none when it is empty or parses to an object. */
export function settingsError(text: string): string | undefined {
  if (!text.trim()) return undefined;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? undefined : "not an object: write {\"key\": value}";
  } catch (e) {
    return (e as Error).message;
  }
}
