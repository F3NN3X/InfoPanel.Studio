/** Where Help opens: an article, and a heading of it (by slug). Neither = Help home. */
export interface HelpTarget {
  article?: string;
  heading?: string;
}

/** The headings other windows link to (the slugs of `problems`); change them here if the headings are renamed. */
export const HELP_LINKS = {
  serverWontStart: { article: "problems", heading: "the-server-wont-start-port-in-use" },
  displayCantConnect: { article: "problems", heading: "the-display-says-it-cant-connect" },
} as const satisfies Record<string, HelpTarget>;

/** The deep-link hash: `#kiosk`, or `#kiosk/the-kiosk-url` for a heading; empty for Help home. */
export function helpHash({ article, heading }: HelpTarget): string {
  if (!article) return "";
  return heading ? `#${article}/${heading}` : `#${article}`;
}

/** The target a hash names (see `helpHash`); an empty or odd hash is Help home. */
export function parseHelpHash(hash: string): HelpTarget {
  const [article, heading] = hash.replace(/^#/, "").split("/");
  if (!article) return {};
  return heading ? { article, heading } : { article };
}

/** The page of the browser studio (served next to it by the dashboard server) and its address for a target. */
export const helpPageUrl = (target: HelpTarget = {}): string => `help.html${helpHash(target)}`;
