// "Show in" (builder audit G23, owner Q4): a Value or a Ring shows its reading in another unit of the reading's family, from this
// fixed table and nothing else, so the unit drawn can never disagree with the number. The reading's own unit says which family it
// is in; a reading of another family, or of a unit the table has not got, is shown as it is read. Sizes are binary (1 KB = 1024
// bytes), as the app's memory and drive widgets show them (`fmtMB`, `gbParts`); rates are decimal, as `fmtRate` and Task Manager
// show them. Pure.

/** The units a recipe may convert to (`convert`), by family; each unit's factor to its family's base (Hz, B, B/s, W). */
export const UNIT_TABLE = {
  frequency: { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 },
  size: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 },
  rate: { "B/s": 1, "KB/s": 1e3, "MB/s": 1e6, "GB/s": 1e9 },
  power: { W: 1, kW: 1e3 },
  temperature: { "°C": 1, "°F": 1 },
} as const;
export type UnitFamily = keyof typeof UNIT_TABLE;
export type ConvertUnit = { [F in UnitFamily]: keyof (typeof UNIT_TABLE)[F] }[UnitFamily];

/** Every unit of the table, in its order (the schema's `$defs.convert` lists the same). */
export const CONVERT_UNITS = Object.values(UNIT_TABLE).flatMap((f) => Object.keys(f)) as ConvertUnit[];

/** How sources write some of the table's units. */
const ALIASES: Readonly<Record<string, ConvertUnit>> = { kB: "KB", "kB/s": "KB/s", KHz: "kHz", "℃": "°C", "℉": "°F" };

/** A unit as the table writes it, or undefined when the table has not got it. */
export function tableUnit(unit: string): ConvertUnit | undefined {
  const u = unit.trim();
  return (CONVERT_UNITS as readonly string[]).includes(u) ? (u as ConvertUnit) : ALIASES[u];
}

/** The family a unit belongs to, or undefined. */
export function familyOf(unit: string): UnitFamily | undefined {
  const u = tableUnit(unit);
  return u && (Object.keys(UNIT_TABLE) as UnitFamily[]).find((f) => u in UNIT_TABLE[f]);
}

/** The units a reading in `unit` can be shown in (its family's, its own among them); none for a unit the table has not got. */
export const unitsLike = (unit: string): ConvertUnit[] => {
  const f = familyOf(unit);
  return f ? (Object.keys(UNIT_TABLE[f]) as ConvertUnit[]) : [];
};

/** `value` read in `from`, in `to`; undefined when the two are not of one family (the reading is then shown as it is). */
export function convertValue(value: number, from: string, to: ConvertUnit): number | undefined {
  const a = tableUnit(from);
  const f = a && familyOf(a);
  if (!a || !f || familyOf(to) !== f) return undefined;
  if (f === "temperature") return a === to ? value : to === "°F" ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
  const units = UNIT_TABLE[f] as Readonly<Record<string, number>>;
  return (value * units[a]) / units[to];
}

/** The Data API's throughput keys carry bytes per second though the source labels them "KB/s" (`fmtRate`, core/data.ts). */
const RATE_KEY = /^libre\..+_(download_speed|upload_speed|read_rate|write_rate)$/;

/** The unit a reading is really in: its own (what follows the number in "4911 MHz"), but bytes per second for a throughput key (B20). */
export const readingUnit = (key: string | undefined, text: string): string => (key && RATE_KEY.test(key) ? "B/s" : text.replace(/^[-\d.,\s]+/, "").trim());
