// The builder inspector's Block tab (Phase 5b, screenshots 04 and 08): what the selected block reads (a sensor, an option or a
// Repeat item's field) and "Let people pick …", its range, its colour from the theme (accent, a series or the thresholds), what
// its type has (a ring's centre value and thickness, a Repeat's list and direction, a row's direction), when it shows, and its
// share of its row; Phase C: a value's and a label's alignment, the text colours, a ring's centre colour, "Show in" and a
// threshold's direction. Phase D: "Up to the size" beside "From the size" (G28), an image's alt text (G31), and the Header row's
// title, sub-title and icon on their own (G37). Phase E: the style rows of `style-rows.tsx` (weight, case, opacity, a card's surface,
// padding and spacing, a gauge's sweep, a bar's height). Phase F (G38): "Repeat over" a place list or a device source, and a grid's
// columns and spacing. Builder plan Phase 5 and 6 (`layout-rows.tsx`): a grid's tracks, a block's area, its background layer, its part of
// its column or row, a condition on a reading and its motion. Every change is one edit of the recipe (one undo step).
import type { ReactNode } from "react";
import { Ban, Copy, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { IconGrid, type IconGridItem } from "@/components/ui/icon-grid";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { iconFor, MATERIAL_ICONS } from "@/widgets/core/icons";
import type { Data } from "@/widgets/core/types";
import { type ConvertUnit, tableUnit, unitsLike } from "@/widgets/recipe/convert";
import { isFollow, oneOf, wholeIn } from "@/widgets/recipe/follow";
import { DEVICE_ITEMS_MAX, DEVICE_SOURCES, type DeviceSource, isDeviceSource } from "@/widgets/recipe/sources";
import { DEFAULT_SCALE, GRID_COLUMNS_MAX, ITEMS_MAX } from "@/widgets/recipe/validate";
import type { Binding, Block, BlockType, Follows, Recipe, RecipeColour, RecipeDeviceKind, TextColour, Thresholds } from "@/widgets/recipe/types";
import { BLOCK_LABEL, blockAt, CELLS_MAX, followable, followOf, ITEM_NOUN, largestAny, layerName, setLargestAny, setRecipeSize, setRepeatSource, SOURCE_LABEL, thresholdLine, unitOfBinding, updateBlock, valueText, withDirection, withWhenSize, type Path } from "./builder-model";
import { BlockIcon } from "./block-icons";
import { DataRow, type DataRowsProps, HeatmapCells, LabelText } from "./data-rows";
import { Field, Heading, NumberInput, Select, Slider, TextArea, TextInput } from "./fields";
import { AreaRows, BackgroundRows, FillRows, MotionRow, ReadingRows, TrackRows } from "./layout-rows";
import { StyleRows } from "./style-rows";

export interface BlockTabProps {
  recipe: Recipe;
  path: Path;
  onChange: (recipe: Recipe) => void;
  onRemove: () => void;
  /** A copy right after it (Ctrl+D). */
  onDuplicate: () => void;
  /** The readings the stage shows (live or the sample), and their names. */
  data: Data;
  names?: Record<string, string>;
  devices: Partial<Record<RecipeDeviceKind, string[]>>;
  onOpenSources: () => void;
  /** Adds an image file to the package and names it on the block. */
  onImage: (file: File) => void;
  /** The version the next save writes (the stored one's next; a recipe never saved keeps its own). */
  nextVersion: string;
  /** The Header row is picked (G37): the root card's title, sub-title and icon only. */
  header?: boolean;
  /** The opacity step the stage draws the block's text at (Phase E), when it has one. */
  drawnOpacity?: number;
}

type ColourKind = TextColour | "accent" | "series" | "thresholds";

/**
 * The colours a block's Colour row offers: the ones its renderer draws (B13). A heatmap colours its cells by their level on its own
 * scale, or in a series' tints: it has no use for thresholds, and its scale is what "Accent" would draw. A value's number is the text
 * colour unless it names another (B19: its "Accent" drew the text colour), so it is offered Text (unset) and Muted first (G22).
 */
export function colourKinds(type: BlockType): readonly { value: ColourKind; label: string }[] {
  if (type === "heatmap")
    return [
      { value: "accent", label: "Heat" },
      { value: "series", label: "Series" },
    ];
  const roles = [
    { value: "accent", label: "Accent" },
    { value: "series", label: "Series" },
    { value: "thresholds", label: "Thresholds" },
  ] as const;
  return type === "value" ? [{ value: "fg", label: "Text" }, { value: "muted", label: "Muted" }, ...roles] : roles;
}

const RANGED = new Set(["ring", "gauge", "bar", "sparkline", "heatmap"]);
/** A side of "From the size" and "Up to the size" (B29): Any, then every cell count up to the recipe's Largest on that side. */
export const whenSizeOptions = (largest: number): string[] => ["", ...Array.from({ length: largest }, (_, k) => String(k + 1))];

const DIRECTIONS = [
  { value: "rows", label: "Rows" },
  { value: "columns", label: "Columns" },
  { value: "grid", label: "Grid" },
] as const;
/**
 * A line of text in a column (a card's blocks, or a Row set to Column): it takes its own height unless it is given a share (B16), so
 * its share field is empty by default rather than 1.
 */
const ownLine = (recipe: Recipe, path: Path, b: Block): boolean => {
  const parent = path.length ? blockAt(recipe, path.slice(0, -1)) : undefined;
  return (b.type === "label" || b.type === "value" || b.type === "weather-icon") && (parent?.type === "card" || (parent?.type === "row" && parent.direction === "column"));
};

/** A Row's align (G20): where each block sits across the row, in its cell; Stretch (unset) fills it. */
const ALIGNS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Centre" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
] as const;
/** A value's and a label's line across the block (G21); a label's Start is unset. */
const TEXT_ALIGNS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Centre" },
  { value: "end", label: "End" },
] as const;
const UNITS = [
  { value: "metric", label: "°C, km/h" },
  { value: "imperial", label: "°F, mph" },
] as const;

