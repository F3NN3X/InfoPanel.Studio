import { Marked, type Tokens } from "marked";

export interface ReleaseSection {
  /** `Added`, `Changed`, `Fixed`, ... */
  title: string;
  /** The section's markdown (a bullet list). */
  body: string;
}

export interface Release {
  /** `1.2.0`, or `Unreleased`. */
  version: string;
  unreleased: boolean;
  /** `YYYY-MM-DD`; null for Unreleased. */
  date: string | null;
  /** The markdown between the heading and the first section. */
  intro: string;
  sections: ReleaseSection[];
}

// `## [1.2.0] - 2026-10-20` and `## [Unreleased]` (Keep a Changelog).
const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s+[-–—]\s+(\d{4}-\d{2}-\d{2}))?/;
const SECTION_HEADING = /^### +(.+?)\s*$/;
const LINK_REFERENCE = /^\[[^\]]+\]:\s+\S+/;

/** The releases of a Keep a Changelog file, newest first as written. */
export function parseChangelog(source: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: ReleaseSection | null = null;
  const intro: string[] = [];
  const body: string[] = [];

  const closeSection = () => {
    if (release && section) release.sections.push({ ...section, body: body.join("\n").trim() });
    body.length = 0;
    section = null;
  };
  const closeRelease = () => {
    closeSection();
    const text = intro.join("\n").trim();
    // An empty Unreleased (just after a release) has nothing to show.
    if (release && !(release.unreleased && !text && release.sections.length === 0)) releases.push({ ...release, intro: text });
    intro.length = 0;
    release = null;
  };

  for (const line of source.split(/\r?\n/)) {
    const heading = RELEASE_HEADING.exec(line);
    if (heading) {
      closeRelease();
      const unreleased = heading[1].toLowerCase() === "unreleased";
      release = { version: unreleased ? "Unreleased" : heading[1], unreleased, date: unreleased ? null : (heading[2] ?? null), intro: "", sections: [] };
      continue;
    }
    if (!release || LINK_REFERENCE.test(line)) continue;
    const sectionHeading = SECTION_HEADING.exec(line);
    if (sectionHeading) {
      closeSection();
      section = { title: sectionHeading[1], body: "" };
    } else if (section) body.push(line);
    else intro.push(line);
  }
  closeRelease();
  return releases;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-12` as `12 Oct 2026`; anything else as it is. */
export function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : date;
}

export type SectionTone = "green" | "blue" | "amber" | "neutral";

export function sectionTone(title: string): SectionTone {
  switch (title.trim().toLowerCase()) {
    case "added":
      return "green";
    case "changed":
      return "blue";
    case "fixed":
      return "amber";
    default:
      return "neutral";
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A link target the notes may open: web pages only. */
export function safeHref(href: string | null | undefined): string | null {
  const h = (href ?? "").trim();
  return /^https?:\/\//i.test(h) ? h : null;
}

// Raw HTML in the notes is shown as text, images as their alt text and unsafe links as plain text, so
// the output holds only the tags the renderer below writes.
const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    image: ({ text }: Tokens.Image) => escapeHtml(text),
    link(this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } }, { href, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      return safe ? `<a href="${escapeHtml(safe)}" data-external>${inner}</a>` : inner;
    },
  },
});

/** The entries of a section body: one per top-level list item, nested lines folded into their item. */
export function sectionEntries(body: string): string[] {
  const entries: string[] = [];
  const item = /^(?:[-*+]|\d+[.)])\s+/;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (item.test(line) || entries.length === 0) entries.push(line.replace(item, "").trim());
    else entries[entries.length - 1] += ` ${line.trim()}`;
  }
  return entries;
}

const HEADLINE_MAX = 120;
// Private-use characters fence code spans while the text is cut, so a `.` or `:` inside code never ends a headline.
const CODE_OPEN = "";
const CODE_CLOSE = "";

/** Links, images and emphasis as plain text; code spans fenced. */
function plainEntry(entry: string): string {
  return entry
    .replaceAll(CODE_OPEN, "")
    .replaceAll(CODE_CLOSE, "")
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2
        ? `${CODE_OPEN}${part.slice(1, -1)}${CODE_CLOSE}`
        : part
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/(\*\*|__)(.+?)\1/g, "$2")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/~~(.+?)~~/g, "$1")
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** `text` cut to `HEADLINE_MAX` visible characters on a word boundary, with an ellipsis; code spans stay closed. */
function capHeadline(text: string): string {
  let visible = 0;
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === CODE_OPEN || text[i] === CODE_CLOSE) continue;
    if (++visible > HEADLINE_MAX) {
      end = i;
      break;
    }
  }
  if (end === text.length) return text;
  const space = text.lastIndexOf(" ", end);
  let head = text.slice(0, space > 0 ? space : end).replace(/[\s,;:\-–—]+$/, "");
  if (head.split(CODE_OPEN).length > head.split(CODE_CLOSE).length) head += CODE_CLOSE;
  return `${head}…`;
}

/**
 * The one-line headline of a changelog entry as safe HTML: its first sentence (cut at the first `. `, `: ` or `; `,
 * or a final `.`), at most about 120 characters, as plain text apart from code spans, which become `<code>`.
 */
export function entryHeadline(entry: string): string {
  return escapeHtml(headlineText(entry)).replaceAll(CODE_OPEN, "<code>").replaceAll(CODE_CLOSE, "</code>");
}

/** Whether the headline leaves part of the entry out (so "Show all" has more to show). */
export function headlineShortens(entry: string): boolean {
  return headlineText(entry) !== plainEntry(entry).trim().replace(/\.$/, "");
}

function headlineText(entry: string): string {
  const text = plainEntry(entry);
  let inCode = false;
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === CODE_OPEN) inCode = true;
    else if (c === CODE_CLOSE) inCode = false;
    else if (!inCode && (c === "." || c === ":" || c === ";") && (i === text.length - 1 || text[i + 1] === " ")) {
      end = i;
      break;
    }
  }
  return capHeadline(text.slice(0, end).trim());
}

/** The markdown of the notes as safe HTML. */
export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
