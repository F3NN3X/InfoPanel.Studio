import type { ReactNode } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { Button, FOCUS_RING } from "./button";

interface InheritDotProps {
  /** The level above ("Perf heavy"): a hollow dot follows it. */
  from: string;
  /** The value is set here: the dot is filled and clicking it offers Reset. */
  set?: boolean;
  onReset?: () => void;
}

/** The 7 px dot before a setting's label. Hollow follows the level above; filled accent is set here. */
export function InheritDot({ from, set, onReset }: InheritDotProps) {
  if (!set || !onReset) return <span role="img" aria-label={`From ${from}`} title={`From ${from}`} className="h-1.75 w-1.75 shrink-0 rounded-full border border-ui-hint" />;
  return (
    <BasePopover.Root>
      <BasePopover.Trigger aria-label={`Set here, reset to ${from}`} title={`Set here, reset to ${from}`} className={cn("relative h-1.75 w-1.75 shrink-0 rounded-full bg-ui-accent after:absolute after:-inset-1.5 after:content-['']", FOCUS_RING)} />
      <BasePopover.Portal>
        <BasePopover.Positioner side="bottom" align="start" sideOffset={6} className="z-[80]">
          <BasePopover.Popup className="flex items-center gap-2 rounded-ui-menu border border-ui-menu bg-ui-raised p-1 pl-3 font-ui text-caption text-ui-3 shadow-ui-menu outline-none">
            From {from}
            <BasePopover.Close render={<Button small variant="ghost" onClick={onReset} />}>Reset</BasePopover.Close>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

interface SettingRowProps {
  label: ReactNode;
  /** The inheritance dot, when the setting has a level above. */
  dot?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A setting: label left, control right, at least 36 px high. */
export function SettingRow({ label, dot, children, className }: SettingRowProps) {
  return (
    <div className={cn("flex min-h-9 items-center gap-3", className)}>
      {dot}
      <span className="min-w-0 flex-1 truncate text-body text-ui-2">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
