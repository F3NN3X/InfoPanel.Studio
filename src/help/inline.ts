/** One run of inline text: plain, `code`, **bold** or a [link](target). */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "article"; label: string; article: string; heading?: string }
  | { kind: "external"; label: string; url: string };

// The markup the contract allows (SPEC section 7): `code`, **bold**, [label](target).
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/** Splits text into its runs. Anything that is not markup stays plain. */
export function parseInline(text: string): Inline[] {
  return text
    .split(TOKEN)
    .filter(Boolean)
    .map((t): Inline => {
      if (t.startsWith("`")) return { kind: "code", text: t.slice(1, -1) };
      if (t.startsWith("**")) return { kind: "bold", text: t.slice(2, -2) };
      const link = LINK.exec(t);
      if (!link) return { kind: "text", text: t };
      const [, label, target] = link;
      if (/^https?:\/\//i.test(target)) return { kind: "external", label, url: target };
      const [article, heading] = target.split("#");
      return heading ? { kind: "article", label, article, heading } : { kind: "article", label, article };
    });
}

/** The text with the markup taken off (for search and headings). */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((run) => (run.kind === "article" || run.kind === "external" ? run.label : run.text))
    .join("");
}
