/**
 * Numbered frame series among a profile's files (`fan_000.png`, `fan_001.png`, ...): the Library's
 * files table shows each series as one row with a frame count instead of a row per frame.
 */

export interface FrameName {
  /** The name before the number, separator dropped, lower case: `fan` for `fan_007.png`. */
  stem: string;
  index: number;
  /** Lower-case extension, no dot. */
  ext: string;
}

/** `stem`, an optional `_`, `-`, `.` or space, digits, extension; null for a name without a trailing number. */
export function parseFrameName(name: string): FrameName | null {
  const m = /^(.*?[^\d_.\- ])[_.\- ]?(\d+)\.([A-Za-z0-9]+)$/.exec(name);
  return m ? { stem: m[1].toLowerCase(), index: Number(m[2]), ext: m[3].toLowerCase() } : null;
}

/** Fewer frames than this are more likely numbered variants (`v1`, `v2`) than an animation. */
const MIN_FRAMES = 3;

export type FileRow<F> = { kind: "file"; file: F } | { kind: "series"; stem: string; frames: F[] };

/**
 * `files` in order, each run of three or more files sharing a stem and extension, numbered without gaps or repeats,
 * as one series row (frames by number), placed where its first file was. `v1`/`v2` or `icon-16`/`icon-32`/`icon-64`
 * are separate pictures, and `fan_1`/`fan_01` repeat a number, so none of those collapse.
 */
export function groupFrameSeries<F extends { name: string }>(files: readonly F[]): FileRow<F>[] {
  const keyOf = (f: F) => {
    const p = parseFrameName(f.name);
    return p ? `${p.stem}\u0000${p.ext}` : null;
  };
  const members = new Map<string, F[]>();
  for (const f of files) {
    const k = keyOf(f);
    if (k) members.set(k, [...(members.get(k) ?? []), f]);
  }
  const byIndex = (a: F, b: F) => parseFrameName(a.name)!.index - parseFrameName(b.name)!.index;
  const isSeries = (group: readonly F[]) => {
    if (group.length < MIN_FRAMES) return false;
    const indices = [...group].sort(byIndex).map((x) => parseFrameName(x.name)!.index);
    return indices.every((n, i) => i === 0 || n === indices[i - 1] + 1);
  };
  const rows: FileRow<F>[] = [];
  const done = new Set<string>();
  for (const f of files) {
    const k = keyOf(f);
    const group = k ? members.get(k) : undefined;
    if (!k || !group || !isSeries(group)) rows.push({ kind: "file", file: f });
    else if (!done.has(k)) {
      done.add(k);
      const frames = [...group].sort(byIndex);
      rows.push({ kind: "series", stem: parseFrameName(f.name)!.stem, frames });
    }
  }
  return rows;
}
