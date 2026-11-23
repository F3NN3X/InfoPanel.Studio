import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
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
function Rows({ entries, width, onPick, root }: { entries: ContextMenuEntry[]; width: number; onPick: (e: Exclude<ContextMenuEntry, "separator">) => void; root: RefObject<HTMLDivElement | null> }) {
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
          <Menu.SubmenuTrigger className={ROW} disabled={e.disabled} title={e.title} data-sub-trigger={e.id}>
            {label}
            <ChevronRight className="h-3 w-3 shrink-0 text-ui-4" />
          </Menu.SubmenuTrigger>
          {/* A long flyout ("Move to" over many containers) scrolls rather than run off the screen. It mounts inside the
              top menu, so the menu's subtree (and its test id) holds its rows, as before. */}
          <Menu.Content container={root} alignOffset={-4} collisionPadding={8} className="max-h-[min(20rem,60vh)] overflow-y-auto" style={{ width }} data-sub={e.id}>
            <Rows entries={e.submenu} width={width} onPick={onPick} root={root} />
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
  const popup = useRef<HTMLDivElement | null>(null);
  const primed = useRef(false);
  const anchor = useMemo(() => ({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }), [x, y]);

  useEffect(() => {
    window.addEventListener("blur", onClose);
    return () => window.removeEventListener("blur", onClose);
  }, [onClose]);

  // Focus goes back to where it was only if, once the menu is gone, it is nowhere. Checked at unmount, not when the
  // close starts: a pick may mount a field that takes focus (Rename) or open a dialog, and must keep it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus();
    };
  }, []);

  const pick = (e: Exclude<ContextMenuEntry, "separator">) => {
    onClose();
    e.onSelect?.();
  };

  return (
    <Menu.Root open modal={false} onOpenChange={(open) => !open && onClose()}>
      <Menu.Content
        ref={(el) => {
          popup.current = el;
          // Base UI highlights and focuses the first row on an ArrowDown, as a keyboard open does; once, as the menu mounts.
          if (el && !primed.current) {
            primed.current = true;
            // Not when the pointer got there first (a row highlighted or a flyout open).
            requestAnimationFrame(() => {
              if (!el.querySelector('[data-highlighted], [aria-expanded="true"]')) el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
            });
          }
        }}
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={0}
        collisionPadding={8}
        // Shifted up and left to stay inside the viewport, never flipped above the pointer (as the old clamp did).
        collisionAvoidance={{ side: "shift", align: "shift" }}
        data-testid={testId}
        style={{ width }}
        className="p-1"
        onContextMenu={(e) => e.preventDefault()}
        finalFocus={false}
      >
        <Rows entries={entries} width={width} onPick={pick} root={popup} />
      </Menu.Content>
    </Menu.Root>
  );
}
