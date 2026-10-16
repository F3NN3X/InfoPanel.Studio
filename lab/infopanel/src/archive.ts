/**
 * Opens an InfoPanel export, from a `.infopanel` file or an extracted folder,
 * and parses its two XML entries. Assets stay lazy.
 *
 * Entry names match case-insensitively and accept `\` as well as `/`, like
 * InfoPanel's importer (`SharedModel.cs:877`).
 */
import { parseDisplayItemsXml, parseProfileXml, type Issue } from "./parse.ts";
import type { DisplayItem, Profile } from "./schema.ts";
import { listEntries, readEntry } from "./zip.ts";

export interface ExportEntry {
  /** Path as stored, with `/` separators. */
  name: string;
  read(): Promise<Uint8Array>;
}

export interface ParsedExport {
  profile: Profile;
  items: DisplayItem[];
  /** Files under `assets/`, keyed by lower-case file name. */
  assets: Map<string, ExportEntry>;
  issues: Issue[];
}

const key = (name: string) => name.replaceAll("\\", "/").toLowerCase();

export function entriesFromZip(buf: Uint8Array): ExportEntry[] {
  return listEntries(buf)
    .filter((e) => !e.name.endsWith("/"))
    .map((e) => ({ name: e.name, read: () => readEntry(buf, e) }));
}

const utf8 = new TextDecoder();

export async function loadExport(entries: ExportEntry[]): Promise<ParsedExport> {
  const byKey = new Map(entries.map((e) => [key(e.name), e]));
  const text = async (name: string) => {
    const e = byKey.get(name.toLowerCase());
    if (!e) throw new Error(`Not an InfoPanel export: ${name} is missing`);
    return utf8.decode(await e.read());
  };

  const [profileXml, itemsXml] = await Promise.all([text("Profile.xml"), text("DisplayItems.xml")]);
  const { profile, issues: profileIssues } = parseProfileXml(profileXml);
  const { items, issues: itemIssues } = parseDisplayItemsXml(itemsXml);

  const assets = new Map<string, ExportEntry>();
  for (const [k, e] of byKey) if (k.startsWith("assets/")) assets.set(k.slice("assets/".length), e);
  return { profile, items, assets, issues: [...profileIssues, ...itemIssues] };
}
