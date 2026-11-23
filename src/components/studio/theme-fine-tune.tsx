import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Lock, LockOpen } from "lucide-react";
import { THEME_CARD_HELP } from "@/help/context";
import { cn } from "@/lib/utils";
import { InheritChip, InheritLockNote, LOCKED } from "./inherit-chip";
import type { ThemeCard } from "./theme-cards";
import { changedHere, type FineTuneChip } from "./theme-fine-tune-model";

const LINK = "rounded-sm text-ui-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** Whether a key press is the user typing (a field keeps its ⌫). */
const typing = (e: KeyboardEvent<HTMLElement>): boolean =>
  e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** A small mono overline inside a section ("WIDGET COLORS", "STATUS"). */
export function RowsLabel({ children }: { children: ReactNode }) {
  return <h4 className="px-5 pb-0.5 pt-2 text-caption font-medium text-ui-3 first:pt-0">{children}</h4>;
}

/** A section's lock at Screen level (SPEC §4.6): "Lock" off, the Locked colors on. */
function LockToggle({ on, screen, onToggle }: { on: boolean; screen: string; onToggle: () => void }) {
  const Icon = on ? Lock : LockOpen;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={`Lock forces this section on every page and widget of ${screen}`}
      aria-label={on ? undefined : "Lock"}
      className={cn(
        "flex shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        on
          ? cn("h-5 gap-0.75 rounded-full border px-2 text-micro font-medium", LOCKED)
          : "h-6 w-6 rounded-md text-ui-hint opacity-60 hover:bg-ui-hover hover:text-ui-1 hover:opacity-100 focus-visible:opacity-100 group-hover/row:opacity-100"
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {on && "Locked"}
    </button>
  );
}

interface FineTuneRowProps {
  card: ThemeCard;
  chip: FineTuneChip;
  /** One line of what the section holds ("Zinc · accent #38BDF8"). */
  summary: string;
  /** The chip's menu: the parent's value as text. */
  parentText?: string;
  open: boolean;
  onToggle: () => void;
  /** Screen level, lockable sections: the lock and its screen's name. */
  lock?: { on: boolean; screen: string; onToggle: () => void };
  /** Locked, but the page keeps its own values for it. */
  keptOverride: boolean;
  /** Widgets below with their own values for it ("1 widget differs"). */
  overrides: number;
  /** How many values the level holds of its own in it ("1 changed"). */
  changedCount?: number;
  /** The help text under the rows. */
  help?: string;
  /** Change here (a page stops following); none where it can't (a screen, the top level). */
  onChange?: () => void;
  onReset: () => void;
  /** Edit ‹level› ↗: the level the chip names. */
  onJump?: () => void;
  /** Briefly outline it (a link just opened it). */
  flash?: boolean;
  children: ReactNode;
}

/**
 * One fine-tune section (handoff SPEC §4.3.2): its name and one-line summary, the lock (Screen level), the chip and
 * the caret; open, its rows, the help text, then Reset to inherited or Change here and how many widgets differ.
 * ⌫ resets it while it holds focus (not in a field).
 */
export function FineTuneRow({ card, chip, summary, parentText, open, onToggle, lock, keptOverride, overrides, changedCount, help, onChange, onReset, onJump, flash = false, children }: FineTuneRowProps) {
  const changed = changedHere(chip);
  return (
    <section
      data-nav-section={card.id}
      data-help-section={THEME_CARD_HELP}
      onKeyDown={(e) => {
        if (changed && (e.key === "Backspace" || e.key === "Delete") && !typing(e) && !e.defaultPrevented) {
          e.preventDefault();
          onReset();
        }
      }}
      className={cn("border-t border-ui-raised transition-shadow duration-500", flash && "shadow-[inset_0_0_0_1.5px_var(--ui-accent)]")}
    >
      <header className="group/row flex items-center gap-2 px-5 py-2.5">
        <InheritChip dot state={chip.state} from={chip.from} fromName={chip.fromName} parentText={parentText} onReset={onReset} onCustomise={onChange} onJump={onJump} />
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col items-start rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="flex items-baseline gap-2 text-body font-medium text-ui-1">
            {card.title}
            {changed && <span className="text-caption font-normal text-ui-accent-text">{Math.max(1, changedCount ?? 0)} changed</span>}
          </span>
          <span className="w-full truncate text-caption text-ui-3">{summary}</span>
        </button>
        {lock && <LockToggle on={lock.on} screen={lock.screen} onToggle={lock.onToggle} />}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onToggle}
          className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-ui-hint hover:bg-ui-hover"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-180")} />
        </button>
      </header>
      {open && (
        <div className="flex flex-col gap-1 pb-3">
          {keptOverride && (
            <div className="px-5">
              <InheritLockNote holder="page" section={card.title} />
            </div>
          )}
          {children}
          {help && <p className="mt-1 px-5 text-caption leading-snug text-ui-3">{help}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5 whitespace-nowrap px-5 text-caption leading-snug">
            {changed && (
              <button type="button" onClick={onReset} className={LINK}>
                Reset to inherited
              </button>
            )}
            {!changed && onChange && (
              <button type="button" onClick={onChange} className={LINK}>
                Change here
              </button>
            )}
            {overrides > 0 && (
              <span className="text-ui-hint">
                {overrides} {overrides === 1 ? "widget differs" : "widgets differ"}
                {lock?.on && " — ignored while locked"}
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/** The fine-tune header: its name and the legend's two dots (what the level above gives, and what is set here). */
export function FineTuneHeader({ heading, from }: { heading: string; from: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-ui-subtle px-5 pb-1.5 pt-4">
      <h3 className="flex-1 text-caption font-medium text-ui-3">{heading}</h3>
      <span className="flex items-center gap-1.5 text-caption text-ui-3">
        <span className="h-1.75 w-1.75 rounded-full border border-ui-hint" aria-hidden />
        From {from}
      </span>
      <span className="flex items-center gap-1.5 text-caption text-ui-3">
        <span className="h-1.75 w-1.75 rounded-full bg-ui-accent" aria-hidden />
        Set here
      </span>
    </div>
  );
}
