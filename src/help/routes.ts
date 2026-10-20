import { isSectionId, type SectionId } from "@/settings/model/search";

/** What an `:::open <target> <label>` button goes to. */
export type OpenRoute =
  | { kind: "settings"; section: SectionId }
  | { kind: "help"; article: string; heading?: string };

/**
 * `settings/<section>` or `help/<article>[#slug]`; null for anything else (an unknown section
 * included). Whether the article exists is for the caller to check.
 */
export function parseOpenTarget(target: string): OpenRoute | null {
  const [kind, rest = ""] = target.split(/\/(.*)/s);
  if (kind === "settings") return isSectionId(rest) ? { kind: "settings", section: rest } : null;
  if (kind === "help") {
    const [article, heading] = rest.split("#");
    if (!article) return null;
    return heading ? { kind: "help", article, heading } : { kind: "help", article };
  }
  return null;
}