interface FollowProps<T extends string | number> {
  label: string;
  recipe: Recipe;
  value: Follows<T> | undefined;
  /** The words the setting takes (a direction, units), else it is a whole number in `range`. */
  words?: readonly { value: T & string; label: string }[];
  range?: [number, number];
  fallback: T;
  /** The control for a fixed value. */
  fixed: ReactNode;
  onChange: (v: Follows<T> | undefined) => void;
}

/**
 * A block setting a person may pick when they add the widget (5c): fixed here, or following one of the recipe's options. A select
 * whose choices are not values the setting takes is followed through a map, one row per choice.
 */
function FollowRows<T extends string | number>({ label, recipe, value, words, range, fallback, fixed, onChange }: FollowProps<T>) {
  const takes = (words ? oneOf(words.map((w) => w.value)) : wholeIn(range![0], range![1])) as (x: unknown) => x is T;
  const options = followable(recipe, !words);
  const following = isFollow(value) ? value : undefined;
  const followed = recipe.options.find((o) => o.key === following?.option);
  return (
    <>
      <Field label={label}>
        {following ? <span className="text-body text-ui-3">From “{followed?.label ?? following.option}”</span> : fixed}
      </Field>
      {options.length > 0 && (
        <Field label={`${label}: who picks`}>
          <Select
            label={`${label}: who picks`}
            value={following?.option ?? ""}
            options={[{ value: "", label: "Fixed here" }, ...options.map((o) => ({ value: o.key, label: `Option “${o.label}”` }))]}
            onChange={(k) => {
              const o = recipe.options.find((x) => x.key === k);
              onChange(o ? followOf(o, takes, fallback) : undefined);
            }}
          />
        </Field>
      )}
      {following?.map &&
        (followed?.options ?? []).map((c) => (
          <Field key={c.value} label={`· ${c.label}`}>
            {words ? (
              <Select label={`${label} for ${c.label}`} value={String(following.map?.[c.value] ?? fallback)} options={words} onChange={(v) => onChange({ ...following, map: { ...following.map, [c.value]: v as T } })} />
            ) : (
              <NumberInput label={`${label} for ${c.label}`} value={Number(following.map?.[c.value] ?? fallback)} min={range![0]} max={range![1]} onChange={(v) => onChange({ ...following, map: { ...following.map, [c.value]: (v ?? fallback) as T } })} />
            )}
          </Field>
        ))}
    </>
  );
}

