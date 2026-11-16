// The builder inspector's Options tab (Phase 5b, screenshots 05 and 07): what people can change when they add the widget, in the
// order its Content tab will show them. Drag a row (or Alt+↑/↓ on it) to reorder; open one to edit its label and default; a
// place list edits its default places with place search (Weather by place), as a placement's Content tab does.
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ITEM, POPUP } from "@/components/studio/menu-styles";
import { cn } from "@/lib/utils";
import { DataPicker } from "@/components/studio/inspector/data-picker";
import { useDataModel } from "@/lib/use-data-model";
import { PlaceListEditor } from "@/components/studio/place-list/place-list-editor";
import { placeList } from "@/components/studio/place-list/place-search";
import type { Data } from "@/widgets/core/types";
import { DEVICE_KINDS, type Recipe, type RecipeDeviceKind, type RecipeOption } from "@/widgets/recipe/types";
import { addOption, bindingsOf, DEVICE_LABEL, flatten, layerName, moveOption, optionLine, optionUses, removeOption, updateOption, withSampleItems } from "./builder-model";
import { changeDeviceKind } from "./device-kind";
import { Field, INPUT, NumberInput, Select, TextInput } from "./fields";

export interface OptionsTabProps {
  recipe: Recipe;
  onChange: (recipe: Recipe) => void;
  /** The readings the stage shows: a device option's Kind maps a key only where the new kind's device has it. */
  data: Data;
  /** The data picker's "Open Data sources". */
  onOpenSources?: () => void;
}

/** The blocks reading each of `keys`, as "Clock (libre.{cpu}_cores__average)". */
function readers(recipe: Recipe, keys: readonly string[]): string[] {
  return keys.map((k) => {
    const names = flatten(recipe)
      .filter(({ block }) => bindingsOf(block).some((b) => "sensor" in b && b.sensor === k))
      .map(({ block }) => layerName(recipe, block));
    return `${names.join(", ") || "A block"} (${k})`;
  });
}

/** "Add an option": the kinds, each with what it starts as. */
const NEW_OPTIONS: readonly { label: string; make: () => RecipeOption }[] = [
  { label: "Toggle", make: () => ({ key: "show", label: "Show", type: "boolean", default: true }) },
  { label: "Choice", make: () => ({ key: "choice", label: "Choice", type: "select", default: "a", options: [{ value: "a", label: "First" }, { value: "b", label: "Second" }] }) },
  { label: "Number", make: () => ({ key: "number", label: "Number", type: "number", default: 8, min: 1, max: 24, step: 1 }) },
  { label: "Text", make: () => ({ key: "text", label: "Text", type: "text", default: "" }) },
  { label: "Place list", make: () => ({ key: "places", label: "Locations", type: "place-list", default: [] }) },
  { label: "Sensor", make: () => ({ key: "sensor", label: "Sensor", type: "sensor", default: "" }) },
  ...DEVICE_KINDS.map((kind) => ({ label: DEVICE_LABEL[kind], make: (): RecipeOption => ({ key: kind, label: DEVICE_LABEL[kind], type: "device", kind, default: "auto" }) })),
];

/** A sensor option's default (G15): the reading picked with the studio's data picker, as the Block tab's data row picks one. */
function SensorDefault({ value, label, data, onPick, onOpenSources }: { value: string; label: string; data: Data; onPick: (key: string) => void; onOpenSources: () => void }) {
  const [open, setOpen] = useState(false);
  const model = useDataModel();
  const name = model.points.find((p) => p.key === value)?.name;
  const raw = data[value];
  const reading = typeof raw === "object" && raw ? raw.value : raw;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Default sensor" className="flex w-full items-center gap-3 rounded-ui-lg border border-ui-subtle bg-ui-app px-3 py-2 text-left hover:border-ui-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ui-1">{value ? (name ?? value) : "No sensor yet"}</span>
          <span className="block truncate font-ui-mono text-micro text-ui-3">{value || "Pick the sensor it starts with"}</span>
        </span>
        {value && <span className="shrink-0 font-ui-mono text-body text-ui-1">{reading ?? "–"}</span>}
      </button>
      <DataPicker open={open} onOpenChange={setOpen} title={`Default of ${label}`} points={model.points} mode="item" bound={new Set(value ? [value] : [])} onToggle={(p) => onPick(p.key)} onOpenExplorer={onOpenSources} />
    </>
  );
}

