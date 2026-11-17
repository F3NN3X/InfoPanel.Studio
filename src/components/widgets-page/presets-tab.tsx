// The builder inspector's Presets tab (Phase 5b, screenshot 06): named sets of option values and a size. Picking one shows it on
// the stage, with its option values to change there; "Save current as a preset" keeps the stage's values and size under a name.
// One is the default (what a fresh add is): its values are the options' defaults. Phase D (G30): a preset's blurb (the Add panel's line)
// and its values of text, sensor, place list and device options too.
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ITEM, POPUP } from "@/components/studio/menu-styles";
import { cn } from "@/lib/utils";
import { PlaceListEditor } from "@/components/studio/place-list/place-list-editor";
import { placeList } from "@/components/studio/place-list/place-search";
import type { Data } from "@/widgets/core/types";
import type { Cells, Recipe, RecipeDeviceKind } from "@/widgets/recipe/types";
import { blurbOf, presetLine, presetOptions, presetValues, removePreset, savePreset, setDefaultPreset, setPresetValue, updatePreset, withSampleItems } from "./builder-model";
import { Field, INPUT, NumberInput, Select, TextInput } from "./fields";
import { SensorDefault } from "./options-tab";

export interface PresetsTabProps {
  recipe: Recipe;
  onChange: (recipe: Recipe) => void;
  /** The preset the stage shows. */
  current: string | null;
  onPick: (id: string) => void;
  /** The stage's option values and size, for "Save current as a preset". */
  values: Record<string, unknown>;
  size: Cells;
  /** The readings the stage has (a sensor value's reading) and the devices in them (a device value's choices). */
  data: Data;
  devices: Partial<Record<RecipeDeviceKind, string[]>>;
  onOpenSources: () => void;
}

