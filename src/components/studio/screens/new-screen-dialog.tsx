/**
 * "New screen": a name, Blank or a native screen template from the gallery, and a size (the panel presets, or
 * custom). Blank is an empty grid (`newProfile`); a template is made for the size with its sensors found on this
 * machine's Data API (`instantiate`). A template that doesn't fit the chosen size's shape switches to the size it is
 * made for. The studio adds the screen as one undo step. Lazy-loaded with its gallery and the template data.
 */
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useSensorCatalog } from "@/lib/catalog";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import { newProfile, type MonitorProfile } from "@/lib/layout";
import { screenTemplateById } from "@/lib/screen-templates/catalog";
import { instantiate } from "@/lib/screen-templates/instantiate";
import { ScreenTemplateGallery } from "../../templates/screen-template-gallery";
import { INPUT, SizePicker, choiceOfSize, sizeOfChoice, type SizeChoice } from "../../templates/size-picker";
import { presetForChoice } from "../../templates/size-presets";

export interface NewScreen {
  profile: MonitorProfile;
  /** The template's sensors not found on this machine, in plain words; empty for Blank. */
  unbound: string[];
}

interface NewScreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (made: NewScreen) => void;
  /** The size it opens at (the studio window's). */
  size: { width: number; height: number };
}

export function NewScreenDialog({ open, onOpenChange, onCreate, size: start }: NewScreenDialogProps) {
  const [name, setName] = useState<string | null>(null);
  const [preset, setPreset] = useState<SizeChoice>(() => choiceOfSize(start));
  const [w, setW] = useState(String(start.width));
  const [h, setH] = useState(String(start.height));
  const [choice, setChoice] = useState<string | null>(null);
  const catalog = useSensorCatalog();
  const template = choice ? screenTemplateById(choice) : undefined;
  const size = sizeOfChoice(preset, w, h);
  // Until a name is typed it follows the choice.
  const shownName = name ?? template?.name ?? "New screen";
  const ok = shownName.trim() !== "" && size.width !== null && size.height !== null;
  // The thumbnails follow the size; a custom one being typed keeps the last good shape.
  const shown = { width: size.width ?? start.width, height: size.height ?? start.height };
  const choose = (id: string | null) => {
    const t = id !== null && id !== choice ? screenTemplateById(id) : undefined;
    const made = t ? presetForChoice(t, shapeClassOf(shown.width, shown.height)) : undefined;
    if (made !== undefined) setPreset(made);
    setChoice(id);
  };
  const create = () => {
    if (!ok) return;
    const p = { name: shownName.trim(), width: size.width!, height: size.height! };
    const sensors = catalog.sensors as unknown as Record<string, DataApiValue>;
    onCreate(template ? instantiate(template, { ...p, sensors }) : { profile: newProfile(p.name, p.width, p.height), unbound: [] });
    onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup
          data-help-article="profiles"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="flex items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
              <Dialog.Title className="flex-1 text-[15px] font-semibold">New screen</Dialog.Title>
              <Dialog.Close aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block max-w-[400px]">
                <span className="mb-1 block text-[12px] text-ui-3">Name</span>
                <input autoFocus value={shownName} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
              </label>
              <div>
                <span className="mb-1 block text-[12px] text-ui-3">Start from</span>
                <ScreenTemplateGallery choice={choice} onChoice={choose} width={shown.width} height={shown.height} />
              </div>
              <SizePicker choice={preset} onChoice={setPreset} w={w} h={h} onW={setW} onH={setH} />
              <p className="text-[11.5px] leading-snug text-ui-4">
                It comes in as a new screen. You can change its size and grid later on Screens.
                {choice !== null && " The template's widgets find this PC's sensors; a reading not found is left for you to pick."}
              </p>
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

export default NewScreenDialog;
