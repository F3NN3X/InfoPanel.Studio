/**
 * "New screen", a page over Screens (`new-wizard.tsx`). Step 1: Blank or a native screen template from the gallery, or
 * another way in (the sample layout, an InfoPanel profile, Import). Step 2: the size (a preset or custom), the
 * template's palette, a name and a preview at that size. A template brings its own size until the size is changed
 * here; Blank opens at the size given. Blank is an empty grid (`newProfile`); a template is made for the size with its
 * sensors found on this machine's Data API (`instantiate`). The studio adds the screen as one undo step. Lazy-loaded
 * with its gallery and the template data.
 */
import { useMemo, useState } from "react";
import { FileUp, LayoutTemplate, Shuffle } from "lucide-react";
import { useSensorCatalog } from "@/lib/catalog";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { defaultConfig, newProfile, type MonitorProfile } from "@/lib/layout";
import { screenTemplateById } from "@/lib/screen-templates/catalog";
import { instantiate } from "@/lib/screen-templates/instantiate";
import { NewWizard, OtherStarts, WizardPreview, type WizardStep } from "../../templates/new-wizard";
import { ScreenTemplateGallery } from "../../templates/screen-template-gallery";
import { INPUT, SizePicker } from "../../templates/size-picker";
import type { Size } from "../../templates/size-presets";
import { useSizeChoice } from "../../templates/use-size-choice";
import { VariantChips } from "../../templates/variant-chips";
import { ProfilePage } from "../profile-page";

export interface NewScreen {
  profile: MonitorProfile;
  /** The template's sensors not found on this machine, in plain words; empty for Blank. */
  unbound: string[];
}

interface NewScreenWizardProps {
  /** The size Blank opens at. */
  start: Size;
  onCreate: (made: NewScreen) => void;
  /** Cancel or Escape: back to Screens. */
  onCancel: () => void;
  /** The other ways in, each leaving the wizard. */
  onSample: () => void;
  onInfoPanel: () => void;
  onImport: () => void;
}

export function NewScreenWizard({ start, onCreate, onCancel, onSample, onInfoPanel, onImport }: NewScreenWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const [name, setName] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | undefined>();
  const sized = useSizeChoice(start);
  const catalog = useSensorCatalog();
  const template = choice ? screenTemplateById(choice) : undefined;
  const { size, shown } = sized;
  // Until a name is typed it follows the choice.
  const shownName = name ?? template?.name ?? "New screen";
  const ok = shownName.trim() !== "" && size.width !== null && size.height !== null;
  const palette = template ? (variant ?? template.variants?.[0]?.id ?? "") : "";
  const choose = (id: string | null) => {
    if (id === choice) return;
    sized.follow(id ? screenTemplateById(id) : undefined);
    setVariant(undefined);
    setChoice(id);
  };
  const sensors = catalog.sensors as unknown as Record<string, DataApiValue>;
  const create = () => {
    if (!ok) return;
    const p = { name: shownName.trim(), width: size.width!, height: size.height! };
    onCreate(template ? instantiate(template, { ...p, variant, sensors }) : { profile: newProfile(p.name, p.width, p.height), unbound: [] });
  };
  // The preview is the screen Create makes, drawn live with this machine's data.
  const preview = useMemo(
    () => (template && step === 1 ? instantiate(template, { name: template.name, variant, width: shown.width, height: shown.height, sensors }).profile : undefined),
    [template, step, variant, shown.width, shown.height, sensors],
  );
  const dashboard = useMemo(() => defaultConfig(), []);
  return (
    <NewWizard
      title="New screen"
      helpArticle="profiles"
      step={step}
      onStep={setStep}
      onCancel={onCancel}
      onCreate={create}
      canCreate={ok}
      start={
        <>
          <ScreenTemplateGallery choice={choice} onChoice={choose} variant={variant} width={shown.width} height={shown.height} />
          <OtherStarts
            items={[
              { id: "sample", icon: LayoutTemplate, title: "The sample layout", note: "A dashboard with a bit of everything, made at once.", onSelect: onSample },
              { id: "infopanel", icon: Shuffle, title: "An InfoPanel profile", note: "Blank or from a template, edited in the InfoPanel editor.", onSelect: onInfoPanel },
              { id: "import", icon: FileUp, title: "Import a file", note: "A screen or an .infopanel profile from a file.", onSelect: onImport },
            ]}
          />
        </>
      }
      fields={
        <>
          <SizePicker {...sized.picker} />
          {template?.variants && <VariantChips variants={template.variants} value={palette} onChange={setVariant} />}
          <label className="block max-w-[400px]">
            <span className="mb-1 block text-[12px] text-ui-3">Name</span>
            <input value={shownName} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
          </label>
        </>
      }
      note={
        <>
          It comes in as a new screen. You can change its size and grid later on Screens.
          {template && " The template's widgets find this PC's sensors; a reading not found is replaced by a similar one or left out."}
        </>
      }
      preview={
        <WizardPreview width={shown.width} height={shown.height} native={preview !== undefined}>
          {preview ? <ProfilePage profile={preview} dashboard={dashboard} /> : <div className="grid h-full w-full place-items-center text-[12px] text-ui-4">An empty grid</div>}
        </WizardPreview>
      }
    />
  );
}

export default NewScreenWizard;
