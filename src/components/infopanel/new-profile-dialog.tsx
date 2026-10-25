/**
 * "New InfoPanel profile": a name, Blank, a profile template from the gallery (with a palette
 * variant) or one of the user's Library profiles, and a size (InfoPanel panel sizes, or custom).
 * Blank is made from scratch (`newStored`); a template is made for the size with its sensors
 * matched to this machine's Data API (`instantiate`), each role's sensor changeable in the Sensors
 * section, anything left unbound listed for Remap; a Library profile is copied as it is. The studio
 * adds it as a new screen and opens it in the InfoPanel editor. Lazy-loaded with its gallery and
 * the template data.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSensorCatalog } from "@/lib/catalog";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { templateById } from "@/lib/infopanel/templates/catalog";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import type { Role } from "@/lib/infopanel/templates/roles";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { canvasData, copyOfProfile } from "@/lib/my-library/canvas-link";
import { RoleSensors, type RoleOverrides } from "./role-sensors";
import { TemplateGallery, type GalleryChoice } from "./template-gallery";

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
  stored: StoredCanvas;
  /** The template's sensors left unbound (not found on this machine, or let go in Create), in plain words; empty for Blank. */
  unbound: string[];
  /** "Also save to Library" was ticked: the studio saves the new profile as a Library item. */
  toLibrary: boolean;
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
  const [choice, setChoice] = useState<GalleryChoice>({ template: null, variant: "" });
  const [overrides, setOverrides] = useState<RoleOverrides>({});
  const [toLibrary, setToLibrary] = useState(false);
  const [profiles, setProfiles] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const fromLibrary = choice.library ? profiles.find((i) => i.id === choice.library) : undefined;
  const size = fromLibrary ? { width: Number(fromLibrary.meta.width) || 800, height: Number(fromLibrary.meta.height) || 480 } : preset === "custom" ? { width: sideOf(w), height: sideOf(h) } : SIZE_PRESETS[preset];
  const ok = name.trim() !== "" && size.width !== null && size.height !== null;
  const template = choice.template ? templateById(choice.template) : undefined;
  useEffect(() => {
    if (open) listLibrary().then((all) => setProfiles(all.filter((i) => i.kind === "canvas")), () => setProfiles([]));
  }, [open]);
  // The roles the template reads and the sensor each has (size doesn't change them).
  const roles = useMemo(
    () => (template ? instantiate(template, { name: "roles", width: 480, height: 320, variant: choice.variant, sensors, overrides }).roles : []),
    [template, choice.variant, sensors, overrides],
  );
  const choose = (next: GalleryChoice) => {
    setOverrides({});
    setError(null);
    setChoice(next);
  };
  const override = (role: Role, sensor: ChosenSensor | null) => setOverrides((o) => ({ ...o, [role]: sensor }));
  const create = async () => {
    if (!ok) return;
    const p = { name: name.trim(), width: size.width!, height: size.height! };
    if (fromLibrary) {
      const stored = await canvasData(fromLibrary).catch(() => undefined);
      if (!stored) return setError("That profile couldn’t be read from the Library.");
      onCreate({ ...p, stored: copyOfProfile(stored, p.name), unbound: [], toLibrary });
    } else {
      const made = template ? instantiate(template, { ...p, variant: choice.variant, sensors, overrides }) : { stored: newStored(p), unbound: [] };
      onCreate({ ...p, stored: made.stored, unbound: made.unbound, toLibrary });
    }
    onOpenChange(false);
  };
  // The thumbnails follow the size; a custom one being typed keeps the last good shape.
  const shown = { width: size.width ?? 800, height: size.height ?? 480 };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup
          data-help-article="infopanel-editor"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="flex items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
              <Dialog.Title className="flex-1 text-[15px] font-semibold">New InfoPanel profile</Dialog.Title>
              <Dialog.Close aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block max-w-[400px]">
                <span className="mb-1 block text-[12px] text-ui-3">Name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
              </label>
              <div>
                <span className="mb-1 block text-[12px] text-ui-3">Start from</span>
                <TemplateGallery choice={choice} onChoice={choose} width={shown.width} height={shown.height} profiles={profiles} />
              </div>
              <RoleSensors roles={roles} onOverride={override} />
              {!fromLibrary && (
              <div role="radiogroup" aria-label="Size">
                <span className="mb-1 block text-[12px] text-ui-3">Size</span>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
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
                    className={cn("col-span-3 h-8 rounded-[7px] border text-[12px] sm:col-span-6", preset === "custom" ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
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
              )}
              <label className="flex items-center gap-2 text-[12.5px] text-ui-2">
                <input type="checkbox" checked={toLibrary} onChange={(e) => setToLibrary(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ui-accent)]" />
                Also save to Library
              </label>
              {error && <p className="text-[11.5px] text-ui-danger">{error}</p>}
              <p className="text-[11.5px] leading-snug text-ui-4">
                It comes in as a new screen and opens in the InfoPanel editor. You can change the size later in its profile settings.
                {choice.template !== null && " A template's sensors are matched to this PC's; anything not found is left unbound for you to Remap."}
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

export default NewProfileDialog;
