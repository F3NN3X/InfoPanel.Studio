/** Reading a gauge file picked on the Gauges page: a `.gauge.json` spec or an SVG template (spec §6). */
import { readSpecFile, specFile } from "@/lib/infopanel/gauges/spec-file";
import { sanitizeTemplate } from "@/lib/infopanel/gauges/svg-template";
import { DEFAULT_GAUGE, MAX_TEMPLATE, normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface ImportedGauge {
  name: string;
  gauge: VectorGauge;
  /** What the sanitiser dropped from an SVG, for a toast. */
  removed: string[];
}

const baseName = (file: string) => file.replace(/\.gauge\.json$|\.[^.]*$/i, "").replace(/[\p{Cc}]/gu, "").trim().slice(0, 80) || "Gauge";

/** A gauge from a file's name and text; throws an Error whose message is for the user. */
export function importGauge(fileName: string, text: string): ImportedGauge {
  if (/\.svg$/i.test(fileName)) {
    if (text.length > MAX_TEMPLATE) throw new Error(`The SVG is over ${MAX_TEMPLATE / 1024} KB`);
    const t = sanitizeTemplate(text);
    const gauge = normalizeGauge({ ...DEFAULT_GAUGE, shape: "svg", width: t.width, height: t.height, template: t.svg });
    return { name: baseName(fileName), gauge, removed: [...new Set(t.removed)] };
  }
  const spec = readSpecFile(text);
  return { name: spec.name === "Gauge" ? baseName(fileName) : spec.name, gauge: spec.gauge, removed: [] };
}

/** A download name for an exported spec. */
export const exportFileName = (name: string): string => `${name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "gauge"}.gauge.json`;

/** The `.gauge.json` an export writes (and "Copy JSON" copies): its name and exactly its text. */
export const gaugePayload = (name: string, gauge: VectorGauge): { name: string; text: string } => ({ name: exportFileName(name), text: specFile(name, gauge) });