function ColourRow({ recipe, path, block, onChange }: { recipe: Recipe; path: Path; block: Block & { color?: RecipeColour | TextColour; thresholds?: Thresholds }; onChange: (r: Recipe) => void }) {
  const colour = block.color ?? (block.type === "value" ? "fg" : "accent");
  const kind = colour.startsWith("series-") ? "series" : (colour as ColourKind);
  const set = (patch: Record<string, unknown>) => onChange(updateBlock(recipe, path, patch));
  const levels = block.thresholds;
  const line = levels && thresholdLine(levels);
  return (
    <>
      <Field label="Colour">
        <Segmented
          label="Colour"
          options={[...colourKinds(block.type)]}
          value={kind}
          onChange={(v) => set(v === "series" ? { color: "series-1", thresholds: undefined } : v === "thresholds" ? { color: v, thresholds: block.thresholds ?? { warn: 70, crit: 90 } } : { color: v === "fg" ? undefined : v, thresholds: undefined })}
        />
      </Field>
      {kind === "series" && (
        <Field label="Series">
          <Select label="Series" value={colour.slice(7)} options={["1", "2", "3", "4", "5", "6"].map((n) => ({ value: n, label: `Series ${n}` }))} onChange={(n) => set({ color: `series-${n}` })} width={120} />
        </Field>
      )}
      {kind === "thresholds" && (
        <>
          <Field label="Direction" hint="Low is bad for a battery or free space: the colour turns as the reading falls">
            <Segmented
              label="Direction"
              value={levels?.low ? "low" : "high"}
              options={[
                { value: "high", label: "High is bad" },
                { value: "low", label: "Low is bad" },
              ]}
              onChange={(v) => set({ thresholds: withDirection(levels, v === "low") })}
            />
          </Field>
          <Field label="Warning, critical">
            <NumberInput label="Warning at" value={levels?.warn} onChange={(v) => set({ thresholds: { ...levels, warn: v ?? 0, crit: levels?.crit ?? 90 } })} />
            <NumberInput label="Critical at" value={levels?.crit} onChange={(v) => set({ thresholds: { ...levels, warn: levels?.warn ?? 70, crit: v ?? 0 } })} />
          </Field>
          {line && (
            <p data-threshold-line={line.ok ? "" : "wrong"} className={line.ok ? "text-caption leading-snug text-ui-3" : "text-caption leading-snug text-ui-warn"}>
              {line.text}
            </p>
          )}
        </>
      )}
    </>
  );
}

/**
 * "Show in" (G23): the units of the reading's kind from the fixed table (`convert.ts`), the reading's own as "As read" (unset). A unit
 * picked here and a unit typed in Unit are one or the other: each clears the other.
 */
function ShowIn({ recipe, bind, value, data, onChange }: { recipe: Recipe; bind: Binding; value: ConvertUnit | undefined; data: Data; onChange: (to: ConvertUnit | undefined) => void }) {
  const unit = unitOfBinding(recipe, bind, data);
  const own = tableUnit(unit);
  const units = unitsLike(unit).filter((u) => u !== own);
  const options = [{ value: "", label: unit ? `As read (${unit})` : "As read" }, ...units.map((u) => ({ value: u, label: u }))];
  if (value && !units.includes(value)) options.push({ value, label: value });
  return (
    <Field label="Show in" hint={units.length ? "The reading in another unit of its kind; its range and warning levels are in that unit too" : "This reading has no other unit to show in"}>
      <Select label="Show in" value={value ?? ""} options={options} onChange={(v) => onChange((v || undefined) as ConvertUnit | undefined)} width={120} />
    </Field>
  );
}

function WhenRows({ recipe, path, block, onChange }: { recipe: Recipe; path: Path; block: Block; onChange: (r: Recipe) => void }) {
  const choices = recipe.options.filter((o) => o.type === "boolean" || o.type === "select");
  const when = block.when;
  const option = choices.find((o) => o.key === when?.option);
  const set = (next: Block["when"]) => onChange(updateBlock(recipe, path, { when: next && (next.option !== undefined || next.size || next.reading) ? next : undefined }));
  const values = option?.type === "boolean" ? [true, false] : (option?.options ?? []).map((c) => c.value);
  /** One side of "From the size" (min) or "Up to the size" (max), as its select shows it: "" is any (1 for a min, 12 for a max). */
  const side = (end: "min" | "max", axis: 0 | 1): string => {
    const v = when?.size?.[end]?.[axis];
    return v === undefined || v === (end === "min" ? 1 : 12) ? "" : String(v);
  };
  const sizeSelect = (end: "min" | "max", axis: 0 | 1, label: string) => {
    const v = side(end, axis);
    const options = [...new Set([...whenSizeOptions(recipe.size.max[axis]), v])].map((n) => ({ value: n, label: n || "Any" }));
    return <Select label={label} value={v} options={options} onChange={(x) => set(withWhenSize(when, end, axis, x ? Number(x) : undefined))} width={64} />;
  };
  return (
    <>
      <Field label="Shows">
        <Select
          label="Shows when"
          value={option?.key ?? ""}
          options={[{ value: "", label: "Always" }, ...choices.map((o) => ({ value: o.key, label: `When ${o.label}` }))]}
          onChange={(key) => {
            const o = choices.find((x) => x.key === key);
            set(o ? { ...when, option: key, is: o.type === "boolean" ? true : o.options?.[0]?.value, not: undefined } : { size: when?.size });
          }}
        />
      </Field>
      {option && (
        <Field label="">
          <Select
            label="Is or is not"
            value={when?.not !== undefined ? "not" : "is"}
            options={[
              { value: "is", label: "is" },
              { value: "not", label: "is not" },
            ]}
            onChange={(m) => set({ ...when, option: option.key, is: m === "is" ? (when?.is ?? when?.not) : undefined, not: m === "not" ? (when?.not ?? when?.is) : undefined })}
            width={80}
          />
          <Select
            label="Is"
            value={String(when?.not ?? when?.is)}
            options={values.map((v) => ({ value: String(v), label: valueText(option, v) }))}
            onChange={(v) => {
              const value = option.type === "boolean" ? v === "true" : v;
              set({ ...when, option: option.key, ...(when?.not !== undefined ? { is: undefined, not: value } : { is: value, not: undefined }) });
            }}
          />
        </Field>
      )}
      <Field label="From the size" hint="Hidden in a smaller zone: what keeps text above 11 px at small sizes">
        {sizeSelect("min", 0, "Smallest columns")}
        <span className="text-ui-3">×</span>
        {sizeSelect("min", 1, "Smallest rows")}
      </Field>
      <Field label="Up to the size" hint="Hidden in a larger zone: a compact block that a roomier one takes over from">
        {sizeSelect("max", 0, "Largest columns")}
        <span className="text-ui-3">×</span>
        {sizeSelect("max", 1, "Largest rows")}
      </Field>
    </>
  );
}

