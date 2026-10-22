/**
 * The font catalog: every font the dashboard page and the widgets' Font
 * option can use. The first five are the original system-stack choices
 * (their ids are stored in saved configs and must not change); the rest are
 * Google Fonts, loaded on demand by `ensureFont` and always backed by a
 * system fallback so a kiosk without internet still renders.
 */

export interface FontDef {
  /** Stored in configs ("system" = the page's own font). */
  id: string;
  label: string;
  /** CSS font-family; undefined for "system". */
  stack?: string;
  /** Google Fonts css2 family spec ("Inter:wght@400..800"); unset = no download. */
  google?: string;
}

const SANS = "ui-sans-serif, system-ui, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, 'Cascadia Code', 'Consolas', monospace";
const DISPLAY = "system-ui, 'Segoe UI', sans-serif";

export const FONT_CATALOG = [
  { id: "system", label: "System" },
  { id: "sans", label: "Sans", stack: SANS },
  {
    id: "rounded",
    label: "Rounded",
    stack: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI Variable Display', system-ui, sans-serif",
  },
  { id: "serif", label: "Serif", stack: "ui-serif, Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", stack: MONO },
  { id: "inter", label: "Inter", stack: `'Inter', ${SANS}`, google: "Inter:wght@400..800" },
  { id: "geist", label: "Geist", stack: `'Geist', ${SANS}`, google: "Geist:wght@400..800" },
  { id: "roboto", label: "Roboto", stack: `'Roboto', ${SANS}`, google: "Roboto:wght@400..800" },
  { id: "manrope", label: "Manrope", stack: `'Manrope', ${SANS}`, google: "Manrope:wght@400..800" },
  { id: "outfit", label: "Outfit", stack: `'Outfit', ${SANS}`, google: "Outfit:wght@400..800" },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    stack: `'Space Grotesk', ${SANS}`,
    google: "Space Grotesk:wght@400..700",
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    stack: `'IBM Plex Sans', ${SANS}`,
    google: "IBM Plex Sans:wght@400;500;600;700",
  },
  { id: "nunito", label: "Nunito", stack: `'Nunito', ${SANS}`, google: "Nunito:wght@400..800" },
  { id: "rajdhani", label: "Rajdhani", stack: `'Rajdhani', ${DISPLAY}`, google: "Rajdhani:wght@400;500;600;700" },
  { id: "orbitron", label: "Orbitron", stack: `'Orbitron', ${DISPLAY}`, google: "Orbitron:wght@400..800" },
  { id: "oswald", label: "Oswald", stack: `'Oswald', ${DISPLAY}`, google: "Oswald:wght@400..700" },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: `'JetBrains Mono', ${MONO}`,
    google: "JetBrains Mono:wght@400..800",
  },
  { id: "fira-code", label: "Fira Code", stack: `'Fira Code', ${MONO}`, google: "Fira Code:wght@400..700" },
  // The widget skins' families (`src/widgets/core/skins/*`).
  { id: "geist-mono", label: "Geist Mono", stack: `'Geist Mono', ${MONO}`, google: "Geist Mono:wght@400..800" },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: `'IBM Plex Mono', ${MONO}`,
    google: "IBM Plex Mono:wght@400;500;600;700",
  },
  { id: "archivo", label: "Archivo", stack: `'Archivo', ${SANS}`, google: "Archivo:wdth,wght@62..125,400..800" },
  { id: "vt323", label: "VT323", stack: `'VT323', ${MONO}`, google: "VT323" },
  {
    id: "instrument-serif",
    label: "Instrument Serif",
    // Georgia is the serif fallback; the generic family keeps a kiosk without it legible.
    stack: "'Instrument Serif', Georgia, 'Times New Roman', sans-serif",
    google: "Instrument Serif",
  },
  { id: "roboto-flex", label: "Roboto Flex", stack: `'Roboto Flex', ${SANS}`, google: "Roboto Flex:wght@400..800" },
  { id: "chakra-petch", label: "Chakra Petch", stack: `'Chakra Petch', ${DISPLAY}`, google: "Chakra Petch:wght@400;500;600;700" },
  { id: "nixie-one", label: "Nixie One", stack: `'Nixie One', ${DISPLAY}`, google: "Nixie One" },
] as const satisfies readonly FontDef[];

export type FontId = (typeof FONT_CATALOG)[number]["id"];

/** Every font id, "system" first. */
export const FONT_IDS: readonly FontId[] = FONT_CATALOG.map((f) => f.id);

/** The catalog entry for an id (undefined for an unknown id). */
export function fontById(id: string): FontDef | undefined {
  return FONT_CATALOG.find((f) => f.id === id);
}

/** Load every catalog font that downloads (a font list that previews each in its own face). */
export function ensureAllFonts(doc: FontDocument | undefined = globalThis.document): void {
  for (const f of FONT_CATALOG) ensureFont(f.id, doc);
}

/** The stylesheet URL that serves a Google font spec. */
export function googleFontHref(spec: string): string {
  return `https://fonts.googleapis.com/css2?family=${spec.replace(/ /g, "+")}&display=swap`;
}

/** The slice of `Document` ensureFont needs (so tests can pass a fake). */
export type FontDocument = Pick<Document, "head" | "getElementById" | "createElement">;

/**
 * Load a Google font by injecting its stylesheet link, once. A no-op for
 * system fonts, unknown ids and when there is no document. Offline the link
 * simply fails and the font's fallback stack renders.
 */
export function ensureFont(id: string, doc: FontDocument | undefined = globalThis.document): void {
  const spec = fontById(id)?.google;
  if (!spec || !doc) return;
  const linkId = `font-${id}`;
  if (doc.getElementById(linkId)) return;
  const link = doc.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = googleFontHref(spec);
  doc.head.appendChild(link);
}
