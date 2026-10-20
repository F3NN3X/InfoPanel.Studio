/** The block types of an article (docs/redesign/help/SPEC.md section 3.2). */
export type CalloutKind = "tip" | "note" | "warn" | "soon";

export type Block =
  | { type: "h"; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "callout"; kind: CalloutKind; text: string }
  | { type: "keys"; rows: [combo: string, label: string][] }
  | { type: "flow"; steps: [title: string, description: string][] }
  | { type: "open"; target: string; label: string }
  | { type: "generated"; key: string };

export type ArticleStatus = "shipped" | "coming-soon";

export interface Article {
  id: string;
  title: string;
  /** A Material Symbols name; `icons.ts` maps it to a lucide icon. */
  icon: string;
  related: string[];
  /** The app version the text was last checked against. */
  verified: string;
  status: ArticleStatus;
  /** The first paragraph. */
  lede: string;
  blocks: Block[];
}

export interface HelpGroup {
  label: string;
  articles: Article[];
}

export interface HelpContent {
  articles: Record<string, Article>;
  groups: HelpGroup[];
  /** Article ids in nav (reading) order. */
  order: string[];
  groupOf: Record<string, string>;
}

/** What `groups.ts` exports: the nav order by article id. */
export interface GroupDef {
  label: string;
  articles: string[];
}
