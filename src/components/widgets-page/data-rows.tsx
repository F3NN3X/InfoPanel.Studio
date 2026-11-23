// The Block tab's data rows (Phase 5b; Phase A G2-G4): what a block reads and "Let people pick …"; a label's text, typed or from data,
// as a line of parts ("high" " / " "low"); and a heatmap's cells, one row per reading with the data picker, drag to order, or inside a
// Repeat the field of numbers it draws. Every change is one edit of the recipe. Phase D (G33): a weather icon outside a Repeat picks
// from text readings only, with no "Let people pick".
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { ITEM, POPUP } from "@/components/studio/menu-styles";
import { DataPicker } from "@/components/studio/inspector/data-picker";
import { useDataModel } from "@/lib/use-data-model";
import { cn } from "@/lib/utils";
import type { Data } from "@/widgets/core/types";
import { expandKey } from "@/widgets/recipe/reads";
import { isDeviceSource, type RepeatSource, SOURCE_MAIN } from "@/widgets/recipe/sources";
import type { Binding, Block, LabelPart, Recipe, RecipeDeviceKind } from "@/widgets/recipe/types";
import { deviceOfKey, ITEM_NOUN, itemFields, labelParts, layerName, moveItem, pickBinding, pickerPoints, pickedOption, pickWhat, repeatAbove, replaceSensor, setLabelParts, setLabelSource, unpickBinding, updateBlock, type Path } from "./builder-model";
import { Field, Heading, NumberInput, Select, TextInput } from "./fields";

export interface DataRowsProps {
  recipe: Recipe;
  path: Path;
  onChange: (recipe: Recipe) => void;
  /** The readings the stage shows (live or the sample), and their names. */
  data: Data;
  names?: Record<string, string>;
  devices: Partial<Record<RecipeDeviceKind, string[]>>;
  onOpenSources: () => void;
}

/** The key a picked data point is bound as: a key of a device the recipe already lets people pick names that option, so the block follows the pick. */
function keyFor(recipe: Recipe, key: string, devices: DataRowsProps["devices"]): string {
  const device = deviceOfKey(key, devices);
  const option = device && recipe.options.find((o) => o.type === "device" && o.kind === device.kind);
  return option && device ? `libre.{${option.key}}_${key.slice(`libre.${device.id}_`.length)}` : key;
}

/** The sensor key a binding reads with the options at their defaults (a device slot filled from the data). */
function keyOf(recipe: Recipe, b: Binding, data: Data): string {
  if ("field" in b) return "";
  const values = Object.fromEntries(recipe.options.map((o) => [o.key, o.default]));
  return "option" in b ? String(values[b.option] ?? "") : (expandKey(recipe, b.sensor, values, data).key ?? b.sensor);
}

/** The reading a binding shows on the stage, and where it comes from. */
function bindingInfo(recipe: Recipe, b: Binding, data: Data, names: Record<string, string> | undefined): { name: string; from?: string; value: string } {
  if ("field" in b) return { name: `Each place's ${b.field}`, value: "" };
  const option = pickedOption(recipe, b) ?? ("option" in b ? recipe.options.find((o) => o.key === b.option) : undefined);
  if ("option" in b && option?.type !== "sensor") return { name: option?.label ?? b.option, from: "an option people set", value: String(option?.default ?? "") };
  const key = keyOf(recipe, b, data);
  const raw = data[key];
  const value = typeof raw === "object" && raw ? raw.value : (raw ?? "–");
  return { name: names?.[key] ?? key, from: option ? `from option “${option.label}”` : undefined, value: String(value) };
}

/** A short name for a binding (a part's chip, a cell's row). */
function bindingName(recipe: Recipe, b: Binding, names: Record<string, string> | undefined, data: Data): string {
  if ("field" in b) return b.field;
  if ("option" in b) return recipe.options.find((o) => o.key === b.option)?.label ?? b.option;
  const key = keyOf(recipe, b, data);
  return names?.[key] ?? key.split(".").pop() ?? key;
}

