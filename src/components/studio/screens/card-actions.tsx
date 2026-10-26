/**
 * A card's actions in one list, read by both of its menus: the ⋯ button's and the right-click one, so they always
 * offer the same items in the same order (Screens' screen and saved cards, the InfoPanel home's profile cards).
 */
import { Fragment, useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ITEM, POPUP, SEPARATOR } from "../menu-styles";

export interface CardAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  /** Red, after a separator (Delete, Remove). */
  danger?: boolean;
  /** It hands the cursor to the card's name field (Rename): the ⋯ menu must not take it back on close. */
  focusesField?: boolean;
}

/** The right-click menu's rows: the same actions, the danger ones after a separator. */
export function contextEntries(actions: readonly CardAction[]): ContextMenuEntry[] {
  return actions.flatMap((a, i): ContextMenuEntry[] => {
    const row: ContextMenuEntry = { id: a.id, label: a.label, icon: <a.icon />, disabled: a.disabled, danger: a.danger, onSelect: a.run };
    return a.danger && i > 0 && !actions[i - 1].danger ? ["separator", row] : [row];
  });
}

/** The ⋯ button and its menu. */
export function CardMenu({ actions, label }: { actions: readonly CardAction[]; label: string }) {
  // Rename hands the cursor to the card's name field: the menu must not take it back.
  const toField = useRef(false);
  return (
    <Menu.Root>
      <Menu.Trigger
        title={label}
        aria-label={label}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-active hover:text-ui-1 data-popup-open:bg-ui-active data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup
            className={POPUP}
            onClick={(e) => e.stopPropagation()}
            finalFocus={() => {
              const skip = toField.current;
              toField.current = false;
              return !skip;
            }}
          >
            {actions.map((a, i) => (
              <Fragment key={a.id}>
                {a.danger && i > 0 && !actions[i - 1].danger && <Menu.Separator className={SEPARATOR} />}
                <Menu.Item
                  className={cn(ITEM, a.danger && "text-ui-danger data-disabled:text-ui-5")}
                  disabled={a.disabled}
                  onClick={() => {
                    toField.current = Boolean(a.focusesField);
                    a.run();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <a.icon className={cn("h-3.5 w-3.5", !a.danger && "text-ui-3")} />
                    {a.label}
                  </span>
                </Menu.Item>
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
