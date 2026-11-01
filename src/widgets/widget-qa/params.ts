import type { ModuleSettings } from "@/modules/types";

/** Everything the `?widget-qa` toolbar controls; the URL is its serialised form. */
export interface QaState {
  /** Explicit `module=` ids (legacy included); unset = the template widgets only. */
  module?: string[];
  spans: string;
  cell: number;
  gap: number;
  skin: string;
  variant: string;
  surface: string;
  graph: string;
  meter: string;
  accent: string;
  radius: string;
  theme: string;
  /** Raw `settings=` JSON, merged over the look keys. */
  settings: string;
  /** fixtures: the snapshot and demo streams; stress: the same pushed to long text and top values; live: the server's. */
  data: QaData;
  /** Filter box: matches a module id or title. */
  q: string;
  /** The widget the Skins and Surfaces galleries show; unset = CpuMonitor and SystemStatus. */
  gallery: string;
  /** Mount every frame at once instead of as they scroll into view. */
  eager: boolean;
  /** Draw the grid cells and gaps over every frame. */
  grid: boolean;
  /** Only the widgets with redesign notes (`notes.json`). */
  noted: boolean;
}

export type QaData = "fixtures" | "stress" | "live";
const DATA: QaData[] = ["fixtures", "stress", "live"];

export const DEFAULT_SPANS = "1x1,2x1,3x1,1x2,2x2,4x2";
export const DEFAULT_STATE: QaState = {
  spans: DEFAULT_SPANS,
  cell: 110,
  gap: 8,
  skin: "",
  variant: "",
  surface: "",
  graph: "",
  meter: "",
  accent: "",
  radius: "",
  theme: "",
  settings: "",
  // Fixtures by default, so the page draws the same every time; `data=live` reads the server's sensors.
  data: "fixtures",
  q: "",
  gallery: "",
  eager: false,
  grid: false,
  noted: false,
};

/** The text params, in URL order. */
const TEXT_KEYS = ["spans", "skin", "variant", "surface", "graph", "meter", "accent", "radius", "theme", "settings", "q", "gallery"] as const;
/** The look keys merged into every placement's settings. */
export const LOOK_KEYS = ["skin", "variant", "surface", "graph", "meter", "accent", "radius"] as const;

export function parseParams(search: string): QaState {
  const q = new URLSearchParams(search);
  const ids = q.get("module")?.split(",").filter(Boolean);
  const text = Object.fromEntries(TEXT_KEYS.flatMap((k) => (q.has(k) ? [[k, q.get(k)!]] : [])));
  return {
    ...DEFAULT_STATE,
    ...text,
    module: ids?.length ? ids : undefined,
    cell: Number(q.get("cell")) || DEFAULT_STATE.cell,
    gap: q.has("gap") ? Number(q.get("gap")) || 0 : DEFAULT_STATE.gap,
    data: DATA.find((d) => d === q.get("data")) ?? "fixtures",
    eager: q.get("eager") === "1",
    grid: q.get("grid") === "1",
    noted: q.get("noted") === "1",
  };
}

/** A widget's own links: the page with only it (`solo`), and with its Skins and Surfaces galleries (`skins`). */
export function widgetLinks(s: QaState, id: string): { solo: string; skins: string } {
  return { solo: serializeParams({ ...s, module: [id], q: "" }), skins: `${serializeParams({ ...s, gallery: id })}#galleries` };
}

/** A frame's anchor id: `<module>--<key>`, the key a span (`2x1`) or a view (`view:gauge`). */
export const frameId = (module: string, key: string) => `${module}--${key.replace(":", "-")}`;

/**
 * What a frame's caption copies: a line naming the frame and the look it is drawn in, and a link that opens the widget
 * alone at this frame, so "CodingAgents 2x1" in a request means exactly this frame.
 */
export function frameRef(s: QaState, module: string, key: string, base: string): { text: string; url: string } {
  const look = [`cell ${s.cell}`, `skin ${s.skin || "default"}`, ...LOOK_KEYS.filter((k) => k !== "skin" && s[k]).map((k) => `${k} ${s[k]}`), ...(s.data === "fixtures" ? [] : [`${s.data} data`])];
  const url = `${base}${widgetLinks(s, module).solo}#${frameId(module, key)}`;
  return { text: `${module} ${key} (${look.join(", ")})\n${url}`, url };
}

/** The query string (with `?widget-qa`) for a state; params at their default are left out. */
export function serializeParams(s: QaState): string {
  const parts = ["widget-qa"];
  const add = (k: string, v: string | number) => parts.push(`${k}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`);
  if (s.module?.length) add("module", s.module.join(","));
  for (const k of TEXT_KEYS) if (s[k] !== DEFAULT_STATE[k]) add(k, s[k]);
  if (s.cell !== DEFAULT_STATE.cell) add("cell", s.cell);
  if (s.gap !== DEFAULT_STATE.gap) add("gap", s.gap);
  if (s.data !== DEFAULT_STATE.data) add("data", s.data);
  if (s.eager) add("eager", "1");
  if (s.grid) add("grid", "1");
  if (s.noted) add("noted", "1");
  return `?${parts.join("&")}`;
}

export function parseSpans(spans: string): [number, number][] {
  return spans
    .split(",")
    .map((s) => s.split("x").map(Number))
    .filter(([c, r]) => c > 0 && r > 0) as [number, number][];
}

/** The settings merged into every placement: the look controls, then the raw `settings` JSON over them. */
export function placementSettings(s: QaState): ModuleSettings {
  let extra: ModuleSettings = {};
  if (s.settings) {
    try {
      extra = JSON.parse(s.settings);
    } catch {
      console.warn("widget-qa: settings is not valid JSON");
    }
  }
  const look = Object.fromEntries(LOOK_KEYS.flatMap((k) => (s[k] ? [[k, s[k]]] : [])));
  return { ...look, ...extra };
}
