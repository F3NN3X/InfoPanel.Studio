/**
 * Reading a canvas zone's files into an asset `Doc` and writing an edited one back, shared by the
 * Profile assets tab (use-profile-doc) and the Library's Gauges frame tools: the same load, the same
 * upload, and one `setConfig` per write so the studio records one undo step.
 */
import { withCanvas } from "@/components/studio/import-actions";
import type { HistorySetter } from "@/hooks/use-config-history";
import { uploadBytes } from "@/lib/assets";
import { readStoreFile, type OpenCanvas } from "@/lib/infopanel/canvas";
import { MIME, type Doc } from "@/lib/infopanel/assets/assets";
import { docFromStored, storedFromDoc } from "@/lib/infopanel/assets/stored-doc";

/** File bytes by hash: an edit reloads the doc, and only new files need fetching. */
export type ByteCache = Map<string, Uint8Array>;

/** The zone's items and files; the bytes come from the asset store, once per hash. */
export const loadDoc = (open: OpenCanvas, bytes: ByteCache): Promise<Doc> =>
  docFromStored(open, async (a) => {
    const hit = bytes.get(a.hash);
    if (hit) return hit;
    const got = await readStoreFile(a.hash, a.ext, a.type).catch(() => null);
    if (got) bytes.set(a.hash, got);
    return got;
  });

/** `edited` written back as the zone's stored form in a single `setConfig`; new files are uploaded first. */
export async function writeDoc(open: OpenCanvas, edited: Doc, bytes: ByteCache, setConfig: HistorySetter, zoneId: string): Promise<void> {
  const next = await storedFromDoc(open.stored, open.profile, edited, async (f) => {
    const id = (await uploadBytes(f.bytes, MIME[f.type])).id;
    bytes.set(f.hash, f.bytes);
    return id;
  });
  setConfig((c) => withCanvas(c, zoneId, next));
}
