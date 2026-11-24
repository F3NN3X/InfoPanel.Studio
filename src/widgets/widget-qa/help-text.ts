/**
 * What each control of the top bar does, in one place: its tooltip (the line and the URL param it sets) and its row in the `?` Help.
 * The UI says Density, Corners and Page background; the params keep their names (`variant`, `radius`, `theme`), so each line names its
 * param and a link still reads.
 */
export interface ControlHelp {
  /** The control's name in the UI. */
  name: string;
  /** The URL param it sets; none for an action. */
  param?: string;
  text: string;
}

/** The groups of the top bar, in its order: the Help lists them under these headings. */
export const HELP_GROUPS = ["Look", "Overrides", "Grid", "Data", "More (⋯)", "Widgets"] as const;
export type HelpGroup = (typeof HELP_GROUPS)[number];

export const CONTROL_HELP = {
  look: { name: "Look", param: "look", text: "The Look the page wears as a screen does: its tokens, pack CSS, stage and script, as a kiosk wearing it draws them. No look: none." },
  lookVariant: { name: "Variant", param: "lookVariant", text: "The worn Look's variant (Cyberspec's Crimson). Shown when the Look has variants; blank is the Look's own." },
  fx: { name: "Effects", param: "fx", text: "The screen's effects level, as Settings › Performance sets it: Full, Calm or Off. Default leaves it to the screen." },
  script: { name: "Run the pack's script", param: "script", text: "Runs the worn pack's effect script (its fx.js) on the page. Off sets script=0." },
  importPack: { name: "Import a pack…", text: "Checks a pack zip as the studio's import does and wears it on this page only; it is never stored. The result shows below the button." },
  skin: { name: "Skin", param: "skin", text: "The skin every widget is drawn in: each placement's own theme (lookId), under the worn Look. Blank is the default skin." },
  variant: { name: "Density", param: "variant", text: "Dense (variant=studio) is the dense view: smaller type, more rows. Standard (variant=default) is the standard one; blank leaves each widget's own." },
  surface: { name: "Surface", param: "surface", text: "The material behind each widget (glass, matte, match theme, then the generic surfaces). Blank uses the skin's own card." },
  graph: { name: "Graph style", param: "graph", text: "The style of every graph and sparkline (area, line, step, bars, dots, braille). Blank lets each widget choose." },
  meter: { name: "Meter style", param: "meter", text: "The style of every meter and progress bar (bar, pill, segments, blocks, hair, wave, square). Blank lets each widget choose." },
  accent: { name: "Accent", param: "accent", text: "The accent colour for every widget. Click a swatch again to clear it; the picker sets any colour." },
  radius: { name: "Corners", param: "radius", text: "The card's corner radius." },
  settings: { name: "Settings JSON", param: "settings", text: "Raw settings merged over every placement, after the controls above: {\"surface\":\"glass\"}. Applied when it parses; an error shows under the box." },
  cell: { name: "Cell size", param: "cell", text: "The size of one grid cell in px. 110 is the default kiosk grid, 150 a large one." },
  gap: { name: "Gap", param: "gap", text: "The space between grid cells in px, which a span larger than 1 includes." },
  spans: { name: "Sizes", param: "spans", text: "The sizes each widget is shown at, as columns x rows: 2x1 is two cells wide, one tall. A size under the widget's minimum shows as a dimmed placeholder." },
  grid: { name: "Draw the grid", param: "grid", text: "Draws the grid over every frame: the dashed squares are cells, the space between them the gap." },
  data: { name: "Data", param: "data", text: "Fixtures is the same demo data every time (sensors, OBS, chat, Wave Link, Stream Deck, agents). Stress is that data at its extremes: percentages at 100, readings ten times larger, long text, more sessions. Live reads your sensors and streams. Changing it reloads the page." },
  theme: { name: "Page background", param: "theme", text: "The page's own theme behind the frames; Paper is the light check. Dark is the default." },
  gallery: { name: "Open the galleries", param: "gallery", text: "Shows one widget in the Skins and Surfaces galleries at its default size, and jumps to them. Default shows CpuMonitor and SystemStatus." },
  surfaces: { name: "Show app surfaces", param: "surfaces", text: "Draws the app's own surfaces above the widgets: rail, alerts, island, header, toasts. Off sets surfaces=0." },
  mountAll: { name: "Mount every frame now", text: "Mounts every frame at once and waits for them to settle (__qaMountAll), so the summary counts them all. eager=1 in the URL does it on load." },
  copyLink: { name: "Copy page link", text: "Copies the page's URL, which carries every setting, so the link opens exactly this view." },
  reset: { name: "Reset all", text: "Puts every setting back to its default." },
  help: { name: "Help", text: "This reference." },
  q: { name: "Search", param: "q", text: "Shows only the widgets whose id or title contains the text. / focuses it." },
  flagged: { name: "Theme flags", param: "flagged", text: "Shows only the widgets the theme check flags under the worn Look; a widget whose frames all came back clean is hidden. Shown while a Look is worn." },
  noted: { name: "Notes", param: "noted", text: "Shows only the widgets with redesign notes (notes.json)." },
  issues: { name: "Issues", param: "issues", text: "Shows only the widgets with an issue (something that pokes out, overlaps or is cut off) in the frames checked so far; a widget whose checked frames all came back clean is hidden." },
  keys: { name: "Keys", text: "/ focuses the search; j and k move to the next and the previous widget in the list and scroll to it." },
} satisfies Record<string, ControlHelp>;

export type ControlId = keyof typeof CONTROL_HELP;

/** Which group each control's Help row sits under. */
export const CONTROL_GROUP: Record<ControlId, HelpGroup> = {
  look: "Look",
  lookVariant: "Look",
  fx: "Look",
  script: "Look",
  importPack: "Look",
  skin: "Overrides",
  variant: "Overrides",
  surface: "Overrides",
  graph: "Overrides",
  meter: "Overrides",
  accent: "Overrides",
  radius: "Overrides",
  settings: "Overrides",
  cell: "Grid",
  gap: "Grid",
  spans: "Grid",
  grid: "Grid",
  data: "Data",
  theme: "More (⋯)",
  gallery: "More (⋯)",
  surfaces: "More (⋯)",
  mountAll: "More (⋯)",
  copyLink: "More (⋯)",
  reset: "More (⋯)",
  help: "More (⋯)",
  q: "Widgets",
  flagged: "Widgets",
  noted: "Widgets",
  issues: "Widgets",
  keys: "Widgets",
};

/** A control's tooltip: its line, then the param it sets. */
export function tipOf(id: ControlId): string {
  const h: ControlHelp = CONTROL_HELP[id];
  return h.param ? `${h.text} (${h.param}=)` : h.text;
}