/** The icons a recipe and its card may take: Material Symbols words the format allows (`$defs.word`) that the app draws (`MATERIAL_ICONS`). */
export const RECIPE_ICONS: readonly string[] = [
  "dashboard", "memory", "memory_alt", "developer_board", "speed", "device_thermostat", "mode_fan", "bolt", "hard_drive", "lan", "wifi",
  "settings_ethernet", "battery_full", "monitor_heart", "vital_signs", "query_stats", "timeline", "stacked_bar_chart", "donut_large", "equalizer",
  "graphic_eq", "partly_cloudy_day", "clear_day", "rainy", "location_on", "public", "schedule", "timer", "calendar_month", "event",
  "notifications", "music_note", "headset_mic", "mic", "videocam", "sports_esports", "trophy", "smart_toy", "sensors", "image", "newspaper",
  "description", "tune", "group", "person",
].filter((name) => Object.hasOwn(MATERIAL_ICONS, name));

/** An icon picker (G7, G8): the grid of `RECIPE_ICONS`, with a first cell for none when `none` names what that means. */
function IconPick({ label, value, none, onChange }: { label: string; value: string | undefined; none?: string; onChange: (icon: string | undefined) => void }) {
  const cells: IconGridItem[] = [
    ...(none ? [{ id: "", label: none, icon: <Ban /> }] : []),
    ...RECIPE_ICONS.map((name) => {
      const Icon = iconFor(name);
      return { id: name, label: name.replace(/_/g, " "), icon: <Icon /> };
    }),
  ];
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <span className="text-body text-ui-2">{label}</span>
      <IconGrid icons={cells} value={value ?? ""} onChange={(id) => onChange(id || undefined)} label={label} columns={9} />
    </div>
  );
}

/**
 * The recipe's details (G7) on the root card: the browse card's line (description), its category and icon, the author, and the
 * version, which a save bumps (`next`: the version the next save writes).
 */
