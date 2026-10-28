import type { ModernChrome } from "@/components/modern-chrome";
import { GLOW_LEVELS } from "@/lib/effects/glow";
import { FONT_CATALOG } from "@/lib/fonts";
import { BASE_SURFACES } from "@/widgets/core/surfaces";
import { SKIN_PACKS } from "@/widgets/core/theme";
import { THEMED_KEYS } from "@/lib/theme-model";
import { alignOf } from "./setting-readers";
import { defaultOf, settingKeys, type ModuleSetting, type ModuleSettings } from "./types";

/**
 * The standard per-widget customization block. Every modern widget adopts
 * it (see `docs/widget-settings.md`) so users get the same options on
 * every widget, and a new widget gets them by spreading this array into
 * its `settings`:
 *
 *   settings: [...STANDARD_SETTINGS, ...MODULE_SPECIFIC]
 *
 * Keys are plain config values, read back via `effectiveSettings` and
 * turned into the component's `chrome` prop by `chromeOf`. Each one names
 * the shared inspector section it is filed in (`section`, see
 * `inspector-categories.ts`); "More" rows sit behind the section's link:
 *
 * - Header: `showTitle`, `label`; More: `icon`
 * - Fit: `compact` (Small zones), `sizeTier` (Density; the template widgets' shell)
 * - Skin & graphics: `skin`, `stroke`; More: `graph`, `meter`
 * - Colors: `accent`, `textColor`, `mutedColor`
 * - Surface: `surface`, `surfaceOpacity`, `blur` (the last two on surfaced
 *   widgets only); More: `background`, `backgroundOn`
 * - Typography: `font`, `fontWeight`, `labelCase`, `numGlow`, `numGlowColor`
 * - Size & spacing: `scale`, `align` (+ `alignSpread`), `padding`, `gap`, `radius`
 * - Border & glow: `borderWidth`, `borderColor`, `glow`, `glowColor`
 *   (surfaced widgets only)
 * - Custom CSS: More: `customCss` (every widget)
 * - Motion (Behaviour): `smoothing`
 *
 * Widgets without layout variants or surfaces (the plain modules) spread
 * `STYLE_SETTINGS` only. Module-specific options come after these and keep
 * their own keys and their own `group` (their inspector section).
 *
 * The themed keys among them (`THEMED_KEYS`, `lib/theme-model.ts`) are set
 * once by the profile's widget theme; a widget section follows it unless
 * the widget makes the section custom.
 */

/** "auto" plus pixel steps, for the spacing selects. */
const pxOptions = (values: number[]) => [
  { value: "auto", label: "Auto" },
  ...values.map((v) => ({ value: String(v), label: `${v} px` })),
];

/** "auto" plus the given values, capitalised, for the look selects. */
const autoOptions = (values: readonly string[]) => [
  { value: "auto", label: "Auto" },
  ...values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
];

/** The app's four materials: every surfaced widget kind (templates, panels, plain cards) draws them. */
const APP_SURFACE_OPTIONS = [
  { value: "glass", label: "Glass" },
  { value: "matte-light", label: "Matte (light)" },
  { value: "matte-dark", label: "Matte (dark)" },
  { value: "theme", label: "Match theme" },
];

