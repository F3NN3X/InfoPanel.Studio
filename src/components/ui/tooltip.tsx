import type { ReactElement, ReactNode } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

interface TooltipProps {
  /** The text shown beside the trigger. */
  label: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  /** Show no tooltip (the control already carries its words). */
  disabled?: boolean;
  /** The element that gets the tooltip; it receives the trigger's props. */
  children: ReactElement;
}

/** Groups tooltips so the second one opens at once after the first (`delay` ms for the first). */
export function TooltipProvider({ delay = 300, children }: { delay?: number; children: ReactNode }) {
  return <BaseTooltip.Provider delay={delay}>{children}</BaseTooltip.Provider>;
}

/** A hover and focus label on the chrome tokens; it never takes the pointer. */
export function Tooltip({ label, side = "right", sideOffset = 8, disabled, children }: TooltipProps) {
  return (
    <BaseTooltip.Root disableHoverablePopup disabled={disabled}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="z-80">
          <BaseTooltip.Popup className="pointer-events-none rounded-ui-sm border border-ui-menu bg-ui-raised px-2 py-1 font-ui text-caption text-ui-2 shadow-ui-menu">{label}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
