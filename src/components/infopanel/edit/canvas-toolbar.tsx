/**
 * How an imported profile's canvas previews, in its page settings (decision Q10, after Edit v3 phase 6: no strip above
 * the canvas, so imported and screen pages share one chrome): Show modes with its legend, the sensor source, Compare
 * with InfoPanel's screenshot, and Save to Library for the profile. Drawing the page as InfoPanel does is the zoom
 * bar's `Studio | InfoPanel` (sign-off round 1: no Draw all as here).
 */
import { useRef } from "react";
import { Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { modeTally, type SensorMode } from "@/lib/infopanel/canvas-edit";
import { Toggle } from "@/components/ui/toggle";
import type { Compare } from "./edit-canvas";
import type { CanvasEditor } from "./use-canvas-editor";
import type { LibraryLink } from "./use-library-link";

/** A small segmented choice ("Sensors", an item's "Draw as"). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-[30px] shrink-0 items-center gap-0.5 rounded-ui-md border border-ui-default p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-ui-sm px-2.5 text-caption text-ui-3 hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-35",
            value === o.value && "bg-ui-active text-ui-1",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface CanvasViewProps {
  editor: CanvasEditor;
  showModes: boolean;
  onShowModes: (on: boolean) => void;
  compareOn: boolean;
  onCompareOn: (on: boolean) => void;
  compare: Compare | null;
  onCompare: (next: Compare | null) => void;
  /** The Data API did not answer: the Live sensor source is off. */
  apiUnreachable: boolean;
  /** Save to Library, or Update in Library once the profile has an item. */
  library?: LibraryLink;
}

const ROW = "flex min-h-7 items-center justify-between gap-2 text-caption text-ui-2";

/** The page settings' Preview section on an imported profile. */
export function CanvasViewSection({ editor, showModes, onShowModes, compareOn, onCompareOn, compare, onCompare, apiUnreachable, library }: CanvasViewProps) {
  const sensorOptions: { value: SensorMode; label: string; disabled?: boolean; title?: string }[] = [
    { value: "unbound", label: "Unbound", title: "As InfoPanel draws with no sensor" },
    { value: "live", label: "Live", disabled: apiUnreachable, title: apiUnreachable ? "Data API not reachable" : undefined },
    { value: "mock", label: "Mock", title: "A slider per sensor in the inspector" },
  ];
  return (
    <section aria-label="Preview" className="flex flex-col gap-2 border-b border-ui-subtle px-4 py-3 font-ui">
      <div className="text-caption font-semibold text-ui-1">Preview</div>
      <div className={ROW}>
        Show modes
        <Toggle checked={showModes} onChange={onShowModes} label="Show modes" />
      </div>
      {showModes && <ModesLegend editor={editor} />}
      <div className={ROW}>
        Sensors
        <Segmented<SensorMode> label="Sensors" value={editor.sensorMode} options={sensorOptions} onChange={editor.setSensorMode} />
      </div>
      <div className={ROW}>
        <span title="Lay InfoPanel’s screenshot over the render">Compare</span>
        <Toggle checked={compareOn} onChange={onCompareOn} label="Compare" />
      </div>
      {compareOn && <CompareControls compare={compare} onCompare={onCompare} />}
      {library && (
        <button
          type="button"
          onClick={library.run}
          disabled={library.busy}
          title="Keep this profile in your Library, to start new profiles from"
          className="mt-1 flex h-7 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised text-caption text-ui-1 hover:bg-ui-hover disabled:opacity-50"
        >
          <Library className="h-3.5 w-3.5" />
          {library.label}
        </button>
      )}
    </section>
  );
}

/** Show modes: the legend with each mode's count. */
function ModesLegend({ editor }: { editor: CanvasEditor }) {
  const t = modeTally(editor.modes);
  const row = (dot: string, label: string, n: number) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-[3px]", dot)} />
      {label}
      <span className="font-ui-mono text-ui-4">{n}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ui-2">
      {row("bg-ui-accent/60", "Native widget", t.native)}
      {row("bg-ui-warning/60", "InfoPanel", t.infopanel)}
      {row("bg-ui-danger/60", "Can’t convert yet", t.stuck)}
    </div>
  );
}

/** Compare: pick InfoPanel's screenshot, then its opacity; the blend is a difference. */
function CompareControls({ compare, onCompare }: { compare: Compare | null; onCompare: (next: Compare | null) => void }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ui-2">
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="h-7 w-full rounded-[7px] border border-ui-default px-2.5 text-caption text-ui-2 hover:bg-ui-hover"
      >
        {compare ? "Change screenshot…" : "Choose InfoPanel screenshot…"}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (compare) URL.revokeObjectURL(compare.src);
          onCompare({ src: URL.createObjectURL(f), opacity: compare?.opacity ?? 0.5 });
        }}
      />
      {compare ? (
        <>
          <span className="text-ui-4">Opacity</span>
          <input
            type="range"
            aria-label="Screenshot opacity"
            min={0}
            max={100}
            value={Math.round(compare.opacity * 100)}
            onChange={(e) => onCompare({ ...compare, opacity: Number(e.target.value) / 100 })}
            className="min-w-0 flex-1 accent-[var(--ui-accent)]"
          />
          <span className="font-ui-mono">{Math.round(compare.opacity * 100)} %</span>
          <span className="w-full text-micro text-ui-4">Difference blend</span>
        </>
      ) : (
        <span className="text-micro leading-snug text-ui-4">A screenshot of the profile in InfoPanel, laid over the render: matching pixels go black.</span>
      )}
    </div>
  );
}
