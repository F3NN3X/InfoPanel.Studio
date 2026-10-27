/**
 * My library on the dashboard server (ips-server's library.rs): the user's reusable images, videos, fonts,
 * SVG templates, gauges, panels, style presets and imported canvases. Placing an item copies it into
 * a profile; the item only counts its copies.
 */
import { AssetError } from "./assets";

export const LIBRARY_URL = "/api/library";

/**
 * `theme`, `skin` and `template` are config-only (saved Themes, the built-in palettes, template looks, skins and
 * screen templates shown as items): the server never stores one.
 */
export type LibraryKind = "image" | "video" | "font" | "svg" | "gauge" | "panel" | "style" | "canvas" | "theme" | "skin" | "template" | "ptemplate" | "island";

/** Where a copy of an item was placed. */
export interface LibraryCopy {
  profileId: string;
  pageId?: string;
  zoneId?: string;
  itemPath?: string;
  label?: string;
  at?: string;
}

export interface LibraryItem<D = unknown> {
  id: string;
  kind: LibraryKind;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Asset ids of its bytes (asset store). */
  files: string[];
  /** What the Library page filters and sorts by: tags, sizes, colours. */
  meta: Record<string, unknown>;
  copies: LibraryCopy[];
  /** The item's own content (a gauge spec, a panel, a stored canvas); large ones come only from `getLibraryItem`. */
  data?: D;
  /** The size of `data` when the list left it out. */
  dataSize?: number;
}

export type NewLibraryItem<D = unknown> = Pick<LibraryItem<D>, "kind" | "name"> & Partial<Pick<LibraryItem<D>, "files" | "meta" | "copies" | "data">>;

const HEADERS = { "X-Dashboard-Library": "1", "Content-Type": "application/json" };

async function call(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new AssetError("The dashboard server could not be reached.");
  }
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  if (res.status === 404 && !text) throw new AssetError("This dashboard server has no library yet: restart it.");
  throw new AssetError(text || `The server refused the request (${res.status}).`);
}

export async function listLibrary(): Promise<LibraryItem[]> {
  return (await call(LIBRARY_URL, { cache: "no-store" })).json() as Promise<LibraryItem[]>;
}

export async function getLibraryItem<D = unknown>(id: string): Promise<LibraryItem<D>> {
  return (await call(`${LIBRARY_URL}/${encodeURIComponent(id)}`, { cache: "no-store" })).json() as Promise<LibraryItem<D>>;
}

export async function createLibraryItem<D>(item: NewLibraryItem<D>): Promise<LibraryItem<D>> {
  return (await call(LIBRARY_URL, { method: "POST", headers: HEADERS, body: JSON.stringify(item) })).json() as Promise<LibraryItem<D>>;
}

export async function updateLibraryItem<D>(id: string, patch: Partial<NewLibraryItem<D>>): Promise<LibraryItem<D>> {
  return (await call(`${LIBRARY_URL}/${encodeURIComponent(id)}`, { method: "PUT", headers: HEADERS, body: JSON.stringify(patch) })).json() as Promise<
    LibraryItem<D>
  >;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await call(`${LIBRARY_URL}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Dashboard-Library": "1" } });
}
