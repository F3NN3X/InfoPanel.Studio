/**
 * The file an Add palette Image or Sensor image shows: a My library image, or a new file, which
 * goes into My library first (as an upload there does). The chosen file joins the canvas's files
 * the way a Library drop does (`withNewFileItem`).
 */
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { FileUp, X } from "lucide-react";
import { ASSETS_URL } from "@/lib/assets";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { droppedFileOf } from "@/lib/my-library/model";
import { addFileToLibrary } from "@/components/library/add-file";

interface ImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onPick: (file: DroppedFile) => void;
}

const IMAGE_KINDS = new Set(["image", "svg"]);

export function ImagePicker({ open, onOpenChange, title, onPick }: ImagePickerProps) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    listLibrary().then(setItems, () => setItems([]));
  }, [open]);
  const usable = (items ?? []).filter((i) => IMAGE_KINDS.has(i.kind) && droppedFileOf(i));
  const pick = (item: LibraryItem) => {
    const file = droppedFileOf(item);
    if (!file) return setError(`${item.name} can’t be drawn by InfoPanel`);
    onPick(file);
    onOpenChange(false);
  };
  const upload = async (file: File) => {
    const r = await addFileToLibrary(file, items ?? []).catch((e: Error) => ({ state: "error" as const, message: e.message }));
    if (r.state === "error") return setError(r.message);
    pick(r.item);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup className="fixed left-1/2 top-[10vh] z-50 flex max-h-[72vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-ui-strong bg-ui-tile font-ui text-ui-1 shadow-ui-modal outline-none">
          <div className="flex shrink-0 items-center justify-between border-b border-ui-subtle px-4 py-3">
            <Dialog.Title className="text-[14px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="text-ui-3 hover:text-ui-1">
              <X className="h-[18px] w-[18px]" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-ui-strong px-3 py-2.5 text-left text-[12.5px] text-ui-1 hover:bg-ui-hover"
            >
              <FileUp className="h-4 w-4 text-ui-3" />
              Choose a file… <span className="text-ui-4">It goes into My library too</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml,.ico"
              aria-label="Choose an image file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            {error && <p className="mb-2 text-caption text-ui-danger">{error}</p>}
            {items === null ? (
              <p className="py-6 text-center text-caption text-ui-4">Loading My library…</p>
            ) : usable.length === 0 ? (
              <p className="py-6 text-center text-caption text-ui-4">No images in My library yet.</p>
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {usable.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => pick(i)} title={i.name} className="flex w-full flex-col gap-1 rounded-lg border border-ui-default p-1.5 text-left hover:border-ui-strong">
                      <img src={`${ASSETS_URL}/${i.files[0]}`} alt="" className="aspect-square w-full rounded object-contain" />
                      <span className="truncate text-micro text-ui-3">{i.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
