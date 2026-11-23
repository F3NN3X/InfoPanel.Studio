import type { ComponentProps, ReactNode, RefObject } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

/** The look of every popover: a raised card on the menu edge. */
export const POPOVER_POPUP = "rounded-ui-menu border border-ui-menu bg-ui-raised p-2 font-ui text-ui-2 shadow-ui-menu outline-none";

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

interface PopoverContentProps extends Omit<ComponentProps<typeof BasePopover.Popup>, "className"> {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
  /** Position against this element instead of the trigger. */
  anchor?: RefObject<Element | null>;
  /** Added to the popup (a width, a padding); wins over the shared look where they overlap. */
  className?: string;
  /** Added to the positioner (a z-index above a layer that sits over the usual one). */
  positionerClassName?: string;
  children: ReactNode;
}

/** The floating part of a popover: portal, positioner (above dialogs) and popup in one. */
function Content({ side = "bottom", align = "start", sideOffset = 6, collisionPadding, anchor, className, positionerClassName, children, ...popup }: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        anchor={anchor}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn("z-80", positionerClassName)}
      >
        <BasePopover.Popup className={cn(POPOVER_POPUP, className)} {...popup}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

/**
 * The parts of a popover for callers that control it or render their own trigger:
 * `<PopoverParts.Root open onOpenChange><PopoverParts.Trigger/><PopoverParts.Content>…</PopoverParts.Content></PopoverParts.Root>`.
 * Focus moves in on open and back to the trigger on close; Escape and an outside click close it (Base UI).
 */
export const PopoverParts = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Content,
  Title: BasePopover.Title,
  Close: BasePopover.Close,
};

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
    <PopoverParts.Root>
      <PopoverParts.Trigger aria-label={triggerLabel} className={triggerClassName}>
        {trigger}
      </PopoverParts.Trigger>
      <PopoverParts.Content side={side} align={align} anchor={anchor} className={cn("text-small", className)}>
        {children}
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}
