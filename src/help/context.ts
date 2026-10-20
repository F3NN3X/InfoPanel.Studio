import type { SectionId } from "@/settings/model/search";
import type { HelpTarget } from "./links";

/** What the studio knows when F1 is pressed. */
export interface StudioHelpState {
  /** The article an open dialog names (`data-help-article`), if one is open. */
  dialog: string | null;
  /** The kind of the primary selected zone. */
  zone: "widget" | "panel" | "canvas" | "blank" | null;
  /** The open left panel in the Design view (null when collapsed or another view shows). */
  drawer: string | null;
}

/** The article F1 opens in the studio (SPEC 2.6): the dialog, else the selection, else the drawer, else the theme. */
export function studioHelpTarget({ dialog, zone, drawer }: StudioHelpState): HelpTarget {
  if (dialog) return { article: dialog };
  if (zone === "widget") return { article: "widget-settings" };
  if (zone === "panel") return { article: "panels" };
  if (zone === "canvas") return { article: "canvas" };
  if (zone === "blank") return { article: "zones" };
  if (drawer === "profiles") return { article: "profiles" };
  return { article: "themes" };
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
