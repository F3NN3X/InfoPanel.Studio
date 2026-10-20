import { SECTION_NAMES, type SearchEntry as SettingsEntry, type SectionId } from "@/settings/model/search";
import { generate } from "./generated";
import { stripInline } from "./inline";
import type { Block, HelpContent } from "./types";

/** One searchable section: the lede plus the text before the first heading, or one heading and what follows it. */
export interface IndexEntry {
  article: string;
  /** The heading text and anchor; null for the opening section. */
  heading: string | null;
  headingId: string | null;
  /** The section's text with the markup taken off. */
  text: string;
}

export interface HelpHit {
  kind: "help";
  article: string;
  headingId: string | null;
  score: number;
  /** `Title`, then ` > Heading` when the section has one. */
  title: string;
  heading: string | null;
  icon: string;
  group: string;
  /** The snippet: the text before the first match, the match, the text after. */
  pre: string;
  hit: string;
  post: string;
}

export interface SettingsHit {
  kind: "settings";
  section: SectionId;
  /** The row to highlight in Settings. */
  row: string;
  label: string;
  score: number;
}

export type Hit = HelpHit | SettingsHit;

/** At most this many results show. */
export const MAX_RESULTS = 30;
const BEFORE = 60;
const AFTER = 110;

/** The searchable text of a block (the heading itself is the entry's own). */
export function blockText(block: Block): string {
  switch (block.type) {
    case "h":
      return "";
    case "p":
    case "callout":
      return stripInline(block.text);
    case "ul":
    case "ol":
      return block.items.map(stripInline).join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].map(stripInline).join(" ");
    case "keys":
    case "flow":
      return (block.type === "keys" ? block.rows : block.steps).map((r) => r.map(stripInline).join(" ")).join(" ");
    case "open":
      return `Open ${stripInline(block.label)}`;
    case "generated":
      return generate(block.key).map(blockText).join(" ");
  }
}

/** Every article cut into its sections; built once when the content loads. */
export function buildIndex(content: HelpContent): IndexEntry[] {
  return content.order.flatMap((id) => {
    const article = content.articles[id];
    const entries: IndexEntry[] = [];
    let current: IndexEntry = { article: id, heading: null, headingId: null, text: stripInline(article.lede) };
    for (const block of article.blocks) {
      if (block.type === "h") {
        entries.push(current);
        current = { article: id, heading: stripInline(block.text), headingId: block.id, text: "" };
      } else {
        current = { ...current, text: `${current.text} ${blockText(block)}`.trim() };
      }
    }
    entries.push(current);
    return entries;
  });
}

const wordsOf = (query: string): string[] => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** The text around the first word found in it; a section matched only by its title or heading shows its start. */
export function snippet(text: string, words: string[]): Pick<HelpHit, "pre" | "hit" | "post"> {
  const lower = text.toLowerCase();
  for (const word of words) {
    const at = lower.indexOf(word);
    if (at < 0) continue;
    const from = Math.max(0, at - BEFORE);
    const end = at + word.length;
    return {
      pre: (from ? "…" : "") + text.slice(from, at),
      hit: text.slice(at, end),
      post: text.slice(end, end + AFTER) + (end + AFTER < text.length ? "…" : ""),
    };
  }
  return { pre: "", hit: "", post: text.slice(0, BEFORE + AFTER) + (text.length > BEFORE + AFTER ? "…" : "") };
}

/**
 * The sections where every word of the query appears (case-insensitive, in the title, the heading or
 * the text), best first, at most 30. A word in the title scores 3 and one in the heading 2. Settings
 * rows match on their label and section name, with the same scores, and come after help of equal score.
 */
export function searchHelp(query: string, content: HelpContent, index: IndexEntry[], settings: SettingsEntry[] = []): Hit[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const entry of index) {
    const article = content.articles[entry.article];
    const title = article.title.toLowerCase();
    const heading = (entry.heading ?? "").toLowerCase();
    const hay = `${title} ${heading} ${entry.text.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    hits.push({
      kind: "help",
      article: entry.article,
      headingId: entry.headingId,
      score: words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (heading.includes(w) ? 2 : 0), 0),
      title: article.title,
      heading: entry.heading,
      icon: article.icon,
      group: content.groupOf[entry.article],
      ...snippet(entry.text, words),
    });
  }
  for (const row of settings) {
    const label = row.label.toLowerCase();
    const section = SECTION_NAMES[row.section].toLowerCase();
    if (!words.every((w) => `${label} ${section}`.includes(w))) continue;
    hits.push({
      kind: "settings",
      section: row.section,
      row: row.row,
      label: row.label,
      score: words.reduce((s, w) => s + (label.includes(w) ? 3 : 0) + (section.includes(w) ? 2 : 0), 0),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
