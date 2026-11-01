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
  data: "fixtures" | "live";
  /** Filter box: matches a module id or title. */
  q: string;
  /** Mount every frame at once instead of as they scroll into view. */
  eager: boolean;
}

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
  eager: false,
};

/** The text params, in URL order. */
const TEXT_KEYS = ["spans", "skin", "variant", "surface", "graph", "meter", "accent", "radius", "theme", "settings", "q"] as const;
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
    data: q.get("data") === "live" ? "live" : "fixtures",
    eager: q.get("eager") === "1",
  };
}

/** The query string (with `?widget-qa`) for a state; params at their default are left out. */
export function serializeParams(s: QaState): string {
  const parts = ["widget-qa"];
  const add = (k: string, v: string | number) => parts.push(`${k}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`);
  if (s.module?.length) add("module", s.module.join(","));
  for (const k of TEXT_KEYS) if (s[k] !== DEFAULT_STATE[k]) add(k, s[k]);
  if (s.cell !== DEFAULT_STATE.cell) add("cell", s.cell);
  if (s.gap !== DEFAULT_STATE.gap) add("gap", s.gap);
  if (s.data === "live") add("data", "live");
  if (s.eager) add("eager", "1");
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
