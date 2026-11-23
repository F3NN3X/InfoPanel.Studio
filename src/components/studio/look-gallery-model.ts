import type { AppearancePreset } from "@/lib/appearance-presets";
import { DEFAULT_RADIUS, DEFAULT_THEME } from "@/lib/theme";
import { lookOf, skinLabel } from "@/lib/theme-skins";
import { CLASSIC_LOOK, DEFAULT_SKIN_LOOK, LOOK_IDS } from "@/looks/ids";
import { SAMPLE_THEMES } from "@/looks/sample-themes";
import type { Look } from "@/looks/look";

/**
 * The Look gallery as data (investigation 7 F5, D14): Classic, the 13 skin Looks and the 12 sample Looks as tagged
 * cards, and what picking one writes. Picking a Look writes its `lookId` and its screen colours, corners and page
 * (a sample's), and no widget-style values: those come from the Look layer (L40), so the knobs above a level show only
 * what the level changes. The pick keeps what the level holds of its own (`applyLookToLevel`). The hidden `default`
 * Look is never listed. Pure.
 */

/** The Looks the gallery lists, in registry order: every one but the hidden `default` (which loads as Classic). */
export const GALLERY_IDS: readonly string[] = LOOK_IDS.filter((id) => id !== DEFAULT_SKIN_LOOK);

/** The gallery's style tags per Look (the Look file's `tags` say what it is; these say how it looks). */
export const LOOK_TAGS: Readonly<Record<string, readonly string[]>> = {
  classic: ["minimal", "glass"],
  tui: ["technical", "retro"],
  macos: ["minimal", "glass"],
  fluent: ["minimal", "glass"],
  hud: ["technical", "gaming"],
  ink: ["minimal"],
  retro: ["retro"],
  ios: ["minimal"],
  android: ["minimal"],
  synth: ["retro", "neon"],
  brutal: ["retro"],
  cyber: ["neon", "gaming"],
  nixie: ["retro", "technical"],
  instrument: ["technical"],
  "field-kit": ["gaming", "technical"],
  "tape-86": ["retro"],
  "neon-stripe": ["neon", "gaming"],
  overdrive: ["gaming", "neon"],
  "swiss-mono": ["minimal"],
  term: ["retro", "technical"],
  holo: ["technical", "gaming"],
  "night-glow": ["neon", "glass"],
  paper: ["minimal"],
  "classy-black": ["minimal"],
  "liquid-glass": ["glass"],
  "black-and-gold": ["minimal"],
  cyberspec: ["gaming", "neon"],
};

/** The filter chips, in order ("all" first). */
export const GALLERY_FILTERS: readonly { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "minimal", label: "Minimal" },
  { id: "technical", label: "Technical" },
  { id: "retro", label: "Retro" },
  { id: "neon", label: "Neon" },
  { id: "gaming", label: "Gaming" },
  { id: "glass", label: "Glass" },
  { id: "light", label: "Light" },
];

export interface GalleryLook {
  id: string;
  name: string;
  description: string;
  tags: readonly string[];
  /** What picking it applies (`builtin:look-<id>`). */
  preset: AppearancePreset;
}

/** The preset id a Look's pick stores as the level's snapshot. */
export const lookPresetId = (id: string): string => `builtin:look-${id}`;

/**
 * What picking a Look applies: its `lookId` only as widget style, with a sample's screen colours, corners and page
 * (`sample`, its built-in preset), else the built-in colours and corners (a skin is Classic's colours with its own
 * accent, which its pack draws).
 */
export function lookPreset(look: Pick<Look, "id" | "name" | "description">, sample?: AppearancePreset): AppearancePreset {
  return {
    id: lookPresetId(look.id),
    name: look.name,
    description: look.description,
    theme: sample?.theme ?? DEFAULT_THEME,
    radius: sample?.radius ?? DEFAULT_RADIUS,
    style: { lookId: look.id },
    ...(sample?.background ? { background: { ...sample.background } } : {}),
  };
}

/** The gallery's cards: every listed Look in registry order (Classic, the skins, the samples), never the hidden `default`. */
export function galleryLooks(looks: readonly Look[], samples: readonly AppearancePreset[]): GalleryLook[] {
  return looks
    .filter((l) => l.id !== DEFAULT_SKIN_LOOK)
    .map((l) => ({
      id: l.id,
      // As the UI writes it ("macOS", "TUI"), not as the registry capitalises the skin's name.
      name: lookName(l.id),
      description: l.description,
      tags: [...(LOOK_TAGS[l.id] ?? []), ...(l.modes.supported[0] === "light" ? ["light"] : [])],
      preset: lookPreset(l, samples.find((p) => p.id === lookPresetId(l.id))),
    }));
}

/** The cards a filter chip and the search show (the search matches the name, description and tags). */
export function filterLooks(list: readonly GalleryLook[], filter: string, query = ""): GalleryLook[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (l) =>
      (filter === "all" || l.tags.includes(filter)) &&
      (q === "" || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.tags.some((t) => t.includes(q)))
  );
}

/** A Look's name without loading it: Classic, a sample's, a skin's as the skin row writes it (unknown ids are Classic). */
export function lookName(lookId: unknown): string {
  const id = lookOf(lookId);
  if (id === CLASSIC_LOOK) return "Classic";
  return SAMPLE_THEMES.find((t) => t.id === id)?.name ?? skinLabel(id);
}
