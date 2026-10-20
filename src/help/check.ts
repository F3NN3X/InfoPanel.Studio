import { SHORTCUT_GROUPS } from "@/components/studio/use-studio-shortcuts";
import { GENERATED_KEYS } from "./generated";
import { parseInline } from "./inline";
import { ArticleError, parseArticle } from "./parse";
import { parseOpenTarget } from "./routes";
import type { Article, Block, GroupDef } from "./types";

/** Keys the app itself handles (not in the studio's cheat sheet), which an article may show. */
export const APP_KEYS = ["F1", "Ctrl+K", "Ctrl+0", "Ctrl+=", "Ctrl+-", "Ctrl +", "Ctrl -", "Ctrl 0"];

/** Articles whose key lists are not held to the cheat sheet: the reference page lists every key the app has. */
export const KEYS_EXEMPT = ["shortcuts"];

/** A combo as compared: case, spaces around "+" and the minus sign do not matter. */
export const normalizeCombo = (combo: string): string => combo.trim().toLowerCase().replace(/\s*\+\s*/g, "+").replace(/−/g, "-");

const alternatives = (combo: string): string[] => combo.split(" / ").map(normalizeCombo);

/** The combos the app has: the studio cheat sheet, and the app-level keys. */
export function knownCombos(): Set<string> {
  return new Set([...SHORTCUT_GROUPS.flatMap((g) => g.items.flatMap((i) => alternatives(i.keys))), ...APP_KEYS.flatMap(alternatives)]);
}

/** Every text of an article that can carry inline markup. */
function texts(article: Article): string[] {
  const fromBlock = (b: Block): string[] => {
    switch (b.type) {
      case "h":
      case "p":
      case "callout":
        return [b.text];
      case "ul":
      case "ol":
        return b.items;
      case "table":
        return [...b.head, ...b.rows.flat()];
      case "keys":
        return b.rows.map(([, label]) => label);
      case "flow":
        return b.steps.map(([, d]) => d);
      default:
        return [];
    }
  };
  return [article.lede, ...article.blocks.flatMap(fromBlock)];
}

/**
 * The problems in a set of article files (SPEC 8.5), as readable lines; none = the content is sound.
 * `files` maps a path to its Markdown source.
 */
export function checkContent(files: Record<string, string>, groups: GroupDef[]): string[] {
  const problems: string[] = [];
  const articles = new Map<string, Article>();
  for (const [path, source] of Object.entries(files)) {
    try {
      const article = parseArticle(source, path);
      const name = path.split("/").pop()?.replace(/\.md$/, "");
      if (name !== article.id) problems.push(`${path}: the file name is not the id "${article.id}"`);
      articles.set(article.id, article);
    } catch (e) {
      if (!(e instanceof ArticleError)) throw e;
      problems.push(e.message);
    }
  }

  const grouped = groups.flatMap((g) => g.articles);
  for (const id of grouped) if (!articles.has(id)) problems.push(`groups.ts lists "${id}", which has no file`);
  const headings = (id: string): string[] => articles.get(id)?.blocks.flatMap((b) => (b.type === "h" ? [b.id] : [])) ?? [];
  const link = (from: string, id: string, heading?: string) => {
    if (!articles.has(id)) problems.push(`${from}: links to the missing article "${id}"`);
    else if (heading && !headings(id).includes(heading)) problems.push(`${from}: "${id}" has no heading "#${heading}"`);
  };
  const known = knownCombos();

  for (const article of articles.values()) {
    const at = article.id;
    if (!article.verified) problems.push(`${at}: no "verified" stamp`);
    if (!grouped.includes(at)) problems.push(`${at}: not in groups.ts`);
    for (const id of article.related) link(`${at} (related)`, id);
    for (const text of texts(article)) {
      for (const run of parseInline(text)) if (run.kind === "article") link(at, run.article, run.heading);
    }
    for (const block of article.blocks) {
      if (block.type === "open") {
        const route = parseOpenTarget(block.target);
        if (!route) problems.push(`${at}: ":::open ${block.target}" is not a route`);
        else if (route.kind === "help") link(`${at} (open)`, route.article, route.heading);
      } else if (block.type === "generated") {
        if (!GENERATED_KEYS.includes(block.key)) problems.push(`${at}: unknown generated key "${block.key}"`);
      } else if (block.type === "keys" && !KEYS_EXEMPT.includes(at)) {
        for (const [combo] of block.rows) {
          for (const alt of alternatives(combo)) if (!known.has(alt)) problems.push(`${at}: the key "${combo}" is not in the shortcut list`);
        }
      }
    }
  }
  return problems;
}
