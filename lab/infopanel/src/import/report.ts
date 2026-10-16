/**
 * The import report (L8): what an import keeps, changes and needs, from the
 * same parts the lab panels use, in one summary the app's import dialog can show.
 */
import { analyse, scanRefs, type Doc } from "../assets/assets.ts";
import type { FontRow } from "../font-supply.ts";
import { itemAt } from "../editor/ops.ts";
import { gaugePaths, isStale, vectorOf } from "../gauges/frames.ts";
import { convert, type ConvertContext } from "../native/convert.ts";
import { walkItems, type Issue } from "../parse.ts";
import { needsAttention, statusOf, type Group, type Overrides, type Status } from "../remap/remap.ts";
import type { GaugeItem } from "../schema.ts";
import type { Match } from "../sensors.ts";
import type { DataApiInfo } from "./stored.ts";

export interface ImportReport {
  items: { total: number; byKind: Record<string, number> };
  /** Native where possible: how many convert, and why the rest stay InfoPanel. */
  native: { possible: number; stays: { reason: string; count: number }[] };
  sensors: { groups: number; items: number; byStatus: Partial<Record<Status, number>>; attention: number };
  assets: { files: number; bytes: number; unused: number; duplicates: number; missing: string[]; urls: number; absolute: string[] };
  fonts: { requests: number; missing: string[]; supplied: number };
  gauges: { total: number; vector: number; withoutFrames: number };
  issues: Partial<Record<Issue["code"], number>>;
  dataApi: DataApiInfo | null;
}

export interface ReportInput {
  doc: Doc;
  issues: readonly Issue[];
  groups: readonly Group[];
  resolved: ReadonlyMap<string, Match | null>;
  overrides: Overrides;
  fontRows: readonly FontRow[];
  convertCtx: ConvertContext;
  dataApi: DataApiInfo | null;
}

const tally = <K extends string>(keys: readonly K[]) => {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
};

/** "rotated: no dashboard widget draws it" and "rotated" count as one reason. */
const reasonOf = (r: string) => r.split(":")[0];

export function buildReport(input: ReportInput): ImportReport {
  const { doc } = input;
  const all = [...walkItems(doc.items)];
  const conversions = all.filter(({ item }) => item.kind !== "Group").map(({ item }, i) => convert(item, `r${i}`, input.convertCtx));
  const stays = new Map<string, number>();
  for (const c of conversions) if (!c.ok) stays.set(reasonOf(c.reason), (stays.get(reasonOf(c.reason)) ?? 0) + 1);

  const statuses = input.groups.map((g) => statusOf(g, input.resolved.get(g.id) ?? null, input.overrides));
  const cleanup = analyse(doc);
  const { others } = scanRefs(doc.items);
  const gauges = gaugePaths(doc.items).map((p) => itemAt(doc.items, p) as GaugeItem);
  const vector = gauges.filter((g) => vectorOf(g));

  return {
    items: { total: all.length, byKind: tally(all.map(({ item }) => item.kind)) as Record<string, number> },
    native: {
      possible: conversions.filter((c) => c.ok).length,
      stays: [...stays].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    },
    sensors: {
      groups: input.groups.length,
      items: input.groups.reduce((n, g) => n + g.paths.length, 0),
      byStatus: tally(statuses),
      attention: statuses.filter(needsAttention).length,
    },
    assets: {
      files: doc.assets.size,
      bytes: [...doc.assets.values()].reduce((n, f) => n + f.bytes.length, 0),
      unused: cleanup.unused.length,
      duplicates: cleanup.duplicates.reduce((n, g) => n + g.length - 1, 0),
      missing: cleanup.missing.map((m) => m.name),
      urls: others.filter((o) => o.kind === "url").length,
      absolute: [...new Set(others.filter((o) => o.kind === "absolute").map((o) => o.value))],
    },
    fonts: {
      requests: input.fontRows.length,
      missing: [...new Set(input.fontRows.filter((r) => r.missing && r.use !== "supplied").map((r) => r.request.font))],
      supplied: input.fontRows.filter((r) => r.use === "supplied").length,
    },
    gauges: { total: gauges.length, vector: vector.length, withoutFrames: vector.filter((g) => isStale(g)).length },
    issues: tally(input.issues.map((i) => i.code)),
    dataApi: input.dataApi,
  };
}

/** What the live Data API offers, from one `/api/sensors` answer and the font loader. */
export function dataApiInfo(url: string, sensors: Record<string, { ref?: string; table?: unknown }>, fontApi: string | null): DataApiInfo {
  const values = Object.values(sensors);
  return { url, ref: values.some((v) => typeof v.ref === "string"), tables: values.some((v) => v.table !== undefined && v.table !== null), fonts: fontApi !== null };
}
