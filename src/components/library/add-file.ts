/**
 * One file into My library: classify it, read its media meta (so `autoTags` can tag a wide one
 * Background), store it (unless `storedId` says it already is in the asset store) and create the
 * item. A file whose hash is already an item's is not added twice.
 */
import { uploadBytes } from "@/lib/assets";
import { createLibraryItem, type LibraryItem } from "@/lib/library";
import { readMeta } from "@/lib/my-library/decode";
import { classify, displayName } from "@/lib/my-library/intake";
import { hashOf } from "@/lib/my-library/model";

export type AddResult =
  | { state: "done" | "duplicate"; item: LibraryItem }
  | { state: "error"; message: string };

export async function addFileToLibrary(
  file: File,
  known: readonly LibraryItem[],
  storedId?: string,
  onStage?: (stage: "reading" | "uploading") => void,
): Promise<AddResult> {
  onStage?.("reading");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const intake = classify(file.name, file.type, bytes);
  if (!intake.ok) return { state: "error", message: intake.reason };
  if (intake.kind === "infopanel") return { state: "error", message: "A profile: open it with Import" };
  const meta = await readMeta(intake, bytes);
  onStage?.("uploading");
  const stored = storedId ? { id: storedId } : await uploadBytes(bytes, intake.mime);
  const hash = stored.id.slice(0, 64);
  const same = known.find((i) => hashOf(i) === hash);
  if (same) return { state: "duplicate", item: same };
  // A font is known by its family ("Orbitron"), as InfoPanel asks for it; other files by their name.
  const name = intake.kind === "font" && meta.family ? meta.family : displayName(file.name);
  const item = await createLibraryItem({ kind: intake.kind, name, files: [stored.id], meta: { ...meta, hash } });
  return { state: "done", item };
}
