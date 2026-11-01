import type { ReactNode } from "react";
import { modules } from "@/modules";
import { STYLE_SETTINGS } from "@/modules/standard-settings";
import { THEME_PRESETS } from "@/lib/theme";
import { SKIN_NAMES, SURFACE_NAMES } from "@/widgets/core/theme";
import { DEFAULT_STATE, type QaState } from "./params";

const optionsOf = (key: string) => (STYLE_SETTINGS.find((s) => s.key === key)?.options ?? []).filter((o) => o.value !== "auto").map((o) => o.value);
const SKINS = SKIN_NAMES;
// The dense view as the QA page names it (`variant`, read by `compactOf` since the standard row became Small zones).
const VARIANTS = ["default", "studio"];
const GRAPHS = optionsOf("graph");
const METERS = optionsOf("meter");
const RADII = optionsOf("radius");
const ACCENTS = ["#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#fbbf24", "#f87171"];
const CELLS = [110, 150];
/** The widgets the Skins and Surfaces galleries can show, by id. */
const GALLERY_IDS = modules.map((m) => m.id).sort();

const field = "h-6 rounded border border-current/25 bg-transparent px-1.5 text-[11px]";

function Label({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1 text-[11px]">
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
    <label className="flex items-center gap-1 text-[11px]">
      <input type="checkbox" className="size-3.5 accent-current" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="opacity-60">{name}</span>
    </label>
  );
}

/** The one global control strip; every change goes through `onChange`, which updates state and the URL. */
export function Toolbar({ state, onChange, onReset }: { state: QaState; onChange: (patch: Partial<QaState>) => void; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <input className={`${field} w-40`} placeholder="Filter id or title" value={state.q} onChange={(e) => onChange({ q: e.target.value })} />
      <Pick name="skin" value={state.skin} options={SKINS} onChange={(skin) => onChange({ skin })} />
      <Pick name="variant" value={state.variant} options={VARIANTS} onChange={(variant) => onChange({ variant })} />
      <Pick name="surface" value={state.surface} options={SURFACE_NAMES} onChange={(surface) => onChange({ surface })} />
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
      <Pick name="page" value={state.theme} options={THEME_PRESETS.map((p) => p.name)} onChange={(theme) => onChange({ theme })} blank="dark" />
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
