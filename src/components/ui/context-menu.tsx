import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Menu } from "./menu";

export type ContextMenuEntry =
  | {
      id: string;
      label: string;
      icon?: ReactNode;
      /** Shortcut hint, shown in mono on the right. */
      hint?: string;
      /** Red row (delete). */
      danger?: boolean;
      disabled?: boolean;
      /** Tooltip (a disabled row's reason); on the row's wrapper too, as a disabled button may not show one. */
      title?: string;
      /** Rows of a flyout opened beside this one (then the row itself picks nothing). */
      submenu?: ContextMenuEntry[];
      onSelect?: () => void;
    }
  | "separator";

interface ContextMenuProps {
  /** Viewport position of the pointer that opened the menu. */
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
  /** The menu's width in px (default 220; the layer menu's is 230). */
  width?: number;
  testId?: string;
}

/** The default width (px) of a right-click menu. */
const DEFAULT_WIDTH = 220;
const ROW = "justify-start gap-2 text-left";
const ICON =
  "flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ui-hint group-data-highlighted:[&>svg]:text-ui-2";

/** The rows of one level; a row with a flyout opens it beside itself. */
function Rows({ entries, width, onPick }: { entries: ContextMenuEntry[]; width: number; onPick: (e: Exclude<ContextMenuEntry, "separator">) => void }) {
  return entries.map((e, i) => {
    if (e === "separator") return <Menu.Separator key={i} className="mx-0.5" />;
    const label = (
      <>
        <span className={ICON}>{e.icon}</span>
        <span className="min-w-0 flex-1 truncate">{e.label}</span>
        {e.hint && <span className="font-ui-mono text-micro text-ui-hint group-data-highlighted:text-ui-2">{e.hint}</span>}
      </>
    );
    if (e.submenu)
      return (
        <Menu.SubmenuRoot key={e.id}>
          <Menu.SubmenuTrigger className={ROW} disabled={e.disabled} title={e.title}>
            {label}
            <ChevronRight className="h-3 w-3 shrink-0 text-ui-4" />
          </Menu.SubmenuTrigger>
          {/* A long flyout ("Move to" over many containers) scrolls rather than run off the screen. */}
          <Menu.Content alignOffset={-4} collisionPadding={8} className="max-h-[min(20rem,60vh)] overflow-y-auto" style={{ width }}>
            <Rows entries={e.submenu} width={width} onPick={onPick} />
          </Menu.Content>
        </Menu.SubmenuRoot>
      );
    return (
      <Menu.Item key={e.id} className={ROW} danger={e.danger} disabled={e.disabled} title={e.title} closeOnClick={false} onClick={() => onPick(e)}>
        {label}
      </Menu.Item>
    );
  });
}

/**
 * A right-click menu on Base UI's Menu, anchored to the pointer and kept inside the viewport; closes on pick, Esc,
 * outside click or window blur. Keyboard: focus lands on the first enabled item, arrows / Home / End move between
 * items, Enter / Space pick, Right opens a flyout and Left closes it, and focus returns to where it was when the menu closes.
 */
export function ContextMenu({ x, y, entries, onClose, width = DEFAULT_WIDTH, testId }: ContextMenuProps) {
  const popup = useRef<HTMLDivElement>(null);
  const anchor = { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };

  useEffect(() => {
    window.addEventListener("blur", onClose);
    return () => window.removeEventListener("blur", onClose);
  }, [onClose]);

  const pick = (e: Exclude<ContextMenuEntry, "separator">) => {
    onClose();
    e.onSelect?.();
  };

  return (
    <Menu.Root open modal={false} onOpenChange={(open) => !open && onClose()}>
      <Menu.Content
        ref={(el) => {
          popup.current = el;
          el?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus();
        }}
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={0}
        collisionPadding={8}
        data-testid={testId}
        style={{ width }}
        className="p-1"
        onContextMenu={(e) => e.preventDefault()}
        // Only when focus is still nowhere (a pick may have opened a dialog that took it).
        finalFocus={() => {
          const at = document.activeElement;
          return !at || at === document.body || !!popup.current?.contains(at);
        }}
      >
        <Rows entries={entries} width={width} onPick={pick} />
      </Menu.Content>
    </Menu.Root>
  );
}
