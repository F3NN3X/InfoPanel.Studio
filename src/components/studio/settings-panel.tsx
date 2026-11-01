import { Pin } from "lucide-react";
import type { ApiSources } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/theme-model";
import { tempUnitOf } from "@/modules/setting-readers";
import {
  settingKeys,
  type ModuleSetting,
  type ModuleSettingValue,
  type ModuleSettings,
} from "@/modules/types";
import { SourceDot } from "./inspector/source-dot";
import { sourceState, type LookValues } from "./inspector-model";
import { presetDefaults, SET_HERE } from "./settings-model";
import { SettingRow } from "./setting-control";

/** What a Thresholds row reads for its temperature unit (the widget's, else the theme's). */
const TEMP_UNIT: ModuleSetting = { key: "tempUnit", label: "Temperature", type: "select", default: "c", section: "format" };

/** What the fields of one inspector read and write (a zone, several zones, a global style). */
export interface FieldsApi {
  /** Where each value comes from (the source dots, changed counts, resets). */
  values: LookValues;
  /** The value a row shows for one key. */
  shown: (key: string, def: ModuleSetting) => ModuleSettingValue;
  /** `editKey` (a field of a composite control) replaces the setting key in the undo coalescing. */
  onChange: (key: string, value: ModuleSettingValue, editKey?: string) => void;
  /** Set several keys as one change (an "align" picker's two axes). */
  onPatch: (patch: ModuleSettings) => void;
  /** Drop settings' own values (back to the inherited / default ones) as one change. */
  onClear: (keys: string[]) => void;
  /** Sensor settings: the data picker's "Open data explorer". */
  onOpenExplorer?: () => void;
  /** The quick bar's pins of this widget type (none where the context has no quick bar). */
  pins?: { has: (key: string) => boolean; toggle: (key: string) => void };
  /** A zone: whether a row shows its theme value read-only (its section follows the theme). */
  readOnly?: (def: ModuleSetting) => boolean;
  /** Several zones: whether the selected zones show different values for this row (it reads "Mixed"). */
  mixed?: (def: ModuleSetting) => boolean;
}

/** Setting types whose value is one plain key (a toggle, number, colour, choice, text or icon). */
const PLAIN_TYPES = new Set(["boolean", "number", "color", "select", "text", "icon"]);

/**
 * Whether writing `value` should drop the setting's own value instead: it
 * equals what the field shows without one (the inherited global style, else
 * the default), so it would not count as changed anyway. Only plain,
 * single-key settings; a multi-select or a composite control keeps its value.
 */
export function clearsOwn(def: ModuleSetting, value: ModuleSettingValue, values: LookValues): boolean {
  if (!PLAIN_TYPES.has(def.type) || def.keyY || def.multiple || values.own?.[def.key] === undefined) return false;
  const base = values.inherited?.[def.key] ?? def.default;
  return value === base || (base === undefined && value === "");
}

/** Write a field's value, or drop its own value when the write would equal what it inherits (`clearsOwn`). */
export function writeField(fields: FieldsApi, def: ModuleSetting, value: ModuleSettingValue, editKey?: string) {
  if (!editKey && clearsOwn(def, value, fields.values)) fields.onClear([def.key]);
  else fields.onChange(def.key, value, editKey);
}

/** A preset row's bundled keys as the zone shows them (their defaults: the default option's bundle). */
function bundleOf(def: ModuleSetting, fields: FieldsApi): ModuleSettings {
  return Object.fromEntries(
    Object.entries(presetDefaults(def)).map(([key, fallback]) => [key, fields.shown(key, { key, label: key, type: "boolean", default: fallback })])
  );
}

/** The audio widgets' Show filter row, read for the device pickers. */
const DEVICE_ROW: ModuleSetting = { key: "device", label: "Device", type: "select", default: "" };
const FLOW_ROW: ModuleSetting = { key: "flow", label: "Show", type: "select", default: "all" };

/** The quick-bar pin at a row's end: grey outline, or filled accent when pinned. */
function PinButton({ pinned, label, onToggle }: { pinned: boolean; label: string; onToggle: () => void }) {
  const title = pinned ? `Unpin ${label} from the quick bar` : `Pin ${label} to the quick bar`;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-label={title}
      aria-pressed={pinned}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-[#1e1e24]",
        pinned ? "text-ui-accent-text" : "text-ui-4 hover:text-ui-2"
      )}
    >
      <Pin className="h-[15px] w-[15px]" fill={pinned ? "currentColor" : "none"} strokeWidth={1.75} />
    </button>
  );
}

/**
 * One setting as a field row (padding 3px 10px 3px 16px): the source dot
 * (clicking one set here resets the setting), the label (brighter when set
 * here), the hint, the control chosen by its schema type, and the quick-bar
 * pin where the context has a quick bar. A row whose section follows the
 * theme shows the theme's value, dimmed and disabled (`fields.readOnly`);
 * a colour row with a palette role names the role ("Series 1").
 */
export function SettingField({
  def,
  fields,
  sources,
}: {
  def: ModuleSetting;
  fields: FieldsApi;
  sources: ApiSources | null;
}) {
  const state = sourceState(def, fields.values);
  const pins = fields.pins;
  const readOnly = fields.readOnly?.(def) ?? false;
  const mixed = fields.mixed?.(def) ?? false;
  return (
    <fieldset
      data-setting-key={def.key}
      disabled={readOnly}
      title={readOnly ? "Set by the theme: customize the section (or edit its lock) to change it" : undefined}
      className={cn("m-0 min-w-0 border-0 py-[3px] pl-4 pr-2.5", readOnly && "opacity-50")}
    >
      <SettingRow
        def={def}
        value={fields.shown(def.key, def)}
        valueY={def.keyY ? fields.shown(def.keyY, def) : undefined}
        bundle={def.type === "preset" ? bundleOf(def, fields) : undefined}
        onChange={(v, editKey) => writeField(fields, def, v, editKey)}
        onPatch={fields.onPatch}
        onApply={fields.onPatch}
        onOpenExplorer={fields.onOpenExplorer}
        sources={sources}
        hint={def.hint}
        tempUnit={def.quantity === "temp" ? tempUnitOf({ tempUnit: fields.shown("tempUnit", TEMP_UNIT) }) : undefined}
        roleLabel={readOnly && def.role ? ROLE_LABELS[def.role] : undefined}
        flow={
          def.optionsFrom === "audio" || def.optionsFrom === "wavelink"
            ? String(fields.shown("flow", FLOW_ROW))
            : def.optionsFrom === "streamdeck-grid"
              ? String(fields.shown("device", DEVICE_ROW))
              : undefined
        }
        changed={SET_HERE.has(state)}
        lead={<SourceDot state={state} onReset={() => fields.onClear(settingKeys(def))} />}
        trail={
          mixed || pins ? (
          <>
            {mixed && (
              <span
                title="The selected widgets differ here: the value shown is the primary widget's, and a change sets it on all of them"
                className="shrink-0 rounded-[5px] bg-[#1e1e24] px-1.5 py-px text-[10px] font-medium text-ui-3"
              >
                Mixed
              </span>
            )}
            {pins && <PinButton pinned={pins.has(def.key)} label={def.label} onToggle={() => pins.toggle(def.key)} />}
          </>) : undefined
        }
      />
    </fieldset>
  );
}
