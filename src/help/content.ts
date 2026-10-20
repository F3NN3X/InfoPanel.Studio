import { buildHelp } from "./build";
import { HELP_GROUPS } from "./groups";

/** Every article's Markdown source, bundled (nothing is fetched). */
export const ARTICLE_FILES = import.meta.glob<string>("./articles/*.md", { query: "?raw", import: "default", eager: true });

/** The help content, parsed once when the page loads. */
export const HELP = buildHelp(ARTICLE_FILES, HELP_GROUPS);
