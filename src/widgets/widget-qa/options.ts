import { modules } from "@/modules";
import { STYLE_SETTINGS } from "@/modules/standard-settings";
import { THEME_PRESETS } from "@/lib/theme";
import { SKIN_NAMES, SURFACE_NAMES } from "@/widgets/core/theme";
import type { QaFx } from "./params";

/** What the top bar's controls offer, shared with `__qa.options()` so a tool reads the lists without opening a control. */
export const FX: QaFx[] = ["full", "calm", "off"];

const optionsOf = (key: string) => (STYLE_SETTINGS.find((s) => s.key === key)?.options ?? []).filter((o) => o.value !== "auto").map((o) => o.value);
export const SKINS = SKIN_NAMES;
export const SURFACES = SURFACE_NAMES;
// The dense view as the QA page names it (`variant`, read by `compactOf` since the standard row became Small zones).
export const VARIANTS = ["default", "studio"];
export const GRAPHS = optionsOf("graph");
export const METERS = optionsOf("meter");
export const RADII = optionsOf("radius");
export const ACCENTS = ["#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#fbbf24", "#f87171"];
export const CELLS = [110, 150];
export const PAGE_THEMES = THEME_PRESETS.map((p) => p.name);
/** The widgets the Skins and Surfaces galleries can show, by id. */
export const GALLERY_IDS = modules.map((m) => m.id).sort();
