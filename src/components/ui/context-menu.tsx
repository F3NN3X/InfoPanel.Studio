import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { clampMenuPosition, menuHeight, MENU_WIDTH } from "./context-menu-position";

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

/**
 * A 220 px right-click menu, clamped to the viewport; closes on pick, Esc or
 * outside click. Keyboard: focus lands on the first enabled item, arrows /
 * Home / End move between items, Enter / Space pick, and focus returns to
 * where it was when the menu closes.
 */
export function ContextMenu({ x, y, entries, onClose, width = MENU_WIDTH, testId }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** The row whose flyout is open. */
  const [openSub, setOpenSub] = useState<string | null>(null);

  // Focus in on open, back out on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      // Only when focus is still nowhere (a pick may have opened a dialog that took it).
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus();
    };
  }, []);

  /** Arrow / Home / End between the enabled items (wrapping); Tab leaves the menu. */
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") return onClose();
    if (e.key === "ArrowLeft" && openSub !== null) {
      e.preventDefault();
      ref.current?.querySelector<HTMLElement>(`[data-sub-trigger="${CSS.escape(openSub)}"]`)?.focus();
      return setOpenSub(null);
    }
    if (e.key === "ArrowRight" && e.target instanceof HTMLElement && e.target.dataset.subTrigger !== undefined) {
      e.preventDefault();
      return e.target.click();
    }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown" ? (at + 1) % items.length
      : e.key === "ArrowUp" ? (at <= 0 ? items.length - 1 : at - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? items.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const separators = entries.filter((e) => e === "separator").length;
  const { left, top } = clampMenuPosition(
    x,
    y,
    { width, height: menuHeight(entries.length - separators, separators) },
    { width: window.innerWidth, height: window.innerHeight }
  );

  /** The rows of one level; a row with a flyout opens it beside itself. */
  const rows = (list: ContextMenuEntry[], level: number) =>
    list.map((e, i) =>
      e === "separator" ? (
        <div key={i} role="separator" className="mx-0.5 my-1 h-px bg-[#26262c]" />
      ) : (
        <div key={e.id} className="relative" title={e.title} onMouseEnter={() => level === 0 && setOpenSub(e.submenu && !e.disabled ? e.id : null)}>
          <button
            type="button"
            role="menuitem"
            disabled={e.disabled}
            title={e.title}
            data-sub-trigger={e.submenu ? e.id : undefined}
            aria-haspopup={e.submenu ? "menu" : undefined}
            aria-expanded={e.submenu ? openSub === e.id : undefined}
            onClick={() => {
              if (e.submenu) {
                setOpenSub(e.id);
                // The flyout mounts first; then focus lands on its first row.
                return void requestAnimationFrame(() =>
                  ref.current?.querySelector<HTMLElement>(`[data-sub="${CSS.escape(e.id)}"] [role="menuitem"]:not(:disabled)`)?.focus()
                );
              }
              onClose();
              e.onSelect?.();
            }}
            className={cn(
              "flex h-[29px] w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none focus-visible:bg-ui-active focus-visible:shadow-[inset_2px_0_0_var(--ui-accent)] disabled:text-[#55555e]",
              e.danger ? "text-ui-danger hover:bg-ui-danger/15" : "text-[#e4e4e8] hover:bg-ui-active disabled:hover:bg-transparent"
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-[13px] [&>svg]:w-[13px]">
              {e.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            {e.hint && <span className="font-ui-mono text-micro text-ui-hint">{e.hint}</span>}
            {e.submenu && <ChevronRight className="h-3 w-3 shrink-0 text-ui-4" />}
          </button>
          {e.submenu && openSub === e.id && (
            <div
              role="menu"
              data-sub={e.id}
              style={{ width }}
              className={cn(
                "absolute top-0 z-10 rounded-[9px] border border-ui-menu bg-ui-raised p-1 shadow-ui-menu",
                // Flip to the left when the flyout would leave the viewport.
                left + width * 2 + 8 > window.innerWidth ? "right-full mr-1" : "left-full ml-1"
              )}
            >
              {rows(e.submenu, level + 1)}
            </div>
          )}
        </div>
      )
    );

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid={testId}
      style={{ left, top, width }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onMenuKey}
      className="fixed z-[90] rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui shadow-ui-menu"
    >
      {rows(entries, 0)}
    </div>,
    document.body
  );
}
