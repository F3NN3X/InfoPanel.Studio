import type { ReactNode } from "react";
import type { ResolvedVariant } from "@/looks/look";
import { ACCENTS, CELLS, FX, GALLERY_IDS, GRAPHS, METERS, PAGE_THEMES, RADII, SKINS, SURFACES, VARIANTS } from "./options";
import { DEFAULT_STATE, type QaFx, type QaState } from "./params";

const field = "h-6 rounded border border-current/25 bg-transparent px-1.5 text-[11px]";

function Label({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1 text-micro">
      <span className="opacity-60">{name}</span>
      {children}
    </label>
  );
}

function Pick({ name, value, options, onChange, blank = "—" }: { name: string; value: string; options: string[]; onChange: (v: string) => void; blank?: string }) {
  return (
    <Label name={name}>
      <select className={`${field} [&>option]:text-black`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Label>
  );
}

function Check({ name, checked, onChange }: { name: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-micro">
      <input type="checkbox" className="size-3.5 accent-current" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="opacity-60">{name}</span>
    </label>
  );
}

interface ToolbarProps {
  state: QaState;
  /** The Looks the `look` control offers (`qaLookIds`). */
  looks: readonly string[];
  /** The worn Look's variants. */
  variants: readonly ResolvedVariant[];
  /** What the last pack import came to. */
  imported: string;
  onImport: (files: FileList) => void;
  onChange: (patch: Partial<QaState>) => void;
  onReset: () => void;
}

/** The one global control strip; every change goes through `onChange`, which updates state and the URL. */
export function Toolbar({ state, looks, variants, imported, onImport, onChange, onReset }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {/* the Look worn as a screen wears it (theme.tsx): before the per-widget controls, which go over it as a widget's own would */}
      <Pick name="look" value={state.look} options={[...looks]} onChange={(look) => onChange({ look, lookVariant: "" })} blank="none" />
      {variants.length > 0 && <Pick name="variant of look" value={state.lookVariant} options={variants.map((v) => v.id)} onChange={(lookVariant) => onChange({ lookVariant })} blank="own" />}
      <Pick name="fx" value={state.fx} options={FX} onChange={(fx) => onChange({ fx: fx as QaFx })} blank="default" />
      <Check name="pack script" checked={state.script} onChange={(script) => onChange({ script })} />
      <label className="flex items-center gap-1 text-micro">
        <span className="opacity-60">import pack</span>
        <input type="file" accept=".zip" className="w-44 text-micro" onChange={(e) => e.target.files?.length && onImport(e.target.files)} />
        {imported && <span className="opacity-80">{imported}</span>}
      </label>
      <Check name="flagged only" checked={state.flagged} onChange={(flagged) => onChange({ flagged })} />
      <Check name="surfaces" checked={state.surfaces} onChange={(surfaces) => onChange({ surfaces })} />
      <span className="basis-full" />
      <input className={`${field} w-40`} placeholder="Filter id or title" value={state.q} onChange={(e) => onChange({ q: e.target.value })} />
      <Pick name="skin" value={state.skin} options={SKINS} onChange={(skin) => onChange({ skin })} />
      <Pick name="variant" value={state.variant} options={VARIANTS} onChange={(variant) => onChange({ variant })} />
      <Pick name="surface" value={state.surface} options={SURFACES} onChange={(surface) => onChange({ surface })} />
      <Pick name="graph" value={state.graph} options={GRAPHS} onChange={(graph) => onChange({ graph })} />
      <Pick name="meter" value={state.meter} options={METERS} onChange={(meter) => onChange({ meter })} />
      <Label name="accent">
        <span className="flex items-center gap-1">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`accent ${c}`}
              onClick={() => onChange({ accent: state.accent === c ? "" : c })}
              className={`size-4 rounded-full border ${state.accent === c ? "border-current" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <input type="color" className="h-6 w-7 bg-transparent" value={state.accent || "#888888"} onChange={(e) => onChange({ accent: e.target.value })} />
        </span>
      </Label>
      <Pick name="radius" value={state.radius} options={RADII} onChange={(radius) => onChange({ radius })} />
      <Label name="cell">
        <span className="flex items-center gap-1">
          {CELLS.map((c) => (
            <button key={c} type="button" onClick={() => onChange({ cell: c })} className={`${field} ${state.cell === c ? "bg-current/20" : ""}`}>
              {c}
            </button>
          ))}
          <input type="number" min={1} className={`${field} w-14`} value={state.cell} onChange={(e) => onChange({ cell: Number(e.target.value) || DEFAULT_STATE.cell })} />
        </span>
      </Label>
      <Label name="gap">
        <input type="number" min={0} className={`${field} w-14`} value={state.gap} onChange={(e) => onChange({ gap: Number(e.target.value) || 0 })} />
      </Label>
      <Label name="spans">
        <input className={`${field} w-44`} value={state.spans} onChange={(e) => onChange({ spans: e.target.value })} />
      </Label>
      <Pick name="page" value={state.theme} options={PAGE_THEMES} onChange={(theme) => onChange({ theme })} blank="dark" />
      <Pick name="gallery" value={state.gallery} options={GALLERY_IDS} onChange={(gallery) => onChange({ gallery })} blank="default" />
      <Label name="data">
        <select className={`${field} [&>option]:text-black`} value={state.data} onChange={(e) => onChange({ data: e.target.value as QaState["data"] })}>
          <option value="fixtures">fixtures</option>
          <option value="stress">stress</option>
          <option value="live">live</option>
        </select>
      </Label>
      <Check name="grid" checked={state.grid} onChange={(grid) => onChange({ grid })} />
      <Check name="noted only" checked={state.noted} onChange={(noted) => onChange({ noted })} />
      <button type="button" onClick={onReset} className={`${field} px-2`}>
        Reset
      </button>
    </div>
  );
}