function OptionEditor({ recipe, o, onChange, data, onOpenSources }: { recipe: Recipe; o: RecipeOption; onChange: (r: Recipe) => void; data: Data; onOpenSources: () => void }) {
  const set = (patch: Partial<RecipeOption>) => onChange(updateOption(recipe, o.key, patch));
  const uses = optionUses(recipe, o.key);
  /** The keys the last Kind change could not map, by the blocks that read them. */
  const [unmapped, setUnmapped] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-2 border-b border-ui-subtle px-3 pb-3 pl-8">
      <Field label="Label">
        <TextInput label="Option label" value={o.label} onChange={(v) => set({ label: v.slice(0, 40) || o.label })} />
      </Field>
      {o.type === "boolean" && (
        <Field label="On by default">
          <Toggle label="On by default" checked={o.default === true} onChange={(v) => set({ default: v })} />
        </Field>
      )}
      {o.type === "number" && (
        <Field label="Default, range">
          <NumberInput label="Default" value={Number(o.default)} onChange={(v) => set({ default: v ?? 0 })} width={56} />
          <NumberInput label="Lowest" value={o.min} onChange={(v) => set({ min: v })} width={56} />
          <NumberInput label="Highest" value={o.max} onChange={(v) => set({ max: v })} width={56} />
        </Field>
      )}
      {o.type === "select" && (
        <>
          {(o.options ?? []).map((c, k) => (
            <Field key={c.value} label={k === 0 ? "Choices" : ""}>
              <TextInput label={`Choice ${k + 1}`} value={c.label} onChange={(v) => set({ options: (o.options ?? []).map((x, i) => (i === k ? { ...x, label: v.slice(0, 40) || x.label } : x)) })} width={130} />
              <button type="button" aria-label={`Remove choice ${c.label}`} disabled={(o.options ?? []).length < 2} onClick={() => set({ options: (o.options ?? []).filter((_, i) => i !== k), default: o.default === c.value ? (o.options ?? []).find((_, i) => i !== k)?.value : o.default })} className="rounded-ui-sm p-1 text-ui-3 hover:text-ui-1 disabled:opacity-40">
                <X className="h-3.5 w-3.5" />
              </button>
            </Field>
          ))}
          <Field label="">
            <Button small icon={<Plus strokeWidth={1.5} />} onClick={() => set({ options: [...(o.options ?? []), { value: freeChoice(o.options ?? []), label: `Choice ${(o.options ?? []).length + 1}` }] })}>
              Add a choice
            </Button>
          </Field>
          <Field label="Default">
            <Select label="Default choice" value={String(o.default)} options={(o.options ?? []).map((c) => ({ value: c.value, label: c.label }))} onChange={(v) => set({ default: v })} />
          </Field>
        </>
      )}
      {o.type === "place-list" && <PlaceListEditor label="Default places" places={placeList(o.default)} onChange={(places) => onChange(withSampleItems(updateOption(recipe, o.key, { default: places })))} />}
      {o.type === "device" && (
        <>
          <Field label="Kind">
            <Select
              label="Kind"
              value={o.kind ?? "cpu"}
              options={DEVICE_KINDS.map((kind) => ({ value: kind, label: DEVICE_LABEL[kind] }))}
              onChange={(kind: RecipeDeviceKind) => {
                const changed = changeDeviceKind(recipe, o.key, kind, data);
                onChange(changed.recipe);
                setUnmapped(readers(changed.recipe, changed.unmapped));
              }}
            />
          </Field>
          {unmapped.length > 0 && (
            <div role="status" data-unmapped="" className="rounded-ui-md border border-ui-warn/40 bg-ui-warn/10 px-2.5 py-2 text-caption leading-snug text-ui-2">
              <p className="text-ui-1">Not mapped to the {DEVICE_LABEL[o.kind ?? "cpu"]}: pick their data again</p>
              <ul className="mt-1 list-disc pl-4">
                {unmapped.map((line) => (
                  <li key={line} className="break-all">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Default">
            <span className="text-body text-ui-2">Auto: the first {DEVICE_LABEL[o.kind ?? "cpu"]} the data has</span>
          </Field>
        </>
      )}
      {o.type === "text" && (
        <Field label="Default">
          <TextInput label="Default" value={String(o.default)} onChange={(v) => set({ default: v.slice(0, 200) })} />
        </Field>
      )}
      {o.type === "sensor" && <SensorDefault value={String(o.default)} label={o.label} data={data} onPick={(key) => set({ default: key })} onOpenSources={onOpenSources} />}
      <div className="flex items-center justify-between pt-1">
        <span className="text-caption text-ui-3">{uses ? `Used by ${uses} block${uses === 1 ? "" : "s"}` : "Not used by a block yet"}</span>
        <Button small variant="danger" disabled={uses > 0} title={uses ? "Take it off its blocks first" : undefined} onClick={() => onChange(withSampleItems(removeOption(recipe, o.key)))}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function OptionsTab({ recipe, onChange, data, onOpenSources = () => {} }: OptionsTabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  /** "Add an option" asks for the name first: the option's key is made from it. */
  const [naming, setNaming] = useState<{ kind: string; name: string } | null>(null);
  const create = () => {
    const kind = NEW_OPTIONS.find((n) => n.label === naming?.kind);
    const name = naming?.name.trim().slice(0, 40);
    if (!kind || !name) return;
    const next = withSampleItems(addOption(recipe, { ...kind.make(), key: name, label: name }));
    onChange(next);
    setOpen(next.options[next.options.length - 1].key);
    setNaming(null);
  };
  return (
    <div className="flex flex-col p-4">
      <p className="mb-3 text-caption leading-snug text-ui-3">What people can change when they add this widget. Shown in its Content tab</p>
      <ul aria-label="Options" className="flex flex-col">
        {recipe.options.map((o, k) => (
          <li
            key={o.key}
            draggable
            onDragStart={(e) => {
              setDrag(k);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => drag !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null) onChange(moveOption(recipe, drag, k));
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            data-option={o.key}
            className={cn("border-b border-ui-subtle", drag === k && "opacity-50")}
          >
            <button
              type="button"
              aria-expanded={open === o.key}
              onClick={() => setOpen(open === o.key ? null : o.key)}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault();
                onChange(moveOption(recipe, k, k + (e.key === "ArrowUp" ? -1 : 1)));
              }}
              title="Drag to reorder (Alt+↑/↓)"
              className="flex w-full items-center gap-2 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ui-hint" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ui-1">{o.label}</span>
                <span className="block truncate text-caption text-ui-3">{optionLine(o)}</span>
              </span>
              {open === o.key ? <ChevronDown className="h-4 w-4 text-ui-3" aria-hidden /> : <ChevronRight className="h-4 w-4 text-ui-3" aria-hidden />}
            </button>
            {open === o.key && <OptionEditor recipe={recipe} o={o} onChange={onChange} data={data} onOpenSources={onOpenSources} />}
          </li>
        ))}
      </ul>
      {naming && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <span className="shrink-0 text-caption text-ui-3">{naming.kind}</span>
          <input autoFocus aria-label="New option name" placeholder="Name people see" value={naming.name} onChange={(e) => setNaming({ ...naming, name: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setNaming(null)} className={cn(INPUT, "min-w-0 flex-1")} />
          <Button small type="submit" disabled={!naming.name.trim()}>
            Add
          </Button>
        </form>
      )}
      <Menu.Root>
        <Menu.Trigger className="mt-3 flex h-8 items-center gap-2 self-start rounded-ui-md px-2 text-body text-ui-accent-text hover:bg-ui-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
          <Plus className="h-4 w-4" aria-hidden /> Add an option
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={6} align="start">
            <Menu.Popup className={POPUP}>
              {NEW_OPTIONS.map((n) => (
                <Menu.Item
                  key={n.label}
                  className={ITEM}
                  onClick={() => setNaming({ kind: n.label, name: "" })}
                >
                  {n.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/** A choice value no other choice of the option has: a placement stores it, so it never changes with the label. */
const freeChoice = (choices: readonly { value: string }[]): string => {
  for (let n = choices.length + 1; ; n++) if (!choices.some((c) => c.value === `c${n}`)) return `c${n}`;
};
