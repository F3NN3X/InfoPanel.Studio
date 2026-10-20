import { parseArticle } from "./parse";
import type { GroupDef, HelpContent } from "./types";

/**
 * The parsed articles in nav order. `files` maps a path (`./articles/kiosk.md`) to its source.
 * A group id with no file is skipped here; the content test (`content.test.ts`) is what fails on it.
 */
export function buildHelp(files: Record<string, string>, defs: GroupDef[]): HelpContent {
  const articles = Object.fromEntries(
    Object.entries(files).map(([path, source]) => {
      const article = parseArticle(source, path);
      return [article.id, article];
    })
  );
  const groups = defs.map((g) => ({ label: g.label, articles: g.articles.flatMap((id) => (articles[id] ? [articles[id]] : [])) }));
  const order = groups.flatMap((g) => g.articles.map((a) => a.id));
  const groupOf = Object.fromEntries(groups.flatMap((g) => g.articles.map((a) => [a.id, g.label])));
  return { articles, groups, order, groupOf };
}
