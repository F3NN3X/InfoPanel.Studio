/**
 * "New InfoPanel profile", a page over the InfoPanel home (`new-wizard.tsx`, the same shell as New screen). Step 1:
 * Blank, a profile template from the gallery or one of the user's Library profiles, or Import. Step 2: the sensor each
 * of the template's roles reads, the size (InfoPanel panel sizes, or custom), the palette, a name and a preview at that
 * size. A template brings its own size until the size is changed here. Blank is made from scratch (`newStored`); a
 * template is made for the size with its sensors matched to this machine's Data API (`instantiate`), anything left
 * unbound listed for Remap; a Library profile is copied as it is. The studio adds it as a new screen and opens it in
 * the InfoPanel editor. The home page's Create cards open it on step 2. Lazy-loaded with its gallery and the template
 * data.
 */
import { isProfileItem } from "@/lib/my-library/component-meta";
import { useEffect, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { useSensorCatalog } from "@/lib/catalog";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { templateById } from "@/lib/infopanel/templates/catalog";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import type { Role } from "@/lib/infopanel/templates/roles";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { canvasData, copyOfProfile } from "@/lib/my-library/canvas-link";
import type { SensorMap } from "@/modules/types";
import CanvasZone from "./CanvasZone";
import { ProfileThumb } from "./profile-thumb";
import { RoleSensors, type RoleOverrides } from "./role-sensors";
import { NewWizard, OtherStarts, WizardPreview, type WizardStep } from "../templates/new-wizard";
import { SizePicker, INPUT } from "../templates/size-picker";
import { useSizeChoice } from "../templates/use-size-choice";
import { VariantChips } from "../templates/variant-chips";
import { TemplateGallery, paletteChips, type GalleryChoice } from "./template-gallery";

/** The size Blank opens at: InfoPanel's usual panel. */
const BLANK_SIZE = { width: 800, height: 480 };

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

interface NewProfileWizardProps {
  onCreate: (p: NewProfile) => void;
  /** Cancel or Escape: back to where it was opened from. */
  onCancel: () => void;
  onImport: () => void;
  /** The home page's Create card it starts from: it opens on step 2 with that choice. */
  initial?: GalleryChoice;
}

export function NewProfileWizard({ onCreate, onCancel, onImport, initial }: NewProfileWizardProps) {
  const [step, setStep] = useState<WizardStep>(initial ? 1 : 0);
  const [name, setName] = useState("New profile");
  const [choice, setChoice] = useState<GalleryChoice>(initial ?? { template: null, variant: "" });
  const sized = useSizeChoice(BLANK_SIZE, initial?.template ? templateById(initial.template) : undefined);
  const [overrides, setOverrides] = useState<RoleOverrides>({});
  const [toLibrary, setToLibrary] = useState(false);
  const [profiles, setProfiles] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors as unknown as Record<string, DataApiValue>;
  const hwinfo = catalog.sources?.hwinfo;
  const fromLibrary = choice.library ? profiles.find((i) => i.id === choice.library) : undefined;
  const libSize = fromLibrary && { width: Number(fromLibrary.meta.width) || 800, height: Number(fromLibrary.meta.height) || 480 };
  const size = libSize ?? sized.size;
  const shown = libSize ?? sized.shown;
  const ok = name.trim() !== "" && size.width !== null && size.height !== null;
  const template = choice.template ? templateById(choice.template) : undefined;
  useEffect(() => {
    listLibrary().then((all) => setProfiles(all.filter(isProfileItem)), () => setProfiles([]));
  }, []);
  // The roles the template reads and the sensor each has (size doesn't change them).
  const roles = useMemo(
    () => (template ? instantiate(template, { name: "roles", width: 480, height: 320, variant: choice.variant, sensors, hwinfo, overrides }).roles : []),
    [template, choice.variant, sensors, hwinfo, overrides],
  );
  // The preview is the profile Create makes, drawn by the kiosk's renderer with this machine's data.
  const preview = useMemo(
    () =>
      template && step === 1 ? instantiate(template, { name: template.name, width: shown.width, height: shown.height, variant: choice.variant, sensors, hwinfo, overrides }).stored : undefined,
    [template, step, shown.width, shown.height, choice.variant, sensors, hwinfo, overrides],
  );
  const choose = (next: GalleryChoice) => {
    setOverrides({});
    setError(null);
    if (next.template !== choice.template || next.library !== choice.library) sized.follow(next.template ? templateById(next.template) : undefined);
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
      const made = template ? instantiate(template, { ...p, variant: choice.variant, sensors, hwinfo, overrides }) : { stored: newStored(p), unbound: [] };
      onCreate({ ...p, stored: made.stored, unbound: made.unbound, toLibrary });
    }
  };
  return (
    <NewWizard
      title="New InfoPanel profile"
      helpArticle="infopanel-editor"
      step={step}
      onStep={setStep}
      onCancel={onCancel}
      onCreate={() => void create()}
      canCreate={ok}
      start={
        <>
          <TemplateGallery choice={choice} onChoice={choose} width={shown.width} height={shown.height} profiles={profiles} />
          <OtherStarts items={[{ id: "import", icon: FileUp, title: "Import an .infopanel file", note: "A profile exported from InfoPanel, edited here.", onSelect: onImport }]} />
        </>
      }
      fields={
        <>
          {!fromLibrary && <SizePicker {...sized.picker} />}
          {template && <VariantChips variants={paletteChips(template)} value={choice.variant} onChange={(variant) => setChoice((c) => ({ ...c, variant }))} />}
          <RoleSensors roles={roles} onOverride={override} />
          <label className="block max-w-[400px]">
            <span className="mb-1 block text-[12px] text-ui-3">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-ui-2">
            <input type="checkbox" checked={toLibrary} onChange={(e) => setToLibrary(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ui-accent)]" />
            Also save to Library
          </label>
          {error && <p className="text-[11.5px] text-ui-danger">{error}</p>}
        </>
      }
      note={
        <>
          It comes in as a new screen and opens in the InfoPanel editor. You can change the size later in its profile settings.
          {choice.template !== null && " A template's sensors are matched to this PC's; anything not found is left unbound for you to Remap."}
        </>
      }
      preview={
        <WizardPreview width={shown.width} height={shown.height}>
          {preview ? (
            <CanvasZone canvas={preview} sensors={catalog.sensors as SensorMap} />
          ) : fromLibrary ? (
            <ProfileThumb item={fromLibrary} />
          ) : (
            <div className="grid h-full w-full place-items-center text-[12px] text-ui-4">An empty canvas</div>
          )}
        </WizardPreview>
      }
    />
  );
}

export default NewProfileWizard;
