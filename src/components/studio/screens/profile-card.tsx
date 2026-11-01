import { useState, type ReactNode } from "react";
import { ContextMenu } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { CardMenu, contextEntries, type CardAction } from "./card-actions";

/** The strip a profile is drawn in: its own shape, within 3:1 to 1:1. */
export const aspectOf = (width: number, height: number): number => Math.min(3, Math.max(1, width && height ? width / height : 1.6));

/** A small pill on a card: "Dashboard", "Default", "Active on 2 kiosks". */
export function Badge({ children, tone = "plain", title }: { children: ReactNode; tone?: "plain" | "accent" | "live"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] items-center whitespace-nowrap rounded px-1.5 text-micro leading-none",
        tone === "plain" && "bg-ui-hover text-ui-3",
        tone === "accent" && "bg-ui-accent-soft text-ui-accent-text",
        tone === "live" && "bg-ui-success/15 text-ui-success"
      )}
    >
      {children}
    </span>
  );
}

export interface ProfileCardProps {
  name: string;
  /** Replaces the name while it is being renamed. */
  nameField?: ReactNode;
  badges?: ReactNode;
  /** A quiet line under the name ("Main › Page 1", "Opens as a new screen"). */
  detail?: string;
  /** The size line ("1920×1080 · 3 pages"). */
  meta: string;
  aspect: number;
  thumb: ReactNode;
  /** A click on the card (the thumbnail button for the keyboard). */
  onClick: () => void;
  /** The thumbnail button's name: "Open Desk". */
  label: string;
  selected?: boolean;
  /** The card's actions: its ⋯ menu and its right-click menu, named `actionsLabel` ("Screen actions"). */
  actions?: readonly CardAction[];
  actionsLabel?: string;
  /** The footer's buttons. */
  children?: ReactNode;
}

/**
 * One screen or profile as a card: a thumbnail in its own shape, the name with its badges, a size line and a
 * footer of actions. Shared by the Screens manager and the InfoPanel home, so both look and behave alike. A right-click
 * opens the same actions as the ⋯ menu.
 */
export function ProfileCard({ name, nameField, badges, detail, meta, aspect, thumb, onClick, label, selected, actions, actionsLabel = "Actions", children }: ProfileCardProps) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <li
      onClick={onClick}
      onContextMenu={
        actions
          ? (e) => {
              // The rename field keeps the browser's own menu.
              if (e.target instanceof HTMLInputElement) return;
              e.preventDefault();
              setMenuAt({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[10px] border bg-ui-panel transition-colors",
        selected ? "border-ui-1 ring-1 ring-ui-1" : "border-ui-default hover:border-ui-strong"
      )}
    >
      <button type="button" aria-label={label} className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-accent/60">
        <div className="w-full bg-s-well" style={{ aspectRatio: aspect }}>
          {thumb}
        </div>
      </button>
      <div className="flex min-w-0 flex-col gap-1 px-3 pb-2 pt-2">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1 text-[13px] font-medium text-ui-1">{nameField ?? <span className="block truncate">{name}</span>}</div>
          {actions && (
            <div onClick={(e) => e.stopPropagation()}>
              <CardMenu actions={actions} label={actionsLabel} />
            </div>
          )}
        </div>
        {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
        {detail && <span className="truncate text-[11.5px] text-ui-4">{detail}</span>}
        <span className="truncate font-ui-mono text-[11px] text-ui-3">{meta}</span>
      </div>
      {children && (
        <div onClick={(e) => e.stopPropagation()} className="mt-auto flex items-center gap-0.5 border-t border-ui-subtle px-1.5 py-1">
          {children}
        </div>
      )}
      {actions && menuAt && (
        // The menu is portalled, but its clicks still bubble here through React: they must not reach the card.
        <span className="contents" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <ContextMenu x={menuAt.x} y={menuAt.y} entries={contextEntries(actions)} onClose={() => setMenuAt(null)} />
        </span>
      )}
    </li>
  );
}

/** A footer button of a card. */
export const CARD_BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] text-ui-2 outline-none hover:bg-ui-hover hover:text-ui-1 focus-visible:ring-2 focus-visible:ring-ui-accent/60 disabled:pointer-events-none disabled:text-ui-hint";
