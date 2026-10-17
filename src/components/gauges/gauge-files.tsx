/** Gauge files on the Gauges page: picking a `.gauge.json` or SVG to import, and downloading a spec. */
import { useRef } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { exportFileName, importGauge, type ImportedGauge } from "@/lib/gauge-studio/import-file";
import { specFile } from "@/lib/infopanel/gauges/spec-file";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

/** Download `gauge` as `<name>.gauge.json`. */
export function downloadSpec(name: string, gauge: VectorGauge): void {
  const url = URL.createObjectURL(new Blob([specFile(name, gauge)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The Import button: a `.gauge.json` or an SVG; refusals and anything the sanitiser dropped are toasts. */
export function ImportGaugeButton({ onImported, className, label = "Import .gauge.json / SVG" }: { onImported: (got: ImportedGauge) => void; className: string; label?: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File) => {
    try {
      const got = importGauge(file.name, await file.text());
      if (got.removed.length) toast(`Removed from the SVG: ${got.removed.slice(0, 4).join(", ")}`);
      onImported(got);
    } catch (e) {
      toast(`Not imported: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        <Download className="h-4 w-4" /> {label}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.gauge.json,.svg,application/json,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}
