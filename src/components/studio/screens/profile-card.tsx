import type { CSSProperties, ReactNode } from "react";
import { FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CardMenu, useCardContextMenu, type CardAction } from "./card-actions";

/** The strip a profile is drawn in: its own shape, within 3:1 to 1:1. */
export const aspectOf = (width: number, height: number): number => Math.min(3, Math.max(1, width && height ? width / height : 1.6));

/** The preview well's height (a card's 150 px less its padding) and the box a screen's preview takes in it: its own shape, as wide as fits. */
const WELL_HEIGHT = 122;
export const previewBox = (aspect: number): CSSProperties => ({ aspectRatio: aspect, width: `min(100%, ${Math.round(WELL_HEIGHT * aspect)}px)` });

/** A small pill on a card: "Dashboard", "Default", "Active on 2 kiosks". */
export function Badge({ children, tone = "plain", title }: { children: ReactNode; tone?: "plain" | "accent" | "live"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-4.5 items-center whitespace-nowrap rounded px-1.5 text-micro leading-none",
        tone === "plain" && "bg-ui-hover text-ui-3",
        tone === "accent" && "bg-ui-accent-soft text-ui-accent-text",
        tone === "live" && "bg-ui-ok/12 text-ui-ok"
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
  /** Over the thumbnail's corner: "On 2 displays". */
  chip?: ReactNode;
  /** Under the thumbnail: a screen's page strip. */
  strip?: ReactNode;
  /** A click on the card (the thumbnail button for the keyboard). */
  onClick: () => void;
  /** The thumbnail button's name: "Open Desk". */
  label: string;
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
export function ProfileCard({ name, nameField, badges, detail, meta, aspect, thumb, chip, strip, onClick, label, actions, actionsLabel = "Actions", children }: ProfileCardProps) {
  const context = useCardContextMenu(actions);
  return (
    <li
      onClick={onClick}
      onContextMenu={context.onContextMenu}
      className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-ui-lg border border-ui-default bg-ui-panel transition-colors duration-(--ui-dur-fast) ease-ui hover:border-ui-hover-edge"
    >
      <div className="relative h-37.5 border-b border-ui-subtle bg-ui-chrome">
        <button type="button" aria-label={label} className={cn("grid h-full w-full place-items-center p-3.5", FOCUS_RING, "focus-visible:-outline-offset-2")}>
          <div className="overflow-hidden rounded-ui-sm border border-ui-strong bg-s-well" style={previewBox(aspect)}>
            {thumb}
          </div>
        </button>
        {chip && <div className="pointer-events-none absolute left-2.5 top-2.5 z-10">{chip}</div>}
        {strip}
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-3 pb-2 pt-2">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1 text-body font-medium text-ui-1">{nameField ?? <span className="block truncate">{name}</span>}</div>
          {actions && (
            <div onClick={(e) => e.stopPropagation()}>
              <CardMenu actions={actions} label={actionsLabel} />
            </div>
          )}
        </div>
        {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
        {detail && <span className="truncate text-micro text-ui-4">{detail}</span>}
        <span className="block truncate font-ui-mono text-micro text-ui-3" title={meta}>
          {meta}
        </span>
      </div>
      {children && (
        <div onClick={(e) => e.stopPropagation()} className="mt-auto flex items-center gap-0.5 border-t border-ui-subtle px-1.5 py-1">
          {children}
        </div>
      )}
      {context.menu}
    </li>
  );
}

/** A footer button of a card. */
export const CARD_BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-7 px-2 text-caption text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent disabled:pointer-events-none disabled:text-ui-hint";
