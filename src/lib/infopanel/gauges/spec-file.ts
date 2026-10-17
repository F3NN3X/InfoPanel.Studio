/** A vector gauge spec as a file of its own (`.gauge.json`), to share or keep outside a profile (L10). */
import { normalizeGauge, type VectorGauge } from "./vector.ts";

export const SPEC_FORMAT = "infopanel-gauge";
/** Well over any spec: a template is at most 256 KB. */
const MAX_FILE = 1024 * 1024;

export function specFile(name: string, gauge: VectorGauge): string {
  return JSON.stringify({ format: SPEC_FORMAT, version: 1, name, gauge }, null, 1);
}

/** Reads a spec file; the gauge is normalized like any untrusted spec. */
export function readSpecFile(text: string): { name: string; gauge: VectorGauge } {
  if (text.length > MAX_FILE) throw new Error("The file is too large for a gauge spec");
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("Not a JSON file");
  }
  const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  if (r.format !== SPEC_FORMAT || !r.gauge || typeof r.gauge !== "object") throw new Error("Not a gauge spec (.gauge.json)");
  if (r.version !== 1) throw new Error(`Gauge spec version ${String(r.version)} is newer than this lab reads`);
  const name = typeof r.name === "string" ? r.name.replace(/[\p{Cc}]/gu, "").slice(0, 80) : "";
  return { name: name || "Gauge", gauge: normalizeGauge(r.gauge) };
}
