/**
 * The .infopanel field schema, mirroring InfoPanel's C# models at d3fe32c
 * (`InfoPanel/Models/*DisplayItem.cs`, `Profile.cs`).
 *
 * Field names are the XML element names, so the model stays 1:1 with the file.
 * Defaults are the C# field initialisers; `accept` mirrors setter logic
 * (XmlSerializer deserialises through the setters, so a rejected value leaves
 * the default in place). The item types are derived from these tables.
 */
import { formatDate, FormatError } from "./dotnet-format.ts";

export type FieldKind = "int" | "uint" | "double" | "float" | "bool" | "string" | "color" | "enum";

export interface FieldSpec<T> {
  kind: FieldKind;
  default: T;
  /** Allowed names for `enum`. */
  values?: readonly string[];
  /** Setter logic: the stored value, or undefined when the setter ignores it. */
  // Method syntax keeps specs assignable to FieldSpec<unknown> (bivariant parameter).
  accept?(v: T): T | undefined;
}

type Schema = Record<string, FieldSpec<unknown>>;

/**
 * Clock and Calendar setters try the format on the current time. Clock ignores
 * one that throws; Calendar lets it throw, which fails InfoPanel's whole
 * import. Both keep the default here.
 */
const dateFormat = (d: string): FieldSpec<string> => ({
  kind: "string",
  default: d,
  accept(v) {
    try {
      formatDate(new Date(), v);
      return v;
    } catch (e) {
      if (e instanceof FormatError) return undefined;
      throw e;
    }
  },
});
export type Infer<S extends Schema> = { -readonly [K in keyof S]: S[K]["default"] };

const positive = (v: number) => (v <= 0 ? undefined : v);

const int = (d: number, accept?: (v: number) => number | undefined): FieldSpec<number> => ({ kind: "int", default: d, accept });
const uint = (d: number): FieldSpec<number> => ({ kind: "uint", default: d });
const double = (d: number): FieldSpec<number> => ({ kind: "double", default: d });
const float = (d: number): FieldSpec<number> => ({ kind: "float", default: Math.fround(d) });
const bool = (d: boolean): FieldSpec<boolean> => ({ kind: "bool", default: d });
const str = (d: string): FieldSpec<string> => ({ kind: "string", default: d });
const strOrNull = (): FieldSpec<string | null> => ({ kind: "string", default: null });
/** Color setters ignore null and prefix a missing `#`. */
const color = (d: string): FieldSpec<string> => ({ kind: "color", default: d });
const oneOf = <const V extends readonly string[]>(values: V, d: V[number]): FieldSpec<V[number]> => ({
  kind: "enum",
  default: d,
  values,
});

export const SENSOR_TYPES = ["HwInfo", "Libre", "Plugin"] as const;
export const VALUE_TYPES = ["NOW", "MIN", "MAX", "AVERAGE"] as const;
export const SHAPE_TYPES = [
  "Rectangle", "Capsule", "Trapezoid", "Parallelogram", "Ellipse", "Triangle",
  "Pentagon", "Hexagon", "Octagon", "Star", "Plus", "Arrow",
] as const;
export const GRADIENT_TYPES = ["Linear", "Sweep", "Radial", "Diamond", "Reflected", "Spiral"] as const;

/** In the order XmlSerializer writes them: the declared members, then the generated ones (IsSelected, ShowFps, OpenGL, FontScale). */
export const PROFILE = {
  Guid: str(""),
  Name: str("Profile"),
  Width: int(600, positive),
  Height: int(400, positive),
  Drag: bool(true),
  BackgroundColor: color("#FFFFFFFF"),
  Active: bool(true),
  Topmost: bool(false),
  /** C# default: the first installed system family; "" stands for it here. */
  Font: str(""),
  FontSize: int(26, positive),
  Color: color("#FF000000"),
  WindowX: int(0),
  WindowY: int(0),
  Resize: bool(true),
  StrictWindowMatching: bool(false),
  TriggerProcessNames: strOrNull(),
  WebViewEnabled: bool(false),
  WebViewUrl: str(""),
  WebViewInteractive: bool(false),
  WebViewDisableCache: bool(false),
  /** Off at 0, else at least 5 seconds. */
  WebViewAutoRefreshSeconds: int(0, (v) => (v <= 0 ? 0 : Math.max(5, v))),
  /** 0 leaves the page at the display's refresh rate; at most 240. Newer InfoPanel builds only. */
  WebViewMaxFps: int(0, (v) => Math.min(240, Math.max(0, v))),
  IsSelected: bool(false),
  ShowFps: bool(false),
  OpenGL: bool(false),
  FontScale: float(1.33),
} satisfies Schema;

