/** The editor's preset strip: picking one replaces the spec (one undo step) and, on a working copy, names it "<preset> copy". */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { presetGauges, type GaugeEntry } from "@/lib/gauge-studio/model";
import { GaugeView } from "./gauge-view";

export interface PresetStripProps {
  scope: Record<string, string>;
  onPick: (preset: GaugeEntry) => void;
}

export function PresetStrip({ scope, onPick }: PresetStripProps) {
  const presets = useMemo(presetGauges, []);
  return (
    <div role="group" aria-label="Presets" className="flex h-[76px] shrink-0 items-center gap-2 overflow-x-auto border-b border-ui-subtle bg-ui-chrome px-4 font-ui">
      <span className="shrink-0 pr-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ui-4">Start from</span>
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          title={p.name}
          onClick={() => onPick(p)}
          className={cn("flex h-[60px] w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-ui-default bg-ui-app hover:border-ui-menu")}
        >
          <GaugeView gauge={p.gauge} p={0.65} size={34} scope={scope} />
          <span className="w-full truncate px-1 text-center text-[10px] text-ui-3">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