/** The sensor button: what it reads now, and the picker to change it. */
function SensorButton({ recipe, bind, title, props, onPick, block }: { recipe: Recipe; bind: Binding | undefined; title: string; props: DataRowsProps; onPick: (key: string) => void; block?: Block }) {
  const [open, setOpen] = useState(false);
  const model = useDataModel();
  const info = bind ? bindingInfo(recipe, bind, props.data, props.names) : undefined;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Change the data" className="flex w-full items-center gap-3 rounded-ui-lg border border-ui-subtle bg-ui-app px-3 py-2.5 text-left hover:border-ui-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ui-1">{info?.name ?? "No data yet"}</span>
          <span className="block truncate font-ui-mono text-micro text-ui-3">{info?.from ?? (bind && "sensor" in bind ? bind.sensor : "Pick a sensor")}</span>
        </span>
        <span className="shrink-0 font-ui-mono text-body text-ui-1">{info?.value}</span>
      </button>
      <DataPicker open={open} onOpenChange={setOpen} title={title} points={block ? pickerPoints(block, model.points) : model.points} mode="item" bound={new Set()} onToggle={(p) => onPick(keyFor(recipe, p.key, props.devices))} onOpenExplorer={props.onOpenSources} />
    </>
  );
}

/** The Field select's choices inside a Repeat: the fields its items have. */
const fieldChoices = (source: RepeatSource) => itemFields(source).map((f) => ({ value: f, label: f }));

/** A block's own reading (Ring, Value, a card's sub-title …) and "Let people pick …". */
export function DataRow({ block, props }: { block: Block; props: DataRowsProps }) {
  const { recipe, path } = props;
  const bind = "bind" in block ? block.bind : block.type === "card" ? block.subtitle : undefined;
  const repeat = repeatAbove(recipe, path);
  const inRepeat = !!repeat;
  const what = pickWhat(recipe, path, props.devices);
  const picked = !!pickedOption(recipe, bind);
  const set = (next: Binding | undefined) => props.onChange(updateBlock(recipe, path, block.type === "card" ? { subtitle: next } : { bind: next }));
  if (inRepeat && (!bind || "field" in bind))
    return (
      <Field label="Field">
        <Select label="Field" value={bind && "field" in bind ? bind.field : "temp"} options={fieldChoices(repeat!.source)} onChange={(f) => set({ field: f })} />
      </Field>
    );
  return (
    <>
      <SensorButton recipe={recipe} bind={bind} title={`Data for ${layerName(recipe, block)}`} props={props} onPick={(key) => set({ sensor: key })} block={block} />
      {bind && "sensor" in bind && <ReplaceSensor key={path.join(".")} from={bind.sensor} props={props} />}
      {what && (
        <Field label={`Let people pick ${what}`}>
          <Toggle label={`Let people pick ${what}`} checked={picked} onChange={(on) => props.onChange(on ? pickBinding(recipe, path, props.devices) : unpickBinding(recipe, path, props.data))} />
        </Field>
      )}
    </>
  );
}

/**
 * "Replace sensor…" (G16): the key this block reads, swapped for the one picked wherever the recipe reads it, as one edit (one undo
 * step); the blocks and options it changed are listed under it.
 */