/** Size, alignment, spacing, colors and type — every widget gets these. */
export const STYLE_SETTINGS: ModuleSetting[] = [
  {
    // "auto" is the default skin; a template widget's shell reads these (see `widgets/module.tsx`).
    // Picking a skin sets the surface to Auto, so the skin shows with its own card.
    key: "skin",
    label: "Skin",
    type: "select",
    default: "auto",
    options: autoOptions(SKIN_PACKS.map((p) => p.name)).map((o) => ({ ...o, applies: { surface: "auto" } })),
    keywords: ["theme", "style", "look", ...SKIN_PACKS.map((p) => p.name)],
    section: "skin",
  },
  {
    key: "graph",
    label: "Graph style",
    type: "select",
    default: "auto",
    options: autoOptions(["area", "line", "step", "bars", "dots", "braille"]),
    keywords: ["chart", "sparkline", "skin"],
    more: true,
    section: "skin",
  },
  {
    key: "meter",
    label: "Meter style",
    type: "select",
    default: "auto",
    options: autoOptions(["bar", "pill", "segments", "blocks", "hair", "wave", "square"]),
    keywords: ["gauge", "progress", "skin"],
    more: true,
    section: "skin",
  },
  {
    // New key (default stepped = how graphs always drew); smooth glides between samples.
    key: "smoothing",
    label: "Graph updates",
    type: "select",
    default: "stepped",
    options: [
      { value: "stepped", label: "Stepped" },
      { value: "smooth", label: "Smooth" },
    ],
    hint: "Smooth glides graphs, bars and rings between readings; reduced motion keeps them stepped",
    keywords: ["smooth", "smoothing", "animation", "glide", "interpolate", "stepped", "motion"],
    section: "motion",
  },
  {
    key: "scale",
    label: "Size (%)",
    type: "number",
    default: 100,
    min: 50,
    max: 200,
    step: 5,
    section: "spacing",
  },
  {
    // One 3×3 picker: a cell code (tl…br, "auto"), and "Spread" (between) as the second key.
    key: "align",
    keyY: "alignSpread",
    label: "Alignment",
    type: "align",
    default: "auto",
    defaultY: false,
    keywords: ["horizontal", "vertical", "left", "right", "top", "bottom", "middle", "center", "spread"],
    section: "spacing",
  },
  {
    key: "padding",
    label: "Inner padding",
    type: "select",
    default: "auto",
    options: pxOptions([0, 4, 8, 12, 16, 20, 24, 32, 48]),
    section: "spacing",
  },
  {
    key: "gap",
    label: "Gap between items",
    type: "select",
    default: "auto",
    options: pxOptions([0, 4, 8, 12, 16, 24, 32, 48]),
    section: "spacing",
  },
  {
    key: "radius",
    label: "Corner radius",
    type: "select",
    default: "auto",
    options: [...pxOptions([0, 4, 8, 12, 16, 20, 28]), { value: "999", label: "Pill" }],
    section: "spacing",
  },
  { key: "textColor", label: "Text color", type: "color", default: "", section: "colors" },
  { key: "mutedColor", label: "Secondary text color", type: "color", default: "", section: "colors" },
  {
    key: "font",
    label: "Font",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "Theme" },
      ...FONT_CATALOG.filter((f) => f.id !== "system").map((f) => ({ value: f.id, label: f.label })),
    ],
    section: "type",
  },
  {
    key: "fontWeight",
    label: "Value weight",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "Auto" },
      { value: "400", label: "Regular" },
      { value: "500", label: "Medium" },
      { value: "600", label: "Semibold" },
      { value: "700", label: "Bold" },
      { value: "800", label: "Heavy" },
    ],
    section: "type",
  },
  {
    key: "labelCase",
    label: "Label case",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "Auto" },
      { value: "uppercase", label: "UPPERCASE" },
      { value: "none", label: "As written" },
      { value: "capitalize", label: "Capitalized" },
    ],
    section: "type",
  },
  {
    // New key (default auto = the skin's own glow, as numbers always drew); see `lib/effects/glow.ts`.
    key: "numGlow",
    label: "Number glow",
    type: "select",
    default: "auto",
    options: autoOptions(["off", "soft", "strong"]),
    section: "type",
  },
  { key: "numGlowColor", label: "Number glow color", type: "color", default: "", more: true, section: "type" },
  {
    key: "stroke",
    label: "Ring / bar thickness (%)",
    type: "number",
    default: 100,
    min: 50,
    max: 250,
    step: 10,
    section: "skin",
  },
  {
    key: "customCss",
    label: "Custom CSS (@scope, :scope = root)",
    type: "text",
    multiline: true,
    default: "",
    section: "css",
    more: true,
  },
];

/** Border, glow, opacity and blur of the widget's surface box. */
export const SURFACE_SETTINGS: ModuleSetting[] = [
  {
    key: "borderWidth",
    label: "Border width",
    type: "select",
    default: "auto",
    options: pxOptions([0, 1, 2, 3, 4, 6]),
    section: "border",
  },
  { key: "borderColor", label: "Border color", type: "color", default: "", section: "border" },
  {
    key: "glow",
    label: "Edge glow",
    type: "select",
    default: "none",
    options: [
      { value: "none", label: "None" },
      { value: "soft", label: "Soft" },
      { value: "strong", label: "Strong" },
    ],
    section: "border",
  },
  {
    key: "glowColor",
    label: "Glow color",
    type: "color",
    default: "",
    hint: "Auto uses the accent",
    visibleIf: (values) => (values.glow ?? "none") !== "none",
    section: "border",
  },
  {
    key: "surfaceOpacity",
    label: "Opacity (%)",
    type: "number",
    default: 100,
    min: 0,
    max: 100,
    step: 5,
    section: "surface",
  },
  {
    key: "blur",
    label: "Blur",
    type: "select",
    default: "auto",
    options: pxOptions([0, 4, 8, 16, 24, 40]),
    section: "surface",
  },
];

