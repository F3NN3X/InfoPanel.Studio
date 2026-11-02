import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import type { MadeFor } from "@/lib/layout";
import { POPUP } from "./menu-styles";

/** The two answers (one-editor SPEC §5.1), with what each one does. */
export const MADE_FOR: readonly { value: MadeFor; label: string; note: string }[] = [
  { value: "studio", label: "Studio panels", note: "Shows on panels running Studio." },
  { value: "infopanel", label: "InfoPanel too", note: "Also checks what exports to the InfoPanel app." },
];

interface MadeForControlProps {
  /** The screen's answer; unset reads as Studio panels. */
  value: MadeFor | undefined;
  /** One undo step. */
  onChange: (value: MadeFor) => void;
}

/**
 * Made for (SPEC §5.1, decision D5): who the screen is for. "InfoPanel too" turns on the Export check, the export
 * badges and the On InfoPanel lines; "Studio panels" hides them all.
 */
export function MadeForControl({ value = "studio", onChange }: MadeForControlProps) {
  const current = MADE_FOR.find((m) => m.value === value) ?? MADE_FOR[0];
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Made for: ${current.label}`}
        data-testid="made-for"
        className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-[7px] border border-ui-default bg-ui-raised pl-2.5 pr-1.5 text-[11.5px] text-ui-1 transition-colors hover:bg-ui-hover data-popup-open:bg-ui-hover"
      >
        <span className="text-ui-4">Made for</span>
        <span>{current.label}</span>
        <ChevronDown className="h-[15px] w-[15px] text-ui-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={`${POPUP} w-64`}>
            <div role="group">
              {MADE_FOR.map((m) => (
                <Menu.Item
                  key={m.value}
                  role="menuitemradio"
                  aria-checked={m.value === value}
                  onClick={() => m.value !== value && onChange(m.value)}
                  className="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 outline-none select-none data-highlighted:bg-ui-active data-highlighted:text-ui-1 data-highlighted:shadow-[inset_2px_0_0_var(--ui-accent)]"
                >
                  <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center">
                    {m.value === value && <Check className="h-3.5 w-3.5 text-ui-accent-text" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-ui-1">{m.label}</span>
                    <span className="block text-micro leading-snug text-ui-4">{m.note}</span>
                  </span>
                </Menu.Item>
              ))}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