const BASE = {
  Name: str(""),
  Hidden: bool(false),
  X: int(100),
  Y: int(100),
  IsLocked: bool(false),
  Rotation: int(0),
} satisfies Schema;

const TEXT = {
  ...BASE,
  /** C# default: the first installed family; "" stands for it here. */
  Font: str(""),
  FontStyle: str(""),
  FontSize: int(20, positive),
  Bold: bool(false),
  Italic: bool(false),
  Underline: bool(false),
  Strikeout: bool(false),
  Color: color("#000000"),
  Uppercase: bool(false),
  RightAlign: bool(false),
  CenterAlign: bool(false),
  Wrap: bool(true),
  Ellipsis: bool(true),
  Width: int(0),
  Height: int(0),
  Marquee: bool(false),
  MarqueeSpeed: int(50),
  MarqueeSpacing: int(40),
  GlowEnabled: bool(false),
  GlowRadius: int(8, (v) => Math.min(20, Math.max(2, v))),
  GlowColor: color("#000000"),
  GlowBlendMode: str("SrcOver"),
} satisfies Schema;

const BINDING = {
  SensorName: str(""),
  SensorType: oneOf(SENSOR_TYPES, "HwInfo"),
  HwInfoRemoteIndex: int(-1),
  Id: uint(0),
  Instance: uint(0),
  EntryId: uint(0),
  LibreSensorId: str(""),
  PluginSensorId: str(""),
  ValueType: oneOf(VALUE_TYPES, "NOW"),
} satisfies Schema;

const CHART = {
  ...BASE,
  ...BINDING,
  MinValue: int(0),
  MaxValue: int(100),
  AutoValue: bool(false),
  Width: int(400, positive),
  Height: int(50, positive),
  FlipX: bool(false),
  Frame: bool(true),
  FrameColor: color("#000000"),
  Background: bool(true),
  BackgroundColor: color("#FFFFFF"),
  Color: color("#808080"),
} satisfies Schema;

/**
 * RtspUrl and HttpUrl setters: empty or null is stored, otherwise the scheme must match or the value is ignored.
 * The first scheme is compared ignoring case, the second exactly (`StartsWith` with and without OrdinalIgnoreCase).
 */
const urlOrNull = (loose: string, exact: string): FieldSpec<string | null> => ({
  kind: "string",
  default: null,
  accept: (v) => (!v || v.slice(0, loose.length).toLowerCase() === loose || v.startsWith(exact) ? v : undefined),
});

const IMAGE = {
  ...BASE,
  Type: oneOf(["FILE", "URL", "RTSP"] as const, "FILE"),
  ShowPanel: bool(false),
  FilePath: strOrNull(),
  RelativePath: bool(false),
  Volume: int(0),
  RtspUrl: urlOrNull("rtsp://", "rtsps://"),
  HttpUrl: urlOrNull("http://", "https://"),
  Cache: bool(true),
  Scale: int(100),
  Width: int(0),
  Height: int(0),
  Layer: bool(false),
  LayerColor: color("#77FFFFFF"),
} satisfies Schema;

