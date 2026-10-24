/**
 * "New InfoPanel profile": a name and a size (InfoPanel panel sizes, or custom). The studio makes
 * it from scratch (`newStored`) as a new screen and opens it in the InfoPanel editor.
 */
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const SIZE_PRESETS: readonly { width: number; height: number }[] = [
  { width: 480, height: 320 },
  { width: 800, height: 480 },
  { width: 1024, height: 600 },
  { width: 1280, height: 480 },
  { width: 1920, height: 480 },
  { width: 1920, height: 1080 },
];

/** The largest size the editor takes, either way. */
const MAX_SIDE = 8192;

export interface NewProfile {
  name: string;
  width: number;
  height: number;
}

interface NewProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (p: NewProfile) => void;
}

/** A typed side, or null when it is not a whole number from 1 to 8192. */
export function sideOf(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_SIDE ? n : null;
}

const INPUT = "h-8 w-full min-w-0 rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent";

export function NewProfileDialog({ open, onOpenChange, onCreate }: NewProfileDialogProps) {
  const [name, setName] = useState("New profile");
  const [preset, setPreset] = useState<number | "custom">(1);
  const [w, setW] = useState("800");
  const [h, setH] = useState("480");
  const size = preset === "custom" ? { width: sideOf(w), height: sideOf(h) } : SIZE_PRESETS[preset];
  const ok = name.trim() !== "" && size.width !== null && size.height !== null;
  const create = () => {
    if (!ok) return;
    onCreate({ name: name.trim(), width: size.width!, height: size.height! });
    onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup
          data-help-article="infopanel-editor"
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="flex items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
              <Dialog.Title className="flex-1 text-[15px] font-semibold">New InfoPanel profile</Dialog.Title>
              <Dialog.Close aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-[12px] text-ui-3">Name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
              </label>
              <div role="radiogroup" aria-label="Size">
                <span className="mb-1 block text-[12px] text-ui-3">Size</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {SIZE_PRESETS.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={preset === i}
                      onClick={() => setPreset(i)}
                      className={cn("h-8 rounded-[7px] border text-[12px] tabular-nums", preset === i ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
                    >
                      {s.width} × {s.height}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={preset === "custom"}
                    onClick={() => setPreset("custom")}
                    className={cn("col-span-3 h-8 rounded-[7px] border text-[12px]", preset === "custom" ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
                  >
                    Custom
                  </button>
                </div>
                {preset === "custom" && (
                  <div className="mt-2 flex items-center gap-2">
                    <input inputMode="numeric" aria-label="Width" value={w} onChange={(e) => setW(e.target.value)} className={cn(INPUT, sideOf(w) === null && "border-ui-danger")} />
                    <span className="text-ui-4">×</span>
                    <input inputMode="numeric" aria-label="Height" value={h} onChange={(e) => setH(e.target.value)} className={cn(INPUT, sideOf(h) === null && "border-ui-danger")} />
                  </div>
                )}
                {preset === "custom" && (size.width === null || size.height === null) && (
                  <p className="mt-1.5 text-[11.5px] text-ui-danger">Width and height are whole numbers from 1 to {MAX_SIDE}.</p>
                )}
              </div>
              <p className="text-[11.5px] leading-snug text-ui-4">It comes in as a new screen and opens in the InfoPanel editor. You can change the size later in its profile settings.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-ui-subtle px-5 py-3">
              <Dialog.Close type="button" className="h-8 rounded-[8px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
                Cancel
              </Dialog.Close>
              <button type="submit" disabled={!ok} className="h-8 rounded-[8px] bg-ui-accent px-4 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-40">
                Create
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