export function PresetsTab({ recipe, onChange, current, onPick, values, size, data, devices, onOpenSources }: PresetsTabProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="mb-1 text-caption leading-snug text-ui-3">Named sets of options and size. People can also save their own</p>
      {recipe.presets.map((p) => (
        <div key={p.id} className="flex flex-col gap-1">
        <div data-preset={p.id} className={cn("flex items-center gap-2 rounded-ui-lg border bg-ui-panel pr-1.5", current === p.id ? "border-ui-accent" : "border-ui-subtle hover:border-ui-strong")}>
          {renaming === p.id ? (
            <input
              autoFocus
              aria-label="Preset name"
              defaultValue={p.name}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) onChange(updatePreset(recipe, p.id, { name: e.currentTarget.value.trim().slice(0, 40) }));
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(null);
              }}
              className={cn(INPUT, "m-2 flex-1")}
            />
          ) : (
            <button type="button" onClick={() => onPick(p.id)} aria-pressed={current === p.id} className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent">
              <span className="block truncate text-body text-ui-1">{p.name}</span>
              <span className="block truncate text-caption text-ui-3">{presetLine(recipe, p)}</span>
            </button>
          )}
          {p.default && <span className="rounded-ui-sm border border-ui-strong px-1.5 py-0.5 text-micro text-ui-2">Default</span>}
          <Menu.Root>
            <Menu.Trigger aria-label={`More for ${p.name}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-ui-md text-ui-3 hover:bg-ui-raised hover:text-ui-1 data-popup-open:bg-ui-raised">
              <MoreHorizontal className="h-4 w-4" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
                <Menu.Popup className={POPUP}>
                  <Menu.Item className={ITEM} onClick={() => setRenaming(p.id)}>
                    Rename
                  </Menu.Item>
                  <Menu.Item className={ITEM} disabled={!!p.default} onClick={() => onChange(setDefaultPreset(recipe, p.id))}>
                    Make it the default
                  </Menu.Item>
                  <Menu.Item className={ITEM} onClick={() => onChange(updatePreset(recipe, p.id, { size: [...size] as Cells }))}>
                    Use the stage's size ({size[0]}×{size[1]})
                  </Menu.Item>
                  <Menu.Item className={`${ITEM} text-ui-danger`} disabled={recipe.presets.length < 2} onClick={() => onChange(removePreset(recipe, p.id))}>
                    Remove
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        {current === p.id && <PresetValues recipe={recipe} id={p.id} onChange={onChange} data={data} devices={devices} onOpenSources={onOpenSources} />}
        </div>
      ))}
      {naming === null ? (
        <Button small className="mt-1 self-start" icon={<Plus strokeWidth={1.5} />} onClick={() => setNaming("")}>
          Save current as a preset
        </Button>
      ) : (
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!naming.trim()) return;
            const next = savePreset(recipe, naming.trim(), values, size);
            onChange(next);
            onPick(next.presets[next.presets.length - 1].id);
            setNaming(null);
          }}
        >
          <input autoFocus aria-label="New preset name" placeholder="Preset name" value={naming} onChange={(e) => setNaming(e.target.value.slice(0, 40))} onKeyDown={(e) => e.key === "Escape" && setNaming(null)} className={cn(INPUT, "flex-1")} />
          <Button small type="submit" disabled={!naming.trim()}>
            Save
          </Button>
        </form>
      )}
    </div>
  );
}

/** The picked preset's blurb and option values, changed in place (the default preset's values are the options' defaults). */
function PresetValues({ recipe, id, onChange, data, devices, onOpenSources }: { recipe: Recipe; id: string; onChange: (recipe: Recipe) => void } & Pick<PresetsTabProps, "data" | "devices" | "onOpenSources">) {
  const preset = recipe.presets.find((p) => p.id === id)!;
  const values = presetValues(recipe, preset);
  const rows = presetOptions(recipe);
  const size = preset.size;
  // a place list's default places are the sample's items, so the default preset's list remakes them
  const set = (key: string, v: unknown) => onChange(withSampleItems(setPresetValue(recipe, id, key, v)));
  const setSize = (axis: 0 | 1, v: number | undefined) => {
    if (size === "rail") return;
    const next = [...size] as Cells;
    next[axis] = Math.max(1, Math.min(12, Math.round(v ?? 1)));
    onChange(updatePreset(recipe, id, { size: next }));
  };
  return (
    <div data-preset-values={id} className="mb-1 flex flex-col gap-1 rounded-ui-md border border-ui-subtle px-3 py-1.5">
      {size === "rail" ? (
        <Field label="Size">
          <span className="text-ui-2">A rail slot</span>
        </Field>
      ) : (
        <Field label="Size">
          <NumberInput label="Preset columns" value={size[0]} min={1} max={12} onChange={(v) => setSize(0, v)} width={56} />
          <span className="text-ui-3">×</span>
          <NumberInput label="Preset rows" value={size[1]} min={1} max={12} onChange={(v) => setSize(1, v)} width={56} />
        </Field>
      )}
      <Field label="Blurb" hint="The line under its name in Add; empty says what it sets">
        <TextInput label="Blurb" value={preset.blurb ?? ""} placeholder="What it sets" onChange={(v) => onChange(updatePreset(recipe, id, { blurb: blurbOf(v) }))} />
      </Field>
      {rows.map((o) =>
        o.type === "place-list" ? (
          <PlaceListEditor key={o.key} label={o.label} places={placeList(values[o.key])} onChange={(places) => set(o.key, places)} />
        ) : o.type === "sensor" ? (
          <div key={o.key} className="flex flex-col gap-1 py-1">
            <span className="text-body text-ui-2">{o.label}</span>
            <SensorDefault value={String(values[o.key] ?? "")} label={o.label} name={`${o.label} in this preset`} data={data} onPick={(key) => set(o.key, key)} onOpenSources={onOpenSources} />
          </div>
        ) : (
          <Field key={o.key} label={o.label}>
            {o.type === "boolean" && <Toggle label={o.label} checked={values[o.key] === true} onChange={(v) => set(o.key, v)} />}
            {o.type === "select" && <Select label={o.label} value={String(values[o.key])} options={(o.options ?? []).map((c) => ({ value: c.value, label: c.label }))} onChange={(v) => set(o.key, v)} width={130} />}
            {o.type === "number" && <NumberInput label={o.label} value={Number(values[o.key])} min={o.min} max={o.max} onChange={(v) => v !== undefined && set(o.key, v)} />}
            {o.type === "text" && <TextInput label={o.label} value={String(values[o.key] ?? "")} onChange={(v) => set(o.key, v.slice(0, 200))} width={130} />}
            {o.type === "device" && <Select label={o.label} value={String(values[o.key] ?? "auto")} options={deviceChoices(devices[o.kind ?? "cpu"] ?? [], String(values[o.key] ?? "auto"))} onChange={(v) => set(o.key, v)} width={160} />}
          </Field>
        ),
      )}
    </div>
  );
}

/** A device value's choices: Auto, then the devices of its kind the data has, and the value held when the data has it not. */
const deviceChoices = (ids: readonly string[], held: string): { value: string; label: string }[] =>
  [...new Set(["auto", ...ids, held])].map((id) => ({ value: id, label: id === "auto" ? "Auto" : id }));
