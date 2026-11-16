// The Widgets page as data (Phase 5b): the user widgets the server holds, split into Yours (saved from the builder on this
// studio) and Imported (from a file, later Themely), the built-ins after them, the filters and the search, where each widget is
// placed, and the trust a widget is shown with. Pure but for the one stored list of the ids saved here.
import type { DashboardConfig } from "@/lib/layout";
import type { CodeWidgetDefinition } from "@/widgets/sdk";
import type { Recipe } from "@/widgets/recipe/types";
import type { RecipeIssue } from "@/widgets/recipe/validate";

/**
 * Who stands behind a widget, the detail pane's box (Phase 6b: from the server's `trust`, `trustOf`). A recipe holds no code; a code
 * widget is signed by the owner's key, Themely's (a slot that stays off until Themely signs), or a key the user trusted in Settings
 * (`trusted`: when, where it is known), or refused (never loaded, never offered in Add).
 */
export type Trust =
  | { kind: "recipe" }
  | { kind: "owner" }
  | { kind: "themely" }
  | { kind: "user-key"; signer: string; trusted?: string }
  | { kind: "refused"; why: string };

/** The detail pane's trust state for what the server says of a package (`GET /api/widgets` `trust`). */
export function trustOf(kind: string, trust: string): Trust {
  if (trust.startsWith("refused:")) return { kind: "refused", why: trust.slice(8) };
  if (kind !== "code") return { kind: "recipe" };
  if (trust === "owner") return { kind: "owner" };
  if (trust === "themely") return { kind: "themely" };
  if (trust.startsWith("user:")) return { kind: "user-key", signer: trust.slice(5) };
  return { kind: "refused", why: "it is not signed by a key this app trusts" };
}

/** A user widget on the page: a recipe or a code widget from the server, or a fixture code widget (dev builds only). */
export interface UserWidget {
  id: string;
  name: string;
  kind: "recipe" | "code";
  /** Saved from the builder on this studio. */
  yours: boolean;
  recipe?: Recipe;
  /** The validator's word on it: a refused one is listed, greyed, with its first error. */
  issues: RecipeIssue[];
  trust: Trust;
  /** The card's line ("Made in Studio · ring, three values"). */
  blurb: string;
  /** A recipe's icon and category (its details, G7): the card shows them by its name. */
  icon?: string;
  category?: string;
  version: string;
  /** Bytes on the server (`GET /api/widgets` `size`). */
  bytes: number;
  /** A recipe signed by a publisher (the server's `trust`, e.g. `user:Mika`): a plain save of an edit is refused (409), a copy is not. */
  signed?: string;
  /** A code widget's definition, once it verified and loaded (`code/loader.ts`). */
  def?: CodeWidgetDefinition;
  /** A code widget turned off on the Widgets page (the server's `off`): listed, never loaded. */
  off?: boolean;
  /** A fixture's own preview, presets and options (code widgets have no recipe to read them from). */
  fixture?: { preview: string; presets: string[]; options: [string, string][] };
}

/** Whether an open recipe has what is not on the server: never saved, or changed since it was. */
export const isUnsaved = (d: { stored?: Recipe; history: { present: Recipe } }): boolean => !d.stored || JSON.stringify(d.stored) !== JSON.stringify(d.history.present);

export type WidgetFilter = "all" | "recipes" | "code" | "yours";

/** Whether a widget passes the filter and the search (its name, case-insensitive). */
export function shown(w: Pick<UserWidget, "kind" | "yours" | "name">, filter: WidgetFilter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q && !w.name.toLowerCase().includes(q)) return false;
  return filter === "all" || (filter === "recipes" && w.kind === "recipe") || (filter === "code" && w.kind === "code") || (filter === "yours" && w.yours);
}

/** The filter chips' counts: every widget, the built-ins counted in All only. */
export function counts(user: readonly UserWidget[], builtIns: number): Record<WidgetFilter, number> {
  return {
    all: user.length + builtIns,
    recipes: user.filter((w) => w.kind === "recipe").length,
    code: user.filter((w) => w.kind === "code").length,
    yours: user.filter((w) => w.yours).length,
  };
}

/** Where a widget is placed: each screen and page that has a zone of it. */
export interface Use {
  profileId: string;
  profile: string;
  pageId: string;
  page: string;
  zoneId: string;
}

export function usesOf(config: DashboardConfig, id: string): Use[] {
  return config.profiles.flatMap((p) =>
    p.pages.flatMap((pg) => pg.placements.filter((z) => z.module === id).map((z) => ({ profileId: p.id, profile: p.name, pageId: pg.id, page: pg.name, zoneId: z.id }))),
  );
}

/** The screens a widget is on, by name, once each ("Perf heavy, Desk bar"); "Not used yet" for none. */
export function screensLine(uses: readonly Use[]): string {
  const names = [...new Set(uses.map((u) => u.profile))];
  return names.length ? names.join(", ") : "Not used yet";
}

/** The card's chip: "On 2 screens", none when it is on none. */
export function onScreensChip(uses: readonly Use[]): string | undefined {
  const n = new Set(uses.map((u) => u.profile)).size;
  return n ? `On ${n} screen${n === 1 ? "" : "s"}` : undefined;
}

/** What the detail pane says of a recipe under its name ("Recipe · made in Studio · 7 blocks"). */
export function kindLine(w: UserWidget, blocks?: number): string {
  if (w.kind === "code") return `Code widget · v${w.version} · ${Math.max(1, Math.round(w.bytes / 1000))} KB`;
  const from = w.yours ? "made in Studio" : "imported file";
  return `Recipe · ${from}${blocks !== undefined ? ` · ${blocks} blocks` : ""}`;
}
