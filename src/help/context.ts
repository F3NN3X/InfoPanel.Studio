import type { SectionId } from "@/settings/model/search";
import type { HelpTarget } from "./links";

/** What the studio knows when F1 is pressed. */
export interface StudioHelpState {
  /** The article an open dialog, the Import door, the Export sheet or Live names (`data-help-article`), if one is open. */
  dialog: string | null;
  /** The view on screen (`StudioMode`). */
  view: "design" | "sources" | "library" | "theme" | "alerts" | "screens" | "settings";
  /** The kind of the primary selected zone (Design only). */
  zone: "widget" | "panel" | "canvas" | "blank" | null;
  /** Settings: the open tab, and for App its page when a link named one. */
  settingsTab?: "dashboard" | "studio" | "app";
  settingsSection?: SectionId;
}

/** The article F1 opens in the studio (SPEC 2.6): the dialog, else the view, and in Design the selection. */
export function studioHelpTarget({ dialog, view, zone, settingsTab, settingsSection }: StudioHelpState): HelpTarget {
  if (dialog) return { article: dialog };
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
