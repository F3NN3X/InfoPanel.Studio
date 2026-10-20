import { addFileToLibrary } from "@/components/library/add-file";
import { listLibrary } from "@/lib/library";

/** An uploaded file (already in the asset store) as a My library item, once; a failure leaves the upload as it is. */
export async function addUpload(file: File, assetId: string): Promise<void> {
  try {
    await addFileToLibrary(file, await listLibrary(), assetId);
  } catch {
    // The file is uploaded and usable; it just is not listed in the Library.
  }
}