export const STANDARD_SETTINGS: ModuleSetting[] = [
  {
    // Replaces `variant` + `compactView` (config v7): the card or dense view in small zones.
    // The registry drops the choices a widget cannot draw (`fitSettings`, inspector-meta.ts).
    key: "compact",
    label: "Small sizes",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "Auto" },
      { value: "full", label: "Full" },
      { value: "card", label: "Card" },
      { value: "dense", label: "Dense" },
    ],
    hint: "Auto: 1×1, one-row and one-column widgets show the summary card; Full keeps the full layout; Card shows the card at any size; Dense swaps the layout for a dense, uniform summary",
    keywords: ["small", "summary", "tile", "compact", "card", "dense", "studio", "variant"],
    section: "fit",
  },
  {
    // Replaces `layout` (config v7): forces a size tier instead of measuring the zone.
    key: "sizeTier",
    label: "Density",
    type: "select",
    default: "auto",
    hint: "Auto picks from the widget's size",
    options: [
      { value: "auto", label: "Auto" },
      { value: "lg", label: "Roomy" },
      { value: "md", label: "Standard" },
      { value: "sm", label: "Compact" },
      { value: "xs", label: "Minimal" },
    ],
    keywords: ["layout", "size", "tier", "card", "standard", "compact", "simple"],
    more: true,
    section: "fit",
  },
  {
    // Unset stays glass (stored configs unchanged); Auto = the skin's own card, glass without a skin.
    key: "surface",
    label: "Surface",
    type: "select",
    default: "glass",
    options: [
      { value: "auto", label: "Auto (skin's card)" },
      ...APP_SURFACE_OPTIONS,
      ...Object.keys(BASE_SURFACES).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
    ],
    section: "surface",
  },
  { key: "showTitle", label: "Show title", type: "boolean", default: true, section: "header" },
  { key: "label", label: "Custom title", type: "text", default: "", section: "header", visibleIf: (values) => values.showTitle !== false },
  { key: "icon", label: "Icon", type: "icon", default: "", section: "header", more: true },
  { key: "accent", label: "Accent color", type: "color", default: "", section: "colors" },
  { key: "background", label: "Background image", type: "image", default: "", section: "surface", more: true },
  {
    key: "backgroundOn",
    label: "Use as background",
    type: "boolean",
    default: false,
    more: true,
    section: "surface",
  },
  ...STYLE_SETTINGS,
  ...SURFACE_SETTINGS,
];

/** Standard keys a panel has no use for (no small-zone views, size tiers or rings of its own; an empty title hides a panel's). */
const NOT_FOR_PANELS: ReadonlySet<string> = new Set(["compact", "sizeTier", "stroke", "showTitle"]);

/**
 * A custom panel's look (its placement's settings): the standard block
 * minus what panels don't have, with the panel's cards added to the
 * surfaces and the custom title as the panel title.
 */
export const PANEL_SETTINGS: ModuleSetting[] = STANDARD_SETTINGS.filter(
  (s) => !NOT_FOR_PANELS.has(s.key)
).map((s) => {
  if (s.key === "label") return { ...s, label: "Title (empty = hidden)" };
  if (s.key !== "surface") return s;
  return {
    ...s,
    default: "panel",
    options: [
      { value: "none", label: "None" },
      { value: "panel", label: "Card" },
      { value: "bordered", label: "Bordered card" },
      // Panels draw the app's materials only (no skin cards).
      ...APP_SURFACE_OPTIONS,
    ],
  };
});

const standard = (key: string): ModuleSetting => STANDARD_SETTINGS.find((s) => s.key === key)!;

/**
 * The plain card widgets (the legacy modules, the "Other sensors" cards):
 * a surface — "Theme" by default, the shadcn card they always had — an
 * accent, and the style and surface options (the Other sensors cards draw them).
 */
export const CARD_SETTINGS: ModuleSetting[] = [
  { ...standard("surface"), default: "theme", options: APP_SURFACE_OPTIONS },
  standard("accent"),
  ...STYLE_SETTINGS,
  ...SURFACE_SETTINGS,
];

/**
 * The look-only keys: what a profile can set for all its widgets, and what
 * "Copy style" / style presets carry. Content, layout, title, icon and
 * background image stay per widget.
 */
export const PROFILE_STYLE_KEYS: ReadonlySet<string> = new Set([
  "surface",
  "accent",
  ...STYLE_SETTINGS.flatMap(settingKeys),
  ...SURFACE_SETTINGS.flatMap(settingKeys),
]);

/**
 * The standard rows of a look subset (`DashboardModule.styleSubset`): each
 * entry is a shared section (`border`), or a section and the keys it keeps
 * (`spacing:scale,radius`).
 */
