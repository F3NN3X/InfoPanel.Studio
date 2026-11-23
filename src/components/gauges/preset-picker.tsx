/** The editor's Change preset (spec §5): the presets in a popover; picking one replaces the spec (one undo step) and, on a working copy, names it "<preset> copy". */
import { useMemo, useState } from "react";
import { PopoverParts } from "@/components/ui/popover";
import { Repeat2 } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presetGauges, type GaugeEntry } from "@/lib/gauge-studio/model";
import { GaugeView } from "./gauge-view";

export interface PresetPickerProps {
  scope: Record<string, string>;
  onPick: (preset: GaugeEntry) => void;
}

export function PresetPicker({ scope, onPick }: PresetPickerProps) {
  const [open, setOpen] = useState(false);
  const presets = useMemo(presetGauges, []);
  return (
    <PopoverParts.Root open={open} onOpenChange={setOpen}>
      <PopoverParts.Trigger render={<Button icon={<Repeat2 strokeWidth={1.5} />} />}>Change preset</PopoverParts.Trigger>
      <PopoverParts.Content side="bottom" align="start" sideOffset={6} className="w-93" aria-label="Presets">
        <div role="group" aria-label="Presets" className="grid max-h-90 grid-cols-4 gap-1.5 overflow-y-auto">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.name}
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              className={cn("flex h-19 flex-col items-center justify-center gap-1 rounded-ui-md border border-ui-default bg-ui-app hover:border-ui-menu", FOCUS_RING)}
            >
              <GaugeView gauge={p.gauge} p={0.65} size={40} scope={scope} />
              <span className="w-full truncate px-1 text-center text-micro text-ui-3">{p.name}</span>
            </button>
          ))}
        </div>
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}
