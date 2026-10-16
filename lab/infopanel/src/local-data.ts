/**
 * Reading InfoPanel's own data folder (%LOCALAPPDATA%\InfoPanel): `profiles.xml`
 * lists the profiles, `profiles/<guid>.xml` holds each one's display items and
 * `assets/<guid>/` its files (ConfigModel.cs, SharedModel.cs). Pure helpers for
 * the lab's dev-server middleware (local-data-plugin.ts).
 */

export interface InstalledProfile {
  guid: string;
  name: string;
  /** The `<Profile>` element, as an export's Profile.xml holds it. */
  xml: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (s: string) => GUID.test(s);

const unescape = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e]!);

/** The profiles in `profiles.xml`, each with its own `<Profile>` element. Entries without a valid Guid are skipped. */
export function profilesFromXml(text: string): InstalledProfile[] {
  const out: InstalledProfile[] = [];
  for (const m of text.matchAll(/<Profile>[\s\S]*?<\/Profile>/g)) {
    const field = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(m[0])?.[1];
    const guid = field("Guid") ?? "";
    if (!isGuid(guid)) continue;
    out.push({ guid, name: unescape(field("Name") ?? ""), xml: m[0] });
  }
  return out;
}

/** An asset file name as InfoPanel stores it: one plain name, no folders, no dot-only names. */
export const isAssetName = (s: string) => /^[^\\/:*?"<>|\0]+$/.test(s) && !/^\.+$/.test(s);
