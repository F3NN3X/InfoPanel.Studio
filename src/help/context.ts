import type { SectionId } from "@/settings/model/search";
import { helpHash, parseHelpHash, type HelpTarget } from "./links";

/** What the studio knows when F1 is pressed. */
export interface StudioHelpState {
  /** The article an open dialog, the Import door, the Export sheet or Live names (`data-help-article`), if one is open. */
  dialog: string | null;
  /** The section the keyboard focus is in (`data-help-section`, a help hash): F1 opens its own heading. */
  section?: string | null;
  /** The view on screen (`StudioMode`). */
  view: "design" | "sources" | "library" | "theme" | "alerts" | "screens" | "settings";
  /** The kind of the primary selected zone (Design only). */
  zone: "widget" | "panel" | "canvas" | "blank" | null;
  /** Settings: the open tab, and for App its page when a link named one. */
  settingsTab?: "dashboard" | "studio" | "app";
  settingsSection?: SectionId;
}

/** The article F1 opens in the studio (SPEC 2.6, §15): the dialog, the focused section, else the view, and in Design the selection. */
export function studioHelpTarget({ dialog, section, view, zone, settingsTab, settingsSection }: StudioHelpState): HelpTarget {
  if (dialog) return { article: dialog };
  if (section) return parseHelpHash(section);
  switch (view) {
    case "theme":
      return { article: "themes" };
    case "library":
      return { article: "library" };
    case "sources":
      return { article: "sensors" };
    case "alerts":
      return { article: "island-alerts" };
    case "screens":
      return { article: "profiles" };
    case "settings":
      if (settingsTab === "app") return settingsHelpTarget(settingsSection ?? "general");
      return { article: settingsTab === "studio" ? "studio" : "performance" };
  }
  if (zone === "widget") return { article: "widget-settings" };
  if (zone === "panel") return { article: "panels" };
  if (zone === "canvas") return { article: "canvas" };
  if (zone === "blank") return { article: "zones" };
  return { article: "studio" };
}

const SETTINGS_ARTICLES: Partial<Record<SectionId, string>> = {
  general: "startup",
  server: "kiosk",
  agents: "agents",
  updates: "updates",
  diagnostics: "diagnostics",
  logs: "diagnostics",
};

/** The article F1 and the sidebar link open from a Settings section (About and Changelog: Help home). */
export function settingsHelpTarget(section: SectionId): HelpTarget {
  const article = SETTINGS_ARTICLES[section];
  return article ? { article } : {};
}

/** The article an open dialog names: the innermost element marked `data-help-article`. */
export function dialogArticle(doc: Document = document): string | null {
  const marked = doc.querySelectorAll<HTMLElement>("[data-help-article]");
  return marked.length ? (marked[marked.length - 1].dataset.helpArticle ?? null) : null;
}

/** What Theme's section cards mark themselves with: F1 inside one opens how the cards follow and lock. */
export const THEME_CARD_HELP = helpHash({ article: "themes", heading: "follow-theme-section-by-section" });

/** The `data-help-section` the keyboard focus is inside, if any. */
export function focusedSection(doc: Document = document): string | null {
  return doc.activeElement?.closest<HTMLElement>("[data-help-section]")?.dataset.helpSection ?? null;
}
