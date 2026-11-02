import type { ReactNode, RefObject } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

interface PopoverProps {
  /** Content of the trigger button. */
  trigger: ReactNode;
  /** Accessible name of the trigger when it is icon-only. */
  triggerLabel?: string;
  triggerClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Position against this element instead of the trigger. */
  anchor?: RefObject<Element | null>;
  className?: string;
  children: ReactNode;
}

/** A click-to-open floating panel on the chrome tokens. */
export function Popover({
  trigger,
  triggerLabel,
  triggerClassName,
  side = "bottom",
  align = "start",
  anchor,
  className,
  children,
}: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger aria-label={triggerLabel} className={triggerClassName}>
        {trigger}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} anchor={anchor} sideOffset={6} className="z-[80]">
          <BasePopover.Popup
            className={cn(
              "rounded-ui-menu border border-ui-menu bg-ui-raised p-2 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none",
              className
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
