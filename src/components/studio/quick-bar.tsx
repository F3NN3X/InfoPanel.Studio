import { useEffect, useRef, useState, type ReactNode } from "react";
import { BoxSelect, Eye, EyeOff, LayoutDashboard, Link2, SlidersHorizontal } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import type { Placement, ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { ALIGN_CODES } from "@/modules/setting-readers";
import type { ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { ColorSwatches, swatchBackground } from "./inspector/color-swatches";
import { useQuickPins } from "./inspector/inspector-prefs";
import { selectionFields, shownValues, zoneDefs } from "./inspector/zone-fields";
import { zoneName } from "./inspector/zone-meta";
import { isVisible, rowSection, sharedDefs, sourceState } from "./inspector-model";
import { splitUnit } from "./inspector/number-box";
import { quickDefsFor } from "./quick-sets";
import { SET_HERE } from "./settings-model";
import { writeField, type FieldsApi } from "./settings-panel";
import { moduleIcon } from "./zone-icons";

interface QuickBarProps {
  /** The selected zones (empty: the dashboard). */
  zones: Placement[];
  appearance: Appearance;
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  onToggleVisible: () => void;
  /** Floating mode: "All settings" opens or closes the inspector (docked shows it already). */
  allSettings?: { open: boolean; onToggle: () => void };
  /** Keep this much room on the right (the open floating inspector). */
  insetRight?: number;
  /** A pinned row whose section follows the theme: open the inspector at that section. */
  onOpenSection?: (section: string, key: string) => void;
}

/** A choice with this many options or fewer shows as buttons; more is a select. */
const SEGMENT_MAX = 4;

const ROW_NAMES: Record<string, string> = { t: "Top", m: "Middle", b: "Bottom" };
const COL_NAMES: Record<string, string> = { l: "left", c: "center", r: "right" };
/** An alignment's cells as choices (the quick bar's select; the spread toggle stays in the inspector). */
const ALIGN_OPTIONS = [{ value: "auto", label: "Auto" }, ...ALIGN_CODES.map((c) => ({ value: c, label: `${ROW_NAMES[c[0]]} ${COL_NAMES[c[1]]}` }))];

/** One setting as a compact control: toggle, buttons or a select, a slider with its value, a colour swatch, text. */
function QuickControl({
  def,
  value,
  fields,
  colorOpen,
  onColor,
}: {
  def: ModuleSetting;
  value: ModuleSettingValue;
  fields: FieldsApi;
  colorOpen: boolean;
  onColor: () => void;
}) {
  const write = (v: ModuleSettingValue) => writeField(fields, def, v);
  switch (def.type) {
    case "boolean":
      return <Toggle checked={value === true} onChange={write} label={def.label} className="[&>span]:bg-ui-1" />;
    case "color": {
      const color = typeof value === "string" ? value : "";
      return (
        <button
          type="button"
          aria-label={`${def.label} color`}
          aria-expanded={colorOpen}
          onClick={onColor}
          className={cn("h-[22px] w-[22px] shrink-0 rounded-full", colorOpen && "shadow-[0_0_0_2px_#17171b,0_0_0_4px_#ededf0]")}
          style={{ background: swatchBackground(color) }}
        />
      );
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(def.default) || 0;
      const unit = splitUnit(def.label).unit ?? "";
      if (def.min === undefined || def.max === undefined)
        return (
          <input
            type="number"
            aria-label={def.label}
            value={n}
            step={def.step}
            onChange={(e) => write(e.target.value === "" ? Number(def.default) || 0 : Number(e.target.value))}
            className="h-[26px] w-16 rounded-md border border-ui-control bg-ui-app px-1.5 text-right font-ui-mono text-[11.5px] text-ui-1 outline-none focus:border-ui-accent"
          />
        );
      return (
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            aria-label={def.label}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={n}
            onChange={(e) => write(e.currentTarget.valueAsNumber)}
            className="m-0 h-4 w-20 cursor-pointer accent-[var(--ui-accent)]"
          />
          <span className="min-w-9 text-right font-ui-mono text-[11px] text-ui-1">
            {n}
            {unit}
          </span>
        </span>
      );
    }
    case "align":
      return (
        <select
          aria-label={def.label}
          value={String(value)}
          onChange={(e) => fields.onPatch({ [def.key]: e.target.value })}
          className="h-[26px] max-w-[150px] cursor-pointer rounded-md border border-ui-control bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
        >
          {ALIGN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "select": {
      const options = def.options ?? [];
      if (options.length > 0 && options.length <= SEGMENT_MAX)
        return (
          <Segmented
            options={options.map((o) => ({ value: o.value, label: o.label }))}
            value={String(value)}
            onChange={write}
            label={def.label}
            className="shrink-0 flex-nowrap gap-0.5 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:py-1"
          />
        );
      return (
        <select
          aria-label={def.label}
          value={String(value)}
          onChange={(e) => write(e.target.value)}
          className="h-[26px] max-w-[150px] cursor-pointer rounded-md border border-ui-control bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    default:
      return (
        <input
          type={def.type === "date" || def.type === "time" ? def.type : "text"}
          aria-label={def.label}
          value={String(value)}
          onChange={(e) => write(e.target.value)}
          className="h-[26px] w-[120px] rounded-md border border-ui-control bg-ui-app px-2 text-[12px] text-ui-1 outline-none [color-scheme:dark] focus:border-ui-accent"
        />
      );
  }
}

/** A following row's theme value, read-only: a swatch, On / Off, the option or the number. */
function ThemeValue({ def, value }: { def: ModuleSetting; value: ModuleSettingValue }) {
  if (def.type === "color")
    return <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full" style={{ background: swatchBackground(String(value ?? "")) }} />;
  const text =
    def.type === "boolean"
      ? value === true
        ? "On"
        : "Off"
      : def.type === "select" || def.type === "align"
        ? ((def.type === "align" ? ALIGN_OPTIONS : def.options)?.find((o) => o.value === String(value))?.label ?? String(value))
        : def.type === "number"
          ? `${value}${splitUnit(def.label).unit ?? ""}`
          : String(value) || "—";
  return <span className="max-w-[120px] truncate font-ui-mono text-[11.5px]">{text}</span>;
}

function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-ui-strong" />;
}

/** The identity group: a 28 px icon tile and the name. */
function Identity({ icon, name }: { icon: ReactNode; name: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 pl-1 pr-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#1f1f25] text-[oklch(0.80_0.12_255)] [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <span className="max-w-[160px] truncate text-[12.5px] font-semibold text-ui-1">{name}</span>
    </span>
  );
}

/**
 * The quick bar: a floating pill centred over the top of the canvas with
 * the selection's pinned settings as compact controls (pins are per widget
 * type, set from the inspector's rows). Identity on the left and the
 * visibility and "All settings" buttons on the right stay put; only the
 * controls between them scroll sideways. With nothing selected it names the
 * dashboard and opens its settings. A colour opens a swatch row under the
 * bar; a click anywhere else closes it first.
 */
export function QuickBar({ zones, appearance, updateProfile, onToggleVisible, allSettings, insetRight = 0, onOpenSection }: QuickBarProps) {
  const pins = useQuickPins();
  const [colorKey, setColorKey] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Another selection closes the swatch row.
  const selectionKey = zones.map((z) => z.id).join();
  useEffect(() => setColorKey(null), [selectionKey]);

  // A click outside the bar and its swatch row closes the row and goes no further (it does not deselect).
  useEffect(() => {
    if (colorKey === null) return;
    const onClick = (e: MouseEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      e.preventDefault();
      setColorKey(null);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [colorKey]);

  const fields: FieldsApi | null = zones.length > 0 ? selectionFields(zones, appearance, updateProfile) : null;
  const defs = fields ? quickDefsFor(zones, pins, zoneDefs) : [];
  const effective = fields ? shownValues(fields.values, sharedDefs(zones.map(zoneDefs))) : {};
  const shown = defs.filter((d) => isVisible(d, effective));
  const colorDef = shown.find((d) => d.key === colorKey);

  const one = zones.length === 1 ? zones[0] : null;
  const Icon = one ? moduleIcon(one.module) : null;
  const identity =
    zones.length === 0 ? (
      <Identity icon={<LayoutDashboard />} name="Dashboard" />
    ) : one && Icon ? (
      <Identity icon={<Icon />} name={zoneName(one)} />
    ) : (
      <Identity icon={<BoxSelect />} name={`${zones.length} widgets`} />
    );
  const hidden = zones.length > 0 && zones.every((z) => !z.visible);

  return (
    <div
      ref={root}
      className="pointer-events-none absolute left-0 top-3 z-30 flex flex-col items-center gap-2 px-3"
      style={{ right: insetRight }}
    >
      <div
        role="toolbar"
        aria-label="Quick settings"
        className="pointer-events-auto flex h-[46px] max-w-full items-center gap-1 rounded-xl border border-ui-strong bg-ui-raised px-1.5 font-ui shadow-[0_8px_24px_rgba(0,0,0,.45)]"
      >
        {identity}
        {fields && (
          <>
            <Divider />
            <div className="flex min-w-0 flex-[0_1_auto] items-center gap-0.5 overflow-x-auto px-2 [mask-image:linear-gradient(to_right,transparent,#000_8px,#000_calc(100%-8px),transparent)] [scrollbar-width:none]">
              {shown.length === 0 ? (
                <span className="whitespace-nowrap px-2 text-[11.5px] text-ui-4">Pin settings from the panel to show them here</span>
              ) : (
                shown.map((def) => {
                  const changed = SET_HERE.has(sourceState(def, fields.values));
                  // Following the theme: the theme's value, and a way to the section's Customize.
                  const section = fields.readOnly?.(def) ? rowSection(def) : undefined;
                  return (
                    <span
                      key={def.key}
                      className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-[9px] hover:bg-[#1e1e24]"
                    >
                      {changed && <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-ui-accent" />}
                      <span className="whitespace-nowrap text-[11.5px] text-ui-3">{splitUnit(def.label).label}</span>
                      {section ? (
                        <button
                          type="button"
                          onClick={() => onOpenSection?.(section, def.key)}
                          title="Follows the theme: open its section to customize"
                          aria-label={`${def.label}: follows the theme`}
                          className="flex items-center gap-1.5 text-ui-3 hover:text-ui-1"
                        >
                          <ThemeValue def={def} value={fields.shown(def.key, def)} />
                          <Link2 className="h-3 w-3 shrink-0" aria-hidden />
                        </button>
                      ) : (
                        <QuickControl
                          def={def}
                          value={fields.shown(def.key, def)}
                          fields={fields}
                          colorOpen={colorKey === def.key}
                          onColor={() => setColorKey((k) => (k === def.key ? null : def.key))}
                        />
                      )}
                    </span>
                  );
                })
              )}
            </div>
          </>
        )}
        {(fields || allSettings) && <Divider />}
        <span className="flex shrink-0 items-center gap-0.5">
          {fields && (
            <button
              type="button"
              onClick={onToggleVisible}
              title={hidden ? "Show" : "Hide"}
              aria-label={hidden ? "Show" : "Hide"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ui-3 hover:bg-[#1e1e24] hover:text-ui-1"
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          {allSettings && (
            <button
              type="button"
              onClick={allSettings.onToggle}
              aria-pressed={allSettings.open}
              className={cn(
                "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] font-medium",
                allSettings.open ? "bg-ui-active text-ui-1" : "text-ui-2 hover:bg-[#1e1e24] hover:text-ui-1"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              All settings
            </button>
          )}
        </span>
      </div>
      {fields && colorDef && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-ui-strong bg-ui-raised py-1.5 pl-3 pr-1.5 shadow-[0_8px_24px_rgba(0,0,0,.45)]">
          <span className="whitespace-nowrap text-[11.5px] text-ui-3">{colorDef.label}</span>
          <ColorSwatches
            value={String(fields.shown(colorDef.key, colorDef) ?? "")}
            label={colorDef.label}
            onChange={(v) => writeField(fields, colorDef, v)}
            className="border-0 bg-transparent p-1"
          />
        </div>
      )}
    </div>
  );
}

