/**
 * Asset polish (L12): replacing many files at once by name, and the sizes a
 * resize asks for. Pure; the encoding itself is in AssetPanel (browser only).
 */
import { assetKey, replace, type AssetFile, type AssetTable, type Doc } from "./assets.ts";

const stem = (name: string) => assetKey(name).replace(/^.*\//, "").replace(/\.[^.]*$/, "");

export interface NameMatch {
  /** The profile's file the new one replaces. */
  target: string;
  file: AssetFile;
  /** Matched on the name without its extension (another type). */
  byStem: boolean;
}

export interface BulkPlan {
  matches: NameMatch[];
  /** New files that match no profile file. */
  unmatched: string[];
  /** New files whose stem matches several profile files (no exact name): left out. */
  ambiguous: string[];
  /** New files with the same bytes as their target: nothing to do. */
  same: string[];
}

/**
 * Pairs new files with the profile's files by name: the exact name first
 * (ignoring case), else the same name without its extension when that is
 * unique. A profile file is replaced at most once.
 */
export function matchByName(table: AssetTable, files: readonly AssetFile[]): BulkPlan {
  const byStem = new Map<string, string[]>();
  for (const f of table.values()) byStem.set(stem(f.name), [...(byStem.get(stem(f.name)) ?? []), f.name]);
  const plan: BulkPlan = { matches: [], unmatched: [], ambiguous: [], same: [] };
  const taken = new Set<string>();
  for (const file of files) {
    const exact = table.get(assetKey(file.name));
    const candidates = byStem.get(stem(file.name)) ?? [];
    const target = exact?.name ?? (candidates.length === 1 ? candidates[0] : null);
    if (!target) {
      (candidates.length > 1 ? plan.ambiguous : plan.unmatched).push(file.name);
      continue;
    }
    if (taken.has(assetKey(target))) {
      plan.ambiguous.push(file.name);
      continue;
    }
    taken.add(assetKey(target));
    if (table.get(assetKey(target))!.hash === file.hash) plan.same.push(file.name);
    else plan.matches.push({ target, file, byStem: !exact });
  }
  return plan;
}

/** Every match replaced: one doc, so one undo step. */
export const applyBulk = (doc: Doc, matches: readonly NameMatch[]): Doc => matches.reduce((d, m) => replace(d, m.target, m.file), doc);

export type ResizeRule = { kind: "keep" } | { kind: "percent"; percent: number } | { kind: "longest"; px: number };

/** The size a resize rule asks for; never larger than the image, never below 1 px. */
export function resizeTarget(width: number, height: number, rule: ResizeRule): { width: number; height: number } {
  const scale =
    rule.kind === "percent" ? Math.min(1, Math.max(0, rule.percent) / 100) : rule.kind === "longest" ? Math.min(1, rule.px / Math.max(width, height, 1)) : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Keep a re-encode only when it saves at least `minGain` of the bytes (5 % by default). */
export const worthKeeping = (before: number, after: number, minGain = 0.05) => after <= before * (1 - minGain);
