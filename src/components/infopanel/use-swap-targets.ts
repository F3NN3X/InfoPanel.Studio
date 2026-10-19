/**
 * The My library fonts a restricted font can be swapped for in an export: read from the asset
 * store only once a review needs them.
 */
import { useEffect, useState } from "react";
import { readStoreFile } from "@/lib/infopanel/canvas";
import { swapTargetOf, type SwapTarget } from "@/lib/infopanel/export/studio-export";
import { listLibrary } from "@/lib/library";
import { hashOf } from "@/lib/my-library/model";

export function useSwapTargets(enabled: boolean): SwapTarget[] {
  const [targets, setTargets] = useState<SwapTarget[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    (async () => {
      const out: SwapTarget[] = [];
      for (const item of (await listLibrary()).filter((i) => i.kind === "font")) {
        const hash = hashOf(item);
        const ext = /\.([a-z0-9]+)$/i.exec(item.files[0] ?? "")?.[1].toLowerCase();
        const bytes = hash && ext ? await readStoreFile(hash, ext, "other").catch(() => null) : null;
        const target = hash && ext && bytes ? swapTargetOf(`${item.name}.${ext}`, hash, bytes) : null;
        if (target) out.push(target);
      }
      if (!stop) setTargets(out);
    })().catch(() => {});
    return () => {
      stop = true;
    };
  }, [enabled]);
  return targets;
}