function DetailRows({ recipe, next, onChange }: { recipe: Recipe; next: string; onChange: (r: Recipe) => void }) {
  const set = (patch: Partial<Pick<Recipe, "description" | "category" | "icon" | "author">>) => {
    const r = { ...recipe, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete r[k];
    onChange(r as unknown as Recipe);
  };
  return (
    <>
      <Heading>Details</Heading>
      <label className="flex flex-col gap-1.5 py-1">
        <span className="text-body text-ui-2">Description</span>
        <TextArea label="Description" value={recipe.description ?? ""} placeholder="The line under its name in Widgets and Add" onChange={(v) => set({ description: v.trim() ? v.slice(0, 400) : undefined })} />
      </label>
      <Field label="Category" hint="Letters and spaces, 24 at most">
        <TextInput label="Category" value={recipe.category ?? ""} placeholder="Recipes" onChange={(v) => set({ category: v.trim() ? v.trim().slice(0, 24) : undefined })} />
      </Field>
      <Field label="Author">
        <TextInput label="Author" value={recipe.author} onChange={(v) => v.trim() && set({ author: v.trim().slice(0, 80) })} />
      </Field>
      <Field label="Version">
        <span data-version="" className="font-ui-mono text-body text-ui-2">
          {recipe.version}
          {next !== recipe.version && <span className="text-ui-3"> · next save {next}</span>}
        </span>
      </Field>
      <IconPick label="Icon" value={recipe.icon} onChange={(icon) => set({ icon })} />
    </>
  );
}

function SizeRows({ recipe, onChange }: { recipe: Recipe; onChange: (r: Recipe) => void }) {
  const row = (label: string, key: "min" | "max" | "default") => (
    <Field label={label}>
      <NumberInput label={`${label} columns`} value={recipe.size[key][0]} min={1} max={12} onChange={(v) => onChange(setRecipeSize(recipe, key, [v ?? 1, recipe.size[key][1]]))} width={56} />
      <span className="text-ui-3">×</span>
      <NumberInput label={`${label} rows`} value={recipe.size[key][1]} min={1} max={12} onChange={(v) => onChange(setRecipeSize(recipe, key, [recipe.size[key][0], v ?? 1]))} width={56} />
    </Field>
  );
  const any = largestAny(recipe);
  return (
    <>
      <Heading>Sizes</Heading>
      {row("Smallest", "min")}
      {/* Largest "Any" (D1 (a)): any size up to the format's 12×12, which is what it writes */}
      <Field label="Largest">
        <Toggle label="Largest: any size" checked={any} onChange={(v) => onChange(setLargestAny(recipe, v))} />
        {any ? (
          <span data-largest-any="" className="text-body text-ui-3">
            Any, up to {CELLS_MAX}×{CELLS_MAX}
          </span>
        ) : (
          <>
            <NumberInput label="Largest columns" value={recipe.size.max[0]} min={1} max={CELLS_MAX} onChange={(v) => onChange(setRecipeSize(recipe, "max", [v ?? 1, recipe.size.max[1]]))} width={56} />
            <span className="text-ui-3">×</span>
            <NumberInput label="Largest rows" value={recipe.size.max[1]} min={1} max={CELLS_MAX} onChange={(v) => onChange(setRecipeSize(recipe, "max", [recipe.size.max[0], v ?? 1]))} width={56} />
          </>
        )}
      </Field>
      {row("Opens at", "default")}
    </>
  );
}

/**
 * The Header row's settings (G37, Q12): the root card's title, its sub-title from data and its header icon, the same fields the card's
 * own Block tab holds, on their own. No format change: they are the card's keys.
 */
function HeaderRows({ block, rows, set }: { block: Extract<Block, { type: "card" }>; rows: DataRowsProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <div data-header-tab="" className="flex flex-col gap-2 p-4">
      <div className="mb-1">
        <span className="block text-lead font-medium text-ui-1">Header</span>
        <span className="block text-caption text-ui-3">The top line of the widget's card</span>
      </div>
      <Field label="Title">
        <TextInput label="Title" value={block.title ?? ""} onChange={(v) => set({ title: v.trim() ? v.slice(0, 60) : undefined })} />
      </Field>
      <Heading>Sub-title</Heading>
      <DataRow block={block} props={rows} />
      <IconPick label="Header icon" value={block.icon} none="The widget's icon" onChange={(icon) => set({ icon })} />
    </div>
  );
}

export function BlockTab(props: BlockTabProps) {
  const { recipe, path, onChange } = props;
  const block = blockAt(recipe, path);
  if (!block) return <p className="p-4 text-caption text-ui-3">Pick a block in Layers or on the stage.</p>;
  const set = (patch: Record<string, unknown>) => onChange(updateBlock(recipe, path, patch));
  const above = path.length ? blockAt(recipe, path.slice(0, -1)) : undefined;
  const parent = above && layerName(recipe, above);
  // a Repeat in a grid fills its cells (no direction or dividers); over devices it shows up to 32
  const inGrid = above?.type === "grid";
  const most = block.type === "repeat" && isDeviceSource(block.source) ? DEVICE_ITEMS_MAX : ITEMS_MAX;
  const raw = block as unknown as Record<string, unknown>;
  const bound = block.type !== "label" && block.type !== "heatmap" && ("bind" in block || block.type === "card");
  const rows = { recipe, path, onChange, data: props.data, names: props.names, devices: props.devices, onOpenSources: props.onOpenSources };
  if (props.header && block.type === "card" && !path.length) return <HeaderRows block={block} rows={rows} set={set} />;
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="mb-1 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md border border-ui-subtle bg-ui-raised text-ui-2">
          <BlockIcon block={block} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lead font-medium text-ui-1">{BLOCK_LABEL[block.type]}</span>
          <span className="block truncate text-caption text-ui-3">{parent ? `Block · in ${parent}` : block.type === "repeat" ? "Block · one row per location" : "The widget's card"}</span>
        </span>
        {path.length > 0 && (
          <>
            <IconButton label="Duplicate block (Ctrl+D)" onClick={props.onDuplicate}>
              <Copy className="h-4 w-4" />
            </IconButton>
            <IconButton label="Delete block" danger onClick={props.onRemove}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
      </div>
      <Field label="Name in Layers">
        <TextInput label="Name in Layers" value={block.name ?? ""} placeholder={layerName(recipe, { ...block, name: undefined } as Block)} onChange={(v) => set({ name: v.trim() ? v.slice(0, 40) : undefined })} />
      </Field>
      {block.type === "card" && (
        <Field label="Title">
          <TextInput label="Title" value={block.title ?? ""} onChange={(v) => set({ title: v.trim() ? v.slice(0, 60) : undefined })} />
        </Field>
      )}
      {block.type === "card" && path.length === 0 && <IconPick label="Header icon" value={block.icon} none="The widget's icon" onChange={(icon) => set({ icon })} />}
      {block.type === "repeat" ? (
        <>
          <Heading>Repeat over</Heading>
          <Field label="List" hint="A place list's weather, or the devices the readings have: each one an item">
            <Select
              label="List"
              value={isDeviceSource(block.source) ? block.source : `list:${block.over}`}
              options={[
                ...recipe.options.filter((o) => o.type === "place-list").map((o) => ({ value: `list:${o.key}`, label: `Option “${o.label}”` })),
                ...DEVICE_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
              ]}
              onChange={(v) => onChange(v.startsWith("list:") ? setRepeatSource(recipe, path, "weather-by-place", v.slice(5)) : setRepeatSource(recipe, path, v as DeviceSource))}
            />
          </Field>
          <Field label="Data for each">
            <span className="text-body text-ui-2">{isDeviceSource(block.source) ? `${SOURCE_LABEL[block.source]} · from the readings` : "Weather · by place"}</span>
          </Field>
          {inGrid ? (
            <p className="text-caption leading-snug text-ui-3">In a grid each {ITEM_NOUN[block.source]} is a cell of the grid, its blocks in a column.</p>
          ) : (
          <FollowRows
            label="Direction"
            recipe={recipe}
            value={block.direction}
            words={DIRECTIONS}
            fallback="rows"
            fixed={<Segmented label="Direction" value={isFollow(block.direction) ? "rows" : (block.direction ?? "rows")} options={[...DIRECTIONS]} onChange={(v) => set({ direction: v })} />}
            onChange={(v) => set({ direction: v })}
          />
          )}
          <FollowRows label="Most shown" recipe={recipe} value={block.max} range={[1, most]} fallback={most} fixed={<NumberInput label="Most shown" value={isFollow(block.max) ? most : (block.max ?? most)} min={1} max={most} onChange={(v) => set({ max: v })} />} onChange={(v) => set({ max: v })} />
          {!isDeviceSource(block.source) && (
            <>
              <FollowRows label="Forecast hours" recipe={recipe} value={block.hours} range={[1, 24]} fallback={8} fixed={<NumberInput label="Forecast hours" value={isFollow(block.hours) ? 8 : (block.hours ?? 8)} min={1} max={24} onChange={(v) => set({ hours: v })} />} onChange={(v) => set({ hours: v })} />
              <FollowRows
                label="Units"
                recipe={recipe}
                value={block.units}
                words={UNITS}
                fallback="metric"
                fixed={<Segmented label="Units" value={isFollow(block.units) ? "metric" : (block.units ?? "metric")} options={[...UNITS]} onChange={(v) => set({ units: v === "metric" ? undefined : v })} />}
                onChange={(v) => set({ units: v })}
              />
            </>
          )}
          {!inGrid && (
            <Field label="Divider lines">
              <Toggle label="Divider lines" checked={!!block.dividers} onChange={(v) => set({ dividers: v || undefined })} />
            </Field>
          )}
        </>
      ) : (
        bound && (
          <>
            <Heading>{block.type === "card" ? "Sub-title" : "Data"}</Heading>
            <DataRow block={block} props={rows} />
          </>
        )
      )}
      {block.type === "label" && <LabelText key={path.join(".")} block={block} props={rows} />}
      {block.type === "heatmap" && <HeatmapCells block={block} props={rows} />}
      {RANGED.has(block.type) && (
        <Field label="Range">
          <NumberInput label="Range from" value={raw.min as number | undefined} onChange={(v) => set({ min: v })} />
          <NumberInput label="Range to" value={raw.max as number | undefined} onChange={(v) => set({ max: v })} />
        </Field>
      )}
      {(block.type === "card" || block.type === "row" || block.type === "grid" || block.type === "label" || block.type === "value" || block.type === "ring" || block.type === "gauge" || block.type === "bar" || block.type === "sparkline" || block.type === "heatmap") && <Heading>Look</Heading>}
      {(block.type === "ring" || block.type === "gauge" || block.type === "bar" || block.type === "sparkline" || block.type === "value" || block.type === "heatmap") && <ColourRow recipe={recipe} path={path} block={block} onChange={onChange} />}
      {(block.type === "ring" || block.type === "gauge") && (
        <>
          <Field label="Value in the centre">
            <Toggle label="Value in the centre" checked={block.center !== false} onChange={(v) => set({ center: v ? undefined : false })} />
          </Field>
          {block.center !== false && (
            <Field label="Centre colour">
              <Segmented
                label="Centre colour"
                value={block.tone ?? "fg"}
                options={[
                  { value: "fg", label: "Text" },
                  { value: "muted", label: "Muted" },
                ]}
                onChange={(v) => set({ tone: v === "fg" ? undefined : v })}
              />
            </Field>
          )}
          <Field label="Thickness">
            <Slider label="Thickness" min={2} max={24} value={block.thickness ?? 8} onChange={(v) => set({ thickness: v })} className="w-[110px] accent-ui-strong-text" />
            <span className="w-10 text-right font-ui-mono text-body text-ui-2">{block.thickness ?? 8} %</span>
          </Field>
        </>
      )}
      {(block.type === "value" || block.type === "ring" || block.type === "gauge") && (
        <>
          <ShowIn recipe={recipe} bind={block.bind} value={block.convert} data={props.data} onChange={(to) => set({ convert: to, unit: undefined })} />
          <Field label="Unit, decimals">
            <TextInput label="Unit" value={block.unit ?? ""} placeholder={block.convert ?? "Auto"} onChange={(v) => set({ unit: v.slice(0, 8) || undefined, ...(v ? { convert: undefined } : {}) })} width={72} />
            <NumberInput label="Decimals" value={block.decimals} placeholder="Auto" min={0} max={4} onChange={(v) => set({ decimals: v })} width={76} />
          </Field>
        </>
      )}
      {block.type === "value" && (
        <Field label="Label">
          <TextInput label="Label" value={block.label ?? ""} onChange={(v) => set({ label: v.slice(0, 40) || undefined })} />
        </Field>
      )}
      {(block.type === "value" || block.type === "label" || block.type === "ring" || block.type === "gauge" || block.type === "weather-icon") && (
        <Field label="Text size" hint="Times the card's base size; never drawn under 11 px. Empty is the block's own size">
          <NumberInput label="Text size" value={block.scale} placeholder={String(DEFAULT_SCALE[block.type] ?? 2)} min={0.5} max={6} step={0.05} onChange={(v) => set({ scale: v })} unit="×" width={80} />
        </Field>
      )}
      {(block.type === "value" || block.type === "label") && (
        <Field label="Align" hint={block.type === "value" ? "Spread: the label at the start, the value at the end" : "Where the line sits across the block"}>
          <Segmented
            label="Align"
            value={block.align ?? (block.type === "value" ? "spread" : "start")}
            options={[...(block.type === "value" ? [{ value: "spread", label: "Spread" }] : []), ...TEXT_ALIGNS]}
            onChange={(v) => set({ align: v === "spread" || (block.type === "label" && v === "start") ? undefined : v })}
          />
        </Field>
      )}
      {block.type === "label" && (
        <Field label="Tone">
          <Segmented label="Tone" value={block.tone ?? "fg"} options={[{ value: "fg", label: "Text" }, { value: "muted", label: "Muted" }, { value: "accent", label: "Accent" }]} onChange={(v) => set({ tone: v === "fg" ? undefined : v })} />
        </Field>
      )}
      <StyleRows block={block} root={path.length === 0} set={set} drawn={props.drawnOpacity} />
      {block.type === "row" && (
        <>
          <Field label="Direction">
            <Segmented label="Direction" value={block.direction ?? "row"} options={[{ value: "row", label: "Row" }, { value: "column", label: "Column" }]} onChange={(v) => set({ direction: v === "row" ? undefined : v })} />
          </Field>
          <Field label="Gap">
            <NumberInput label="Gap" value={block.gap} min={0} max={24} onChange={(v) => set({ gap: v })} unit="px" />
          </Field>
          <Field label="Align" hint={block.direction === "column" ? "Where each block sits across the column" : "Where each block sits from top to bottom"}>
            <Segmented label="Align" value={block.align ?? "stretch"} options={[...ALIGNS]} onChange={(v) => set({ align: v === "stretch" ? undefined : v })} />
          </Field>
        </>
      )}
      {block.type === "grid" && <TrackRows recipe={recipe} path={path} onChange={onChange} />}
      {block.type === "grid" && !block.tracks && (
        <Field label="Columns" hint="Empty: as many as make the cells closest to square at the size shown. A Repeat in the grid gives a cell per item">
          <NumberInput label="Columns" value={block.columns} placeholder="Auto" min={1} max={GRID_COLUMNS_MAX} onChange={(v) => set({ columns: v })} />
        </Field>
      )}
      {(block.type === "sparkline" || block.type === "bar") && (
        <Field label="Style">
          <Segmented
            label="Style"
            value={block.style ?? (block.type === "bar" ? "bar" : "area")}
            options={block.type === "bar" ? [{ value: "bar", label: "Bar" }, { value: "segments", label: "Segments" }] : [{ value: "line", label: "Line" }, { value: "area", label: "Area" }, { value: "bars", label: "Bars" }]}
            onChange={(v) => set({ style: v })}
          />
        </Field>
      )}
      {block.type === "sparkline" && (
        <FollowRows
          label="History"
          recipe={recipe}
          value={block.window}
          range={[10, 600]}
          fallback={60}
          fixed={<NumberInput label="History" value={isFollow(block.window) ? 60 : block.window} placeholder="60" min={10} max={600} step={10} unit="s" onChange={(v) => set({ window: v })} />}
          onChange={(v) => set({ window: v })}
        />
      )}
      {block.type === "heatmap" && (
        <Field label="Columns">
          <NumberInput label="Columns" value={block.columns} min={1} max={24} onChange={(v) => set({ columns: v })} />
        </Field>
      )}
      {block.type === "image" && (
        <>
          <Field label="Picture">
            <span className="max-w-[120px] truncate font-ui-mono text-micro text-ui-3">{block.file.slice(7)}</span>
            <label className="cursor-pointer rounded-ui-md border border-ui-strong px-2.5 py-1 text-body text-ui-1 hover:border-ui-hover-edge">
              Choose…
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && props.onImage(e.target.files[0])} />
            </label>
          </Field>
          <Field label="Fit">
            <Segmented label="Fit" value={block.fit ?? "contain"} options={[{ value: "contain", label: "Whole" }, { value: "cover", label: "Fill" }]} onChange={(v) => set({ fit: v })} />
          </Field>
          <Field label="Alt text" hint="What the picture shows, for a screen reader; empty for a picture that only decorates">
            <TextInput label="Alt text" value={block.alt ?? ""} placeholder="Decorative" onChange={(v) => set({ alt: v.replace(/[<>]/g, "").trim().slice(0, 80) || undefined })} />
          </Field>
        </>
      )}
      {block.type === "card" && path.length === 0 && <SizeRows recipe={recipe} onChange={onChange} />}
      {block.type === "card" && path.length === 0 && <DetailRows recipe={recipe} next={props.nextVersion} onChange={onChange} />}
      {path.length > 0 && (
        <>
          <AreaRows recipe={recipe} path={path} onChange={onChange} />
          <BackgroundRows recipe={recipe} path={path} onChange={onChange} />
          <Heading>When it shows</Heading>
          <WhenRows recipe={recipe} path={path} block={block} onChange={onChange} />
          <ReadingRows recipe={recipe} path={path} block={block} rows={rows} onChange={onChange} />
          <MotionRow block={block} onPick={(v) => set({ motion: v })} onClear={() => set({ motion: undefined })} />
          <FillRows recipe={recipe} path={path} onChange={onChange} />
          {/* a grid's cells are all one size: no share there; a background fills its container */}
          {inGrid || block.background ? null : ownLine(recipe, path, block) ? (
            <Field label="Share of its row" hint="In a column a line of text takes its own height; a share makes it take that part of the column instead">
              <NumberInput label="Share of its row" value={block.grow} placeholder="Own" min={0} max={12} step={0.1} onChange={(v) => set({ grow: v })} />
            </Field>
          ) : (
            <Field label="Share of its row">
              <NumberInput label="Share of its row" value={block.grow ?? 1} min={0} max={12} step={0.1} onChange={(v) => set({ grow: v === 1 ? undefined : v })} />
            </Field>
          )}
        </>
      )}
      <p className="mt-3 text-caption leading-snug text-ui-3">Colours come from the screen's theme, so the widget matches any theme or pack</p>
    </div>
  );
}