export const SCHEMAS = {
  Text: TEXT,
  Clock: { ...TEXT, Format: dateFormat("hh:mm:ss tt") },
  Calendar: { ...TEXT, Format: dateFormat("dd/MM/yyyy") },
  Sensor: {
    ...TEXT,
    ...BINDING,
    Threshold1: double(0),
    Threshold1Color: color("#000000"),
    Threshold2: double(0),
    Threshold2Color: color("#000000"),
    ShowName: bool(false),
    Unit: str(""),
    OverrideUnit: bool(false),
    ShowUnit: bool(true),
    OverridePrecision: bool(false),
    Precision: int(0),
    ShowThousandsSeparator: bool(false),
    AdditionModifier: double(0),
    AbsoluteAddition: bool(true),
    MultiplicationModifier: double(1),
    DivisionToggle: bool(false),
  },
  TableSensor: {
    ...TEXT,
    SensorName: str(""),
    SensorType: oneOf(SENSOR_TYPES, "Plugin"),
    PluginSensorId: str(""),
    ValueType: oneOf(VALUE_TYPES, "NOW"),
    MaxRows: int(10),
    ShowHeader: bool(true),
    TableFormat: str("0:10|1:10|2:10|3:10|4:10|5:10"),
  },
  Graph: {
    ...CHART,
    Type: oneOf(["LINE", "HISTOGRAM"] as const, "LINE"),
    Thickness: int(2, positive),
    Step: int(4, positive),
    Fill: bool(true),
    FillColor: color("#3C888DFF"),
  },
  Bar: { ...CHART, CornerRadius: int(0), Gradient: bool(true), GradientColor: color("#3B3B3B") },
  Donut: {
    ...CHART,
    Rotation: int(90),
    Thickness: int(10, positive),
    Span: int(360, (v) => (v < 1 || v > 360 ? undefined : v)),
  },
  Gauge: {
    ...BASE,
    ...BINDING,
    FlipX: bool(false),
    MinValue: double(0),
    MaxValue: double(100),
    Scale: int(100),
    AnimationSpeed: double(0),
    Width: int(0),
    Height: int(0),
  },
  Image: IMAGE,
  /** Always a URL: C#'s Type getter returns URL and its setter does nothing; HttpUrl is computed from the sensor and takes any text. */
  HttpImage: { ...IMAGE, ...BINDING, HttpUrl: strOrNull(), Type: { ...IMAGE.Type, default: "URL", accept: () => "URL" } as FieldSpec<(typeof IMAGE.Type)["default"]> },
  SensorImage: { ...IMAGE, ...BINDING, Threshold1: double(0), Threshold2: double(100) },
  Shape: {
    ...BASE,
    Type: oneOf(SHAPE_TYPES, "Rectangle"),
    Width: int(100),
    Height: int(100),
    CornerRadius: int(25),
    ShowFrame: bool(true),
    FrameThickness: int(5),
    FrameColor: color("#FFFF0000"),
    ShowFill: bool(true),
    FillColor: color("#FFFF0000"),
    ShowGradient: bool(true),
    GradientColor: color("#FF00FF00"),
    GradientColor2: color("#FF0000FF"),
    GradientType: oneOf(GRADIENT_TYPES, "Linear"),
    GradientAngle: int(0),
    GradientAnimationSpeed: int(300),
  },
  Group: { ...BASE, IsExpanded: bool(true) },
} satisfies Record<string, Schema>;

export type ItemKind = keyof typeof SCHEMAS;

/** Elements that are read by XmlSerializer but carry nothing for rendering. */
export const IGNORED: Partial<Record<ItemKind | "Profile", readonly string[]>> = {
  // Read-only in C# terms: computed (Radius = Width/2), a no-op setter (ReadOnly),
  // or rebuilt from the children (DisplayItemsCount).
  Donut: ["Radius"],
  Image: ["ReadOnly"],
  HttpImage: ["ReadOnly"],
  SensorImage: ["ReadOnly"],
  Group: ["DisplayItemsCount"],
  // Window placement state.
  Profile: ["TargetWindow"],
};

/** `_valueType` is a public field that XmlSerializer writes next to `ValueType`. */
export const ALIASES: Readonly<Record<string, string>> = { _valueType: "ValueType" };

interface ItemExtras {
  /** Elements the schema does not know, by name, as raw text (other InfoPanel versions). */
  unknown: Record<string, string>;
}

type ItemOf<K extends ItemKind> = { kind: K } & Infer<(typeof SCHEMAS)[K]> & ItemExtras;

export type ImageItem = ItemOf<"Image">;
export type GaugeItem = ItemOf<"Gauge"> & { Images: ImageItem[] };
export type GroupItem = ItemOf<"Group"> & { DisplayItems: DisplayItem[] };
export type DisplayItem =
  | { [K in Exclude<ItemKind, "Gauge" | "Group">]: ItemOf<K> }[Exclude<ItemKind, "Gauge" | "Group">]
  | GaugeItem
  | GroupItem;
export type Profile = Infer<typeof PROFILE> & ItemExtras;

/** A new item of `kind` with InfoPanel's defaults, as the constructor makes it. */
export function defaultItem<K extends ItemKind>(kind: K): Extract<DisplayItem, { kind: K }> {
  const fields = Object.fromEntries(Object.entries(SCHEMAS[kind] as Schema).map(([k, s]) => [k, s.default]));
  const lists = kind === "Gauge" ? { Images: [] } : kind === "Group" ? { DisplayItems: [] } : {};
  return { kind, ...fields, ...lists, unknown: {} } as unknown as Extract<DisplayItem, { kind: K }>;
}