export function styleSubsetSettings(subset: readonly string[]): ModuleSetting[] {
  const entries = subset.map((entry) => {
    const [section, keys] = entry.split(":");
    return { section, keys: keys?.split(",") };
  });
  return STANDARD_SETTINGS.filter((d) => entries.some((e) => d.section === e.section && (!e.keys || e.keys.includes(d.key))));
}

/** Every key of the standard block (a widget's own settings are the rest). */
export const STANDARD_KEYS: ReadonlySet<string> = new Set(STANDARD_SETTINGS.flatMap(settingKeys));

/** The standard settings a profile can set (see `PROFILE_STYLE_KEYS`). */
export const PROFILE_STYLE_SETTINGS: ModuleSetting[] = STANDARD_SETTINGS.filter((s) =>
  PROFILE_STYLE_KEYS.has(s.key)
);

/** The standard settings a widget theme sets (the Theme editor's rows). */
export const THEME_SETTINGS: ModuleSetting[] = PROFILE_STYLE_SETTINGS.filter((s) =>
  settingKeys(s).every((key) => THEMED_KEYS.has(key))
);

/** Just the style keys of a settings map. */
export function styleOf(settings: ModuleSettings | undefined): ModuleSettings {
  return Object.fromEntries(
    Object.entries(settings ?? {}).filter(([key]) => PROFILE_STYLE_KEYS.has(key))
  );
}

/**
 * Give a widget another widget's (or a preset's) style: its own style
 * values are replaced wholesale — keys the source leaves unset fall back
 * to the profile / defaults again — and keys the widget has no setting for
 * are skipped. Content settings are untouched. `undefined` = no settings.
 */
export function replaceStyle(
  settings: ModuleSettings | undefined,
  style: ModuleSettings,
  supported: ReadonlySet<string>
): ModuleSettings | undefined {
  const content = Object.entries(settings ?? {}).filter(([key]) => !PROFILE_STYLE_KEYS.has(key));
  const applied = Object.entries(styleOf(style)).filter(([key]) => supported.has(key));
  const next = Object.fromEntries([...content, ...applied]);
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The standard block as a settings map (defaults only). */
export const STANDARD_DEFAULTS: ModuleSettings = Object.fromEntries(
  STANDARD_SETTINGS.flatMap((s) => settingKeys(s).map((key) => [key, defaultOf(s, key)]))
);

/** A px select value ("auto" → undefined). */
function px(value: unknown): number | undefined {
  const n = Number(value);
  return value === "auto" || value === "" || value === undefined || !Number.isFinite(n)
    ? undefined
    : Math.max(0, n);
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const percent = (value: unknown, fallback = 100): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n / 100 : fallback / 100;
};

/** A 0–100 % value as 0–1 (missing = fully opaque; 0 is allowed). */
const fraction = (value: unknown): number => {
  const n = value === "" || value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 1;
};

/**
 * Build a component's `chrome` prop from a module's resolved settings
 * (the output of `effectiveSettings`). Every widget passes this to its
 * component so the standard options render identically. Missing keys
 * (a module without some of the block) fall back to the defaults.
 */
export function chromeOf(cfg: ModuleSettings): ModernChrome {
  return {
    label: String(cfg.label ?? ""),
    showTitle: cfg.showTitle !== false,
    icon: String(cfg.icon ?? ""),
    accent: String(cfg.accent ?? ""),
    background: String(cfg.background ?? ""),
    backgroundOn: Boolean(cfg.backgroundOn),
    scale: percent(cfg.scale),
    ...alignOf(cfg),
    padding: px(cfg.padding),
    gap: px(cfg.gap),
    radius: px(cfg.radius),
    textColor: String(cfg.textColor ?? ""),
    mutedColor: String(cfg.mutedColor ?? ""),
    font: pick(cfg.font, FONT_CATALOG.map((f) => (f.id === "system" ? "auto" : f.id)), "auto"),
    fontWeight: pick(cfg.fontWeight, ["auto", "400", "500", "600", "700", "800"] as const, "auto"),
    labelCase: pick(cfg.labelCase, ["auto", "uppercase", "none", "capitalize"] as const, "auto"),
    numGlow: pick(cfg.numGlow, GLOW_LEVELS, "auto"),
    numGlowColor: String(cfg.numGlowColor ?? ""),
    stroke: percent(cfg.stroke),
    borderWidth: px(cfg.borderWidth),
    borderColor: String(cfg.borderColor ?? ""),
    glow: pick(cfg.glow, ["none", "soft", "strong"] as const, "none"),
    glowColor: String(cfg.glowColor ?? ""),
    surfaceOpacity: fraction(cfg.surfaceOpacity),
    blur: px(cfg.blur),
    customCss: String(cfg.customCss ?? ""),
    smoothing: pick(cfg.smoothing, ["smooth", "stepped"] as const, "stepped"),
  };
}
