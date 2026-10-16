/**
 * Uploads image assets to the lab's stand-in asset store (asset-store-plugin.ts)
 * and returns their URLs, as the app will upload imported assets to its own.
 */
import { useEffect, useState } from "react";
import type { AssetFile, AssetTable, AssetType } from "./assets.ts";

const EXT: Partial<Record<AssetType, string>> = { png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp", bmp: ".bmp", ico: ".ico" };

export const storeUrl = (f: AssetFile) => (EXT[f.type] ? `/lab-assets/${f.hash}${EXT[f.type]}` : null);

export async function upload(files: readonly AssetFile[]): Promise<Map<string, string>> {
  const images = files.filter((f) => storeUrl(f));
  const urls = new Map(images.map((f) => [f.hash, storeUrl(f)!]));
  if (images.length === 0) return urls;
  const ask = await fetch("/lab-assets/missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([...urls.keys()]) });
  if (!ask.ok) throw new Error(`asset store: ${await ask.text()}`);
  const missing = new Set((await ask.json()) as string[]);
  for (const f of images) {
    if (!missing.has(f.hash)) continue;
    missing.delete(f.hash);
    const put = await fetch(`/lab-assets/${f.hash}`, { method: "PUT", body: f.bytes.slice() });
    if (!put.ok) throw new Error(`${f.name}: ${await put.text()}`);
  }
  return urls;
}

/** Store URLs for the table's images that the lab server does not serve already (edited, added, reopened). */
export function useStoreUrls(assets: AssetTable): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const todo = [...assets.values()].filter((f) => !f.url && storeUrl(f) && !urls.has(f.hash));
    if (todo.length === 0) return;
    let stop = false;
    upload(todo).then(
      (got) => !stop && setUrls((u) => new Map([...u, ...got])),
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, [assets]);
  return urls;
}
