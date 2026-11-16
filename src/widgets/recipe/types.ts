// Recipe widgets (Phase 5a): a widget made of Studio's own blocks, as data. A recipe is `recipe.json` in a widget package
// (`package.ts`: a manifest with each file's SHA-256, then the files), checked by `validate.ts` on import and on every load,
// and drawn by `RecipeView.tsx` with the same primitives and theme tokens as the built-in widgets. No code and no URLs: every
// value is a number, a word, a sensor key, an option key or a field of a Repeat's data source; an image is a file of the package.
import type { WidgetPreset } from "../define";
import type { ConvertUnit } from "./convert";

/**
 * The newest recipe format this build reads (`recipe.json`'s `format`); it reads every one before it too. Format 2 adds keys format 1
 * has not got (a label's `parts`; Phase C: text alignment, the text colours, a centre value's colour, `convert` and thresholds' `low`);
 * a recipe that uses none of them is written as format 1, so an older build still draws it.
 */
export const RECIPE_FORMAT = 2;
export type RecipeFormat = 1 | 2;

/** The fixed list of blocks (the builder's "Add a block"). */
export const BLOCK_TYPES = ["card", "row", "repeat", "ring", "gauge", "bar", "sparkline", "value", "label", "weather-icon", "image", "heatmap"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Where a block's value comes from: a sensor key, an option's value (a `sensor` option's key is read in turn), or a field of the item a
 * Repeat draws. A sensor key may name a `device` option in braces (`libre.{cpu}_cpu_total`): the device the placement picked, Auto the
 * first of its kind the data has, so one recipe reads whichever CPU or GPU a person picks.
 */
export type Binding = { sensor: string } | { option: string } | { field: string };

/**
 * A block setting that follows an option instead of holding a value (Phase 5c): the option's value as it is, or through `map` (a
 * select's choice to the setting's value). A value the option does not give, or the map leaves out, keeps the block's default.
 */
export interface FollowOption<T extends string | number> {
  option: string;
  map?: Record<string, T>;
}
/** A fixed value, or one that follows an option. */
export type Follows<T extends string | number> = T | FollowOption<T>;

/** A colour from the theme: its accent, one of its six series, or the status colours by the block's thresholds. */
export type RecipeColour = "accent" | "series-1" | "series-2" | "series-3" | "series-4" | "series-5" | "series-6" | "thresholds";
/** The theme's text colours (format 2): a Value's number, a ring's centre value. */
export type TextColour = "fg" | "muted";
/** Where a line of text sits across its block (format 2: a Value and a Label). */
export type TextAlign = "start" | "center" | "end";

/**
 * Warning and critical levels. High is bad by default (warning from `warn` up, critical from `crit` up, so warn is at most crit);
 * `low` (format 2) turns that round for a battery or free space (warning from `warn` down, critical from `crit` down).
 */
export interface Thresholds {
  warn: number;
  crit: number;
  low?: true;
}

/** A zone size in grid cells, `[columns, rows]`. */
export type Cells = [number, number];

/**
 * Shown only while an option holds (`is`) or does not hold (`not`) a value, and only at the zone sizes `size` allows (both when
 * both are given): how a preset turns parts of a recipe off, and how a part leaves a size too small for its text. A size is read in
 * the validator's nominal cells (`metrics.ts`), from the box the card has.
 */
export interface Condition {
  option?: string;
  is?: string | number | boolean;
  not?: string | number | boolean;
  size?: { min?: Cells; max?: Cells };
}

interface BlockBase {
  /** The Layers name ("Top row"); not drawn. */
  name?: string;
  when?: Condition;
  /** The share of its row it takes (default 1). */
  grow?: number;
}

export interface Ranged {
  bind: Binding;
  min?: number;
  max?: number;
  color?: RecipeColour;
  /** Warning and critical levels, for `color: "thresholds"`. */
  thresholds?: Thresholds;
}

export interface CardBlock extends BlockBase {
  type: "card";
  /** The header's title (the root card) or a caption over a nested card. */
  title?: string;
  /** A sub-title after it, from a binding (the CPU's name). */
  subtitle?: Binding;
  icon?: string;
  children: Block[];
}
export interface RowBlock extends BlockBase {
  type: "row";
  direction?: "row" | "column";
  /** Between the children, px (0-24). */
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  children: Block[];
}
export interface RepeatBlock extends BlockBase {
  type: "repeat";
  /** The list option it runs over (a `place-list`). */
  over: string;
  /** The data source each item reads: Weather by place (the server's `weather.place.<id>.*`; the recipe's sample items in the builder's Sample). */
  source: "weather-by-place";
  direction?: Follows<RepeatDirection>;
  /** Most shown (1-12). */
  max?: Follows<number>;
  /** Hours of forecast in each item's `hourly` (1-24, default 8). */
  hours?: Follows<number>;
  /** Temperatures and wind in metric (°C, km/h, the default) or imperial (°F, mph). */
  units?: Follows<WeatherUnits>;
  dividers?: boolean;
  children: Block[];
}
export type RepeatDirection = "rows" | "columns" | "grid";
export type WeatherUnits = "metric" | "imperial";
export interface RingBlock extends BlockBase, Ranged {
  type: "ring" | "gauge";
  /** The value in the centre (default on). */
  center?: boolean;
  /** The centre value's size, times the card's base text size (default 1.6). */
  scale?: number;
  /** Stroke, % of the diameter (2-24); unset takes the one ring spec. */
  thickness?: number;
  unit?: string;
  decimals?: number;
  /** The centre value's colour (format 2); unset is the text colour. */
  tone?: TextColour;
  /** "Show in": the reading in another unit of its family (format 2); the range and thresholds are in that unit too. */
  convert?: ConvertUnit;
}
export interface BarBlock extends BlockBase, Ranged {
  type: "bar";
  style?: "bar" | "segments";
}
export interface SparklineBlock extends BlockBase, Ranged {
  type: "sparkline";
  style?: "line" | "area" | "bars";
  /** The history it keeps for a live reading, seconds (10-600; default 60). A list (a Repeat item's `hourly`) is drawn as it is. */
  window?: Follows<number>;
}
export interface ValueBlock extends BlockBase {
  type: "value";
  bind: Binding;
  /** A label before the value ("Temp"). */
  label?: string;
  /** Overrides the unit read from the reading. */
  unit?: string;
  decimals?: number;
  /** Text size, times the card's base (default 1). */
  scale?: number;
  /** The number's colour; unset is the text colour (`fg`, `muted`: format 2). */
  color?: RecipeColour | TextColour;
  thresholds?: Thresholds;
  /** The line across the block (format 2); unset puts the label at the start and the value at the end. */
  align?: TextAlign;
  /** "Show in": the reading in another unit of its family (format 2); the thresholds are in that unit too. */
  convert?: ConvertUnit;
}
/** One piece of a label's line (format 2): typed text, or a reading with its own decimals and unit ("6°", " / ", "1°"). */
export type LabelPart = { text: string } | { bind: Binding; decimals?: number; unit?: string };
export interface LabelBlock extends BlockBase {
  type: "label";
  text?: string;
  bind?: Binding;
  /** The line made of several pieces, in order (format 2). */
  parts?: LabelPart[];
  scale?: number;
  tone?: "fg" | "muted" | "accent";
  /** The line across the block (format 2); unset is the start. */
  align?: TextAlign;
}
export interface WeatherIconBlock extends BlockBase {
  type: "weather-icon";
  /** A condition text or code ("Cloudy", "04d"). */
  bind: Binding;
  scale?: number;
}
export interface ImageBlock extends BlockBase {
  type: "image";
  /** A file of the package (`images/<name>.png`). */
  file: string;
  fit?: "contain" | "cover";
  alt?: string;
}
export interface HeatmapBlock extends BlockBase {
  type: "heatmap";
  /** One cell per binding. */
  cells?: Binding[];
  /** Or a field holding a list of numbers (a Repeat item's `hourly`). */
  bind?: Binding;
  min?: number;
  max?: number;
  columns?: number;
  color?: RecipeColour;
}

export type Block = CardBlock | RowBlock | RepeatBlock | RingBlock | BarBlock | SparklineBlock | ValueBlock | LabelBlock | WeatherIconBlock | ImageBlock | HeatmapBlock;
/** The blocks that hold others. */
export type Container = CardBlock | RowBlock | RepeatBlock;

/** A place of a `place-list` option: what the placement stores (as JSON text, since a setting is a scalar). `here`: the place
 * "Use this PC's location first" put at the top (picked once by the person, never looked up by IP). */
export interface Place {
  name: string;
  lat: number;
  lon: number;
  here?: true;
}

/** The `ModuleSetting` types a recipe option may take, `place-list`, and `device` (a CPU, GPU, drive or adapter, Auto by default). */
export const OPTION_TYPES = ["text", "number", "select", "boolean", "color", "sensor", "date", "time", "place-list", "device"] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

/** The device kinds a `device` option picks from: the ones the Data API's keys name by a device id (`hw` in widgets/core/data.ts). */
export const DEVICE_KINDS = ["cpu", "gpu", "disk", "adapter"] as const;
export type RecipeDeviceKind = (typeof DEVICE_KINDS)[number];
/** A device option's value: `auto`, or a device id as the keys hold it (`amd_ryzen_9_9950x3d`). */
export const DEVICE_ID = /^(auto|[a-z0-9][a-z0-9_]{0,79})$/;

/** What people can change when they add the widget (its Content tab). */
export interface RecipeOption {
  key: string;
  label: string;
  type: OptionType;
  default: string | number | boolean | Place[];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  group?: string;
  /** A `device` option's kind. */
  kind?: RecipeDeviceKind;
}

/** The fields a Weather-by-place item has (the server's readings for the place, or the recipe's sample items). */
export const WEATHER_PLACE_FIELDS = ["name", "condition", "code", "temp", "high", "low", "precip", "wind", "hourly"] as const;

export interface RecipeSample {
  /** Readings by sensor key, as the Data API gives them ("54.4 %" or a number). */
  sensors: Record<string, string | number>;
  /** A Repeat's items by its list option: one record of fields per place. */
  items?: Record<string, Record<string, string | number | number[]>[]>;
}

export interface Recipe {
  format: RecipeFormat;
  /** `recipe:<id>` (Gate 0 answer 5). */
  id: string;
  name: string;
  /** Semver. A placement stores the version it was added with. */
  version: string;
  author: string;
  description?: string;
  icon?: string;
  category?: string;
  size: { min: Cells; max: Cells; default: Cells };
  options: RecipeOption[];
  /** The Phase 4 shape: settings are option values; exactly one is the default. */
  presets: WidgetPreset[];
  root: CardBlock;
  sample: RecipeSample;
}

/** One file of a package: its path from the package folder and its bytes. */
export interface PackageFile {
  path: string;
  bytes: Uint8Array;
}

/** A file as the manifest lists it. */
export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * A widget package's manifest (`manifest.json`), the one format of recipes (5a) and code widgets (6a). `signature` is minisign's
 * over the manifest without it (the file list carries every file's hash, FORMAT.md §17): a code widget's must be there, a
 * recipe's may. A code widget names its `publisher` (the id's) and its bundle `entry`.
 */
export interface Manifest {
  format: 1;
  kind: "recipe" | "code";
  id: string;
  version: string;
  author: string;
  name?: string;
  publisher?: string;
  entry?: "widget.js";
  files: ManifestFile[];
  signature?: { minisign: string };
}
