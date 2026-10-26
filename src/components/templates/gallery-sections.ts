/**
 * The New wizard gallery's sections (pure): what a search, the shape filter and the sort show, in order, and the size
 * each card is drawn at. By shape with All: Recently used, the Library (profiles), then a section per class, the base
 * class first (the class of the size set here, else of Blank's size), each template under the base class when it fits
 * it and under its own size's class when not. A shape chip shows every template fitting that class, drawn at its size;
 * A–Z shows them all in one list at their own sizes. A card is drawn at the size set here when that is of its section's
 * class, else at its own size when that is, else at the class's size (Blank's size, or the class's first preset).
 */
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import { CLASS_NAMES, CLASS_ORDER, type ShapeFilter } from "./shape-chips";
import { SIZE_PRESETS, firstPresetOf, hintOf, type Size } from "./size-presets";
import type { WizardEntry } from "./wizard-kit";

export type SortBy = "shape" | "az";

export interface GalleryCard {
  entry: WizardEntry;
  /** The size it is drawn at, which a click takes. */
  size: Size;
  /** A saved Library profile, not a template. */
  library?: boolean;
}

export interface GallerySection {
  key: string;
  title: string;
  count?: number;
  note?: string;
  /** The narrowest a card gets, in px. */
  min: number;
  cards: GalleryCard[];
}

export interface GalleryInput {
  entries: readonly WizardEntry[];
  /** The Library's profiles as entries (profiles only). */
  library?: readonly WizardEntry[];
  /** Template ids, newest first. */
  recent: readonly string[];
  query: string;
  tagsOf: (e: WizardEntry) => readonly string[];
  filter: ShapeFilter;
  sort: SortBy;
  /** Blank's size, and the size set here (null: none). */
  start: Size;
  user: Size | null;
}

export interface Gallery {
  sections: GallerySection[];
  /** How many templates match per chip. */
  counts: Record<ShapeFilter, number>;
  /** Card ids in the order the arrow keys walk them. */
  order: string[];
}

const MIN: Record<ShapeClass, number> = { standard: 188, wide: 250, strip: 320, tall: 128 };

const classOf = (s: Size) => shapeClassOf(s.width, s.height);
const lower = (c: ShapeClass) => CLASS_NAMES[c].toLowerCase();
const sizeText = (s: Size) => `${s.width} × ${s.height}`;

/** The size a class's cards are drawn at when neither the template's own size nor the one set here is of it. */
export function classSize(cls: ShapeClass, start: Size, user: Size | null): Size {
  if (user && classOf(user) === cls) return user;
  return classOf(start) === cls ? start : SIZE_PRESETS[firstPresetOf(cls)];
}

/** The size a template is drawn at in a class's section. */
export function cardSize(e: WizardEntry, cls: ShapeClass, start: Size, user: Size | null): Size {
  if (user && classOf(user) === cls) return user;
  return classOf(e.size) === cls ? e.size : classSize(cls, start, user);
}

export function gallerySections({ entries, library = [], recent, query, tagsOf, filter, sort, start, user }: GalleryInput): Gallery {
  const q = query.trim().toLowerCase();
  const matches = (e: WizardEntry, tags = true) => !q || [e.name, e.blurb, ...(tags ? tagsOf(e) : [])].join(" ").toLowerCase().includes(q);
  const shown = entries.filter((e) => matches(e));
  const counts = { all: shown.length } as Record<ShapeFilter, number>;
  for (const c of CLASS_ORDER) counts[c] = shown.filter((e) => e.fits.includes(c)).length;

  const own = (e: WizardEntry, isLibrary = false): GalleryCard => ({ entry: e, size: e.size, ...(isLibrary ? { library: true } : {}) });
  const sections: GallerySection[] = [];
  if (sort === "az") {
    const list = shown.filter((e) => filter === "all" || e.fits.includes(filter)).sort((a, b) => a.name.localeCompare(b.name));
    sections.push({
      key: "az",
      title: "All templates, A–Z",
      count: list.length,
      note: filter === "all" ? "Each at its own size" : `Drawn at ${sizeText(classSize(filter, start, user))}`,
      min: 210,
      cards: list.map((e) => (filter === "all" ? own(e) : { entry: e, size: cardSize(e, filter, start, user) })),
    });
  } else if (filter !== "all") {
    const list = shown.filter((e) => e.fits.includes(filter));
    sections.push({
      key: filter,
      title: CLASS_NAMES[filter],
      count: list.length,
      note: `Templates that fit ${lower(filter)} screens, drawn at ${sizeText(classSize(filter, start, user))}`,
      min: MIN[filter],
      cards: list.map((e) => ({ entry: e, size: cardSize(e, filter, start, user) })),
    });
  } else {
    if (!q) {
      const rec = recent.flatMap((id) => entries.find((e) => e.id === id) ?? []);
      sections.push({ key: "recent", title: "Recently used", min: 230, cards: rec.map((e) => own(e)) });
    }
    const saved = library.filter((e) => matches(e, false));
    sections.push({ key: "library", title: "Your Library", count: saved.length, note: "Create copies a saved profile", min: 230, cards: saved.map((e) => own(e, true)) });
    const base = classOf(user ?? start);
    const hint = hintOf(start);
    for (const c of [base, ...CLASS_ORDER.filter((x) => x !== base)]) {
      const list = shown.filter((e) => (e.fits.includes(base) ? base : classOf(e.size)) === c);
      const note =
        c !== base ? `Made for ${lower(c)} screens` : user ? `Fit ${sizeText(user)}` : hint ? `Fit the size of a ${hint} and similar` : `Fit ${sizeText(start)} and similar`;
      sections.push({ key: c, title: CLASS_NAMES[c], count: list.length, note, min: MIN[c], cards: list.map((e) => ({ entry: e, size: cardSize(e, c, start, user) })) });
    }
  }
  const filled = sections.filter((s) => s.cards.length > 0);
  const order = [...new Set(filled.flatMap((s) => s.cards.map((c) => c.entry.id)))];
  return { sections: filled, counts, order };
}