function ReplaceSensor({ from, props }: { from: string; props: DataRowsProps }) {
  const { recipe } = props;
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState<{ to: string; list: string[] } | null>(null);
  const model = useDataModel();
  return (
    <>
      <Field label="">
        <Button small variant="ghost" onClick={() => setOpen(true)} title={`Every block that reads ${from} reads the sensor you pick`}>
          Replace sensor…
        </Button>
      </Field>
      {changed && (
        <div role="status" data-replaced="" className="rounded-ui-md border border-ui-subtle bg-ui-raised px-2.5 py-2 text-caption leading-snug text-ui-2">
          <p className="break-all text-ui-1">{changed.list.length ? `Now reads ${changed.to}:` : "Nothing else read it"}</p>
          {changed.list.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {changed.list.map((line, k) => (
                <li key={k}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DataPicker
        open={open}
        onOpenChange={setOpen}
        title={`Replace ${from.split(".").pop()} everywhere`}
        points={model.points}
        mode="item"
        bound={new Set()}
        onToggle={(p) => {
          const to = keyFor(recipe, p.key, props.devices);
          const r = replaceSensor(recipe, from, to);
          setChanged({ to, list: r.changed });
          if (r.changed.length) props.onChange(r.recipe);
        }}
        onOpenExplorer={props.onOpenSources}
      />
    </>
  );
}

/**
 * What one reading of a label comes from: a sensor (the picker), an option people set (a text, a number, a choice, a toggle, a
 * sensor option), or inside a Repeat a field of each item (a place, a drive, a core …).
 */
export function SourceRows({ recipe, bind, label, props, onBind }: { recipe: Recipe; bind: Binding; label: string; props: DataRowsProps; onBind: (b: Binding) => void }) {
  const repeat = repeatAbove(recipe, props.path);
  const options = recipe.options.filter((o) => o.type !== "place-list" && o.type !== "device");
  const value = "sensor" in bind ? "sensor" : "option" in bind ? `option:${bind.option}` : `field:${bind.field}`;
  const choices = [
    { value: "sensor", label: "A sensor" },
    ...options.map((o) => ({ value: `option:${o.key}`, label: `Option “${o.label}”` })),
    ...(repeat ? itemFields(repeat.source).map((f) => ({ value: `field:${f}`, label: `Each ${ITEM_NOUN[repeat.source]}'s ${f}` })) : []),
  ];
  const firstSensor = Object.keys(props.data).find((k) => k.includes(".")) ?? "libre.cpu_total";
  return (
    <>
      <Field label={label}>
        <Select
          label={label}
          value={value}
          options={choices}
          onChange={(v) => onBind(v === "sensor" ? { sensor: "sensor" in bind ? bind.sensor : firstSensor } : v.startsWith("option:") ? { option: v.slice(7) } : { field: v.slice(6) })}
        />
      </Field>
      {"sensor" in bind && <SensorButton recipe={recipe} bind={bind} title={`Data for ${label.toLowerCase()}`} props={props} onPick={(key) => onBind({ sensor: key })} />}
    </>
  );
}

/** A part's chip text: typed text in quotes, a reading by its name. */
const chipText = (recipe: Recipe, p: LabelPart, props: DataRowsProps): string => ("text" in p ? `“${p.text}”` : bindingName(recipe, p.bind, props.names, props.data));

/** A label's text (G3, G4): typed, or from data as a line of parts, each typed text or a reading with its own decimals and unit. */
export function LabelText({ block, props }: { block: Extract<Block, { type: "label" }>; props: DataRowsProps }) {
  const { recipe, path, onChange } = props;
  const parts = labelParts(block);
  const typed = !parts.length;
  const [at, setAt] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const k = Math.min(at, Math.max(0, parts.length - 1));
  const part = parts[k];
  /** One part: its rows say "Reads", "Unit"; more: "Part 2 reads". */
  const one = parts.length === 1;
  const setParts = (next: readonly LabelPart[]) => onChange(setLabelParts(recipe, path, next));
  const setPart = (next: LabelPart) => setParts(parts.map((p, i) => (i === k ? next : p)));
  const firstSensor = Object.keys(props.data).find((x) => x.includes(".")) ?? "libre.cpu_total";
  const add = (kind: "text" | "data") => {
    const repeat = repeatAbove(recipe, path);
    const fresh: LabelPart = kind === "text" ? { text: " / " } : { bind: repeat ? { field: isDeviceSource(repeat.source) ? SOURCE_MAIN[repeat.source] : "temp" } : { sensor: firstSensor } };
    setParts([...parts, fresh]);
    setAt(parts.length);
  };
  return (
    <>
      <Heading>Text</Heading>
      <Field label="Text">
        <Segmented
          label="Text"
          value={typed ? "typed" : "data"}
          options={[
            { value: "typed", label: "Typed" },
            { value: "data", label: "From data" },
          ]}
          onChange={(v) => onChange(setLabelSource(recipe, path, v as "typed" | "data", firstSensor))}
        />
      </Field>
      {typed ? (
        <Field label="Words">
          <TextInput label="Words" value={block.text ?? ""} onChange={(v) => onChange(updateBlock(recipe, path, { text: v.slice(0, 80) || block.text || "Label" }))} />
        </Field>
      ) : (
        <>
          <ul aria-label="Parts" className="flex flex-wrap items-center gap-1.5">
            {parts.map((p, i) => (
              <li
                key={i}
                draggable
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => drag !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag !== null) setParts(moveItem(parts, drag, i));
                  setDrag(null);
                  setAt(i);
                }}
                onDragEnd={() => setDrag(null)}
                data-part-chip={i}
                className={cn("flex h-7 items-center rounded-ui-md border pl-2 text-caption", i === k ? "border-ui-accent text-ui-1" : "border-ui-strong text-ui-2", drag === i && "opacity-50")}
              >
                <button type="button" aria-pressed={i === k} onClick={() => setAt(i)} className="max-w-30 truncate whitespace-pre focus-visible:outline-2 focus-visible:outline-ui-accent">
                  {chipText(recipe, p, props)}
                </button>
                <button type="button" aria-label={`Remove part ${i + 1}`} disabled={parts.length < 2} onClick={() => setParts(parts.filter((_, j) => j !== i))} className="ml-0.5 rounded-ui-sm p-1 text-ui-3 hover:text-ui-1 disabled:opacity-40">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
            <li>
              <Menu.Root>
                <Menu.Trigger className="flex h-7 items-center gap-1 rounded-ui-md px-2 text-caption text-ui-accent-text hover:bg-ui-raised focus-visible:outline-2 focus-visible:outline-ui-accent">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add a part
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="z-[80]" sideOffset={6} align="start">
                    <Menu.Popup className={POPUP}>
                      <Menu.Item className={ITEM} onClick={() => add("text")}>
                        Text
                      </Menu.Item>
                      <Menu.Item className={ITEM} onClick={() => add("data")}>
                        Data
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </li>
          </ul>
          {part && "text" in part && (
            <Field label={`Part ${k + 1}`}>
              <TextInput label={`Part ${k + 1} text`} value={part.text} onChange={(v) => setPart({ text: v.slice(0, 40) || part.text })} />
            </Field>
          )}
          {part && "bind" in part && (
            <>
              <SourceRows recipe={recipe} bind={part.bind} label={`${one ? "" : `Part ${k + 1} `}reads`.replace(/^r/, "R")} props={props} onBind={(bind) => setPart({ ...part, bind })} />
              <Field label="Unit, decimals">
                <TextInput label={one ? "Unit" : `Part ${k + 1} unit`} value={part.unit ?? ""} placeholder="Auto" onChange={(v) => setPart({ ...part, unit: v.slice(0, 8) || undefined })} width={72} />
                <NumberInput label={one ? "Decimals" : `Part ${k + 1} decimals`} value={part.decimals} placeholder="Auto" min={0} max={4} onChange={(v) => setPart({ ...part, decimals: v })} width={76} />
              </Field>
            </>
          )}
        </>
      )}
    </>
  );
}

/** A heatmap's data (G2): inside a Repeat the field of numbers it draws, else its cells, one row per reading. */
export function HeatmapCells({ block, props }: { block: Extract<Block, { type: "heatmap" }>; props: DataRowsProps }) {
  const { recipe, path, onChange } = props;
  const model = useDataModel();
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const cells = block.cells ?? [];
  const set = (next: Binding[]) => onChange(updateBlock(recipe, path, next.length ? { cells: next, bind: undefined } : { cells: undefined, bind: undefined }));
  const repeat = repeatAbove(recipe, path);
  if (repeat)
    return (
      <Field label="Field">
        <Select label="Field" value={block.bind && "field" in block.bind ? block.bind.field : "hourly"} options={fieldChoices(repeat.source)} onChange={(f) => onChange(updateBlock(recipe, path, { bind: { field: f }, cells: undefined }))} />
      </Field>
    );
  const keys = cells.map((c) => keyOf(recipe, c, props.data));
  return (
    <>
      <Heading>Cells</Heading>
      <ul aria-label="Cells" className="flex flex-col">
        {cells.map((c, i) => (
          <li
            key={i}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => drag !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null) set(moveItem(cells, drag, i));
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            data-cell={i}
            className={cn("flex h-8 items-center gap-2 border-b border-ui-subtle text-body", drag === i && "opacity-50")}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ui-hint" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ui-1" title={keys[i]}>
              {bindingName(recipe, c, props.names, props.data)}
            </span>
            <button type="button" aria-label={`Remove cell ${i + 1}`} onClick={() => set(cells.filter((_, j) => j !== i))} className="rounded-ui-sm p-1 text-ui-3 hover:text-ui-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <Field label={cells.length ? `${cells.length} cell${cells.length === 1 ? "" : "s"}` : "No cells yet"}>
        <Button small icon={<Plus strokeWidth={1.5} />} onClick={() => setOpen(true)}>
          Add a cell
        </Button>
      </Field>
      <DataPicker
        open={open}
        onOpenChange={setOpen}
        title={`Cells of ${layerName(recipe, block)}`}
        points={model.points}
        mode="widget"
        bound={new Set(keys)}
        onToggle={(p) => {
          const at = keys.indexOf(p.key);
          set(at >= 0 ? cells.filter((_, j) => j !== at) : [...cells, { sensor: keyFor(recipe, p.key, props.devices) }]);
        }}
        onOpenExplorer={props.onOpenSources}
      />
    </>
  );
}
