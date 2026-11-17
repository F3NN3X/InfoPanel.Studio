/**
 * A card's actions in one list, read by both of its menus: the ⋯ button's and the right-click one, so they always
 * offer the same items in the same order (Screens' screen and saved cards, the InfoPanel home's profile cards).
 */
import { Fragment, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronRight, MoreHorizontal, type LucideIcon } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
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
  /** A disabled row's reason. */
  title?: string;
  /** Rows of a flyout beside this one ("Show on ▸"); the row itself then runs nothing. */
  submenu?: readonly CardAction[];
}

/** The right-click menu's rows: the same actions, the danger ones after a separator. */
export function contextEntries(actions: readonly CardAction[]): ContextMenuEntry[] {
  return actions.flatMap((a, i): ContextMenuEntry[] => {
    const row: ContextMenuEntry = { id: a.id, label: a.label, icon: <a.icon />, disabled: a.disabled, danger: a.danger, title: a.title, onSelect: a.run, submenu: a.submenu && contextEntries(a.submenu) };
    return a.danger && i > 0 && !actions[i - 1].danger ? ["separator", row] : [row];
  });
}

/**
 * A card's right-click menu: the same actions as its ⋯ menu. `onContextMenu` goes on the card (a name field keeps the
 * browser's own menu); `menu` goes inside it, and its clicks never reach the card.
 */
export function useCardContextMenu(actions: readonly CardAction[] | undefined): { onContextMenu?: (e: MouseEvent) => void; menu: ReactNode } {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (!actions) return { menu: null };
  return {
    onContextMenu: (e) => {
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    },
    // The menu is portalled, but its clicks still bubble through React: they must not reach the card.
    menu: at && (
      <span className="contents" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        <ContextMenu x={at.x} y={at.y} entries={contextEntries(actions)} onClose={() => setAt(null)} />
      </span>
    ),
  };
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
        className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-3 hover:bg-ui-active hover:text-ui-1 data-popup-open:bg-ui-active data-popup-open:text-ui-1", FOCUS_RING)}
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
                {a.submenu ? (
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger className={ITEM} disabled={a.disabled} title={a.title}>
                      <ActionLabel action={a} />
                      <ChevronRight className="h-3 w-3 text-ui-4" />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner className="z-[80]" sideOffset={4} alignOffset={-4}>
                        <Menu.Popup className={POPUP} onClick={(e) => e.stopPropagation()}>
                          {a.submenu.map((sub) => (
                            <Menu.Item key={sub.id} className={ITEM} disabled={sub.disabled} title={sub.title} onClick={sub.run}>
                              <ActionLabel action={sub} />
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                ) : (
                  <Menu.Item
                    className={cn(ITEM, a.danger && "text-ui-danger data-disabled:text-ui-hint")}
                    disabled={a.disabled}
                    title={a.title}
                    onClick={() => {
                      toField.current = Boolean(a.focusesField);
                      a.run();
                    }}
                  >
                    <ActionLabel action={a} />
                  </Menu.Item>
                )}
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** A menu row's icon and words. */
function ActionLabel({ action: a }: { action: CardAction }) {
  return (
    <span className="flex items-center gap-2">
      <a.icon className={cn("h-3.5 w-3.5", !a.danger && "text-ui-3")} />
      {a.label}
    </span>
  );
}
