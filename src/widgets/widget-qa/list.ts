import type { DashboardModule } from "@/modules/types";
import type { Section } from "./plan";
import { filteredOut, type WidgetFound } from "./tally";

/** One row of the widget list: a shown widget, and the widget it merged into when it is a merged-away one. */
export interface ListRow {
  id: string;
  title: string;
  /** The survivor's title (config v19 `WIDGET_MERGES`); unset: a widget of its own. */
  mergedInto?: string;
}

export interface ListGroup {
  /** The frames' category anchor (`cat-<x>`), or `merged` for the merged-away group. */
  id: string;
  title: string;
  rows: ListRow[];
}

/**
 * The list's groups: the page's sections in their order, each widget a row, with the merged-away widgets taken out of the category
 * they draw under and listed last in a group of their own, each naming the widget it merged into.
 */
export function listGroups(sections: readonly Section[], merged: ReadonlyMap<string, string>): ListGroup[] {
  const row = (m: DashboardModule): ListRow => ({ id: m.id, title: m.title, ...(merged.has(m.id) ? { mergedInto: merged.get(m.id) } : {}) });
  const own = sections.map((s) => ({ id: s.id, title: s.category, rows: s.mods.filter((m) => !merged.has(m.id)).map(row) })).filter((g) => g.rows.length > 0);
  const away = sections.flatMap((s) => s.mods.filter((m) => merged.has(m.id))).map(row).sort((a, b) => a.title.localeCompare(b.title));
  return away.length ? [...own, { id: "merged", title: "Merged away", rows: away }] : own;
}

/** What a row's dot says: an issue first, then a theme flag, then clean; nothing read yet is unchecked. */
export type RowStatus = "issues" | "flags" | "clean" | "unchecked";

export function rowStatus(w: WidgetFound | undefined): RowStatus {
  if (!w?.checked) return "unchecked";
  return w.issues ? "issues" : w.flags ? "flags" : "clean";
}

/** Whether the list leaves a row out because the page hides its widget: the Issues filter, or Theme flags while the check runs. */
export function rowHidden(w: WidgetFound | undefined, f: { issues: boolean; flagged: boolean; flagsChecked: boolean }): boolean {
  return (f.issues && filteredOut(w, "issues")) || (f.flagged && f.flagsChecked && filteredOut(w, "flags"));
}

/** The widget `j` (+1) or `k` (-1) moves to from `current`: none yet starts at the first (or the last), and the ends hold. */
export function stepWidget(ids: readonly string[], current: string, by: 1 | -1): string | undefined {
  if (!ids.length) return undefined;
  const at = ids.indexOf(current);
  if (at < 0) return by > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + by))];
}

/** The widget a link names: its hash (`#CpuMonitor` or a frame's `#CpuMonitor--2x1`), else the one widget of `module=`. */
export function linkedWidget(hash: string, module: readonly string[] | undefined): string {
  const id = decodeURIComponent(hash.replace(/^#/, "")).split("--")[0];
  return id && !id.startsWith("cat-") && id !== "galleries" && id !== "surfaces" ? id : module?.length === 1 ? module[0] : "";
}
