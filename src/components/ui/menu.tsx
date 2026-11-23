import type { ComponentProps, ReactNode } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

/** The popup every menu shares: a raised card on the menu edge. */
export const MENU_POPUP =
  "min-w-40 rounded-ui-menu border border-ui-menu bg-ui-raised p-1 font-ui text-body text-ui-2 shadow-ui-menu outline-none";
/**
 * One menu row. Hover and the keyboard share the neutral highlight step (`data-highlighted`: no edge, no accent, since
 * the accent is for selection and focus); a disabled row dims; a row that opens a flyout keeps the hover step while it is open.
 */
export const MENU_ITEM =
  "group flex h-8 cursor-default items-center justify-between gap-3 rounded-ui-md px-2 outline-none select-none data-disabled:text-ui-hint data-highlighted:bg-ui-highlight data-highlighted:text-ui-1 data-popup-open:bg-ui-hover";
export const MENU_SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";

interface MenuContentProps extends Omit<ComponentProps<typeof BaseMenu.Popup>, "className"> {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  /** Position against this instead of the trigger (a virtual point for a right-click menu). */
  anchor?: ComponentProps<typeof BaseMenu.Positioner>["anchor"];
  /** How it stays on screen; Base UI's default flips sides. A right-click menu shifts instead, as the old one clamped. */
  collisionAvoidance?: ComponentProps<typeof BaseMenu.Positioner>["collisionAvoidance"];
  /** Where the popup mounts (default: the body). A flyout may mount inside its parent menu, so it stays in its subtree. */
  container?: ComponentProps<typeof BaseMenu.Portal>["container"];
  /** Added to the popup (a width, a max height). */
  className?: string;
  children: ReactNode;
}

/** The floating part of a menu: portal, positioner (above dialogs) and popup in one. */
function Content({ side, align, sideOffset = 4, alignOffset, collisionPadding, collisionAvoidance, anchor, container, className, children, ...popup }: MenuContentProps) {
  return (
    <BaseMenu.Portal container={container}>
      <BaseMenu.Positioner
        className="z-80"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
        anchor={anchor}
      >
        <BaseMenu.Popup className={cn(MENU_POPUP, className)} {...popup}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

interface MenuItemProps extends Omit<ComponentProps<typeof BaseMenu.Item>, "className"> {
  /** A destructive row (delete): red text. */
  danger?: boolean;
  className?: string;
}

function Item({ danger, className, ...props }: MenuItemProps) {
  return <BaseMenu.Item className={cn(MENU_ITEM, danger && "text-ui-danger", className)} {...props} />;
}

function SubmenuTrigger({ className, ...props }: Omit<ComponentProps<typeof BaseMenu.SubmenuTrigger>, "className"> & { className?: string }) {
  return <BaseMenu.SubmenuTrigger className={cn(MENU_ITEM, className)} {...props} />;
}

function Separator({ className, ...props }: Omit<ComponentProps<typeof BaseMenu.Separator>, "className"> & { className?: string }) {
  return <BaseMenu.Separator className={cn(MENU_SEPARATOR, className)} {...props} />;
}

/**
 * The dropdown menu of the chrome: Base UI's Menu with the chrome's look on the popup, rows and separators.
 * `<Menu.Root><Menu.Trigger/><Menu.Content><Menu.Item/>…</Menu.Content></Menu.Root>`; a flyout is
 * `Menu.SubmenuRoot` + `Menu.SubmenuTrigger` + `Menu.Content`. Arrow keys, Home / End, type-ahead and Escape come from Base UI.
 */
export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Content,
  Item,
  Separator,
  SubmenuRoot: BaseMenu.SubmenuRoot,
  SubmenuTrigger,
  Group: BaseMenu.Group,
  GroupLabel: BaseMenu.GroupLabel,
};
