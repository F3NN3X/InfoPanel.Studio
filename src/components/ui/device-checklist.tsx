import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeviceItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface DeviceChecklistProps {
  devices: DeviceItem[];
  /** Ids of the ticked devices. */
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  className?: string;
}

/** Checkbox rows for picking several devices. */
export function DeviceChecklist({ devices, value, onChange, label, className }: DeviceChecklistProps) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-0.5", className)}>
      {devices.map((d) => {
        const on = value.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(d.id)}
            className="flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] text-ui-2 hover:bg-ui-hover"
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                on ? "border-ui-accent bg-ui-accent text-ui-inverse-fg" : "border-ui-control bg-ui-app"
              )}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            {d.icon && <span className="text-ui-4 [&>svg]:h-3.5 [&>svg]:w-3.5">{d.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}
