import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Lock, LockOpen } from "lucide-react";
import { THEME_CARD_HELP } from "@/help/context";
import { cn } from "@/lib/utils";
import { InheritChip, InheritLockNote, LOCKED } from "./inherit-chip";
import type { ThemeCard } from "./theme-cards";
import { changedHere, type FineTuneChip } from "./theme-fine-tune-model";

const LINK = "rounded-sm text-[#60a5fa] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** Whether a key press is the user typing (a field keeps its ⌫). */
const typing = (e: KeyboardEvent<HTMLElement>): boolean =>
  e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** A small mono overline inside a section ("WIDGET COLORS", "STATUS"). */
export function RowsLabel({ children }: { children: ReactNode }) {
  return <h4 className="px-4 pb-0.5 pt-2 font-ui-mono text-[10px] uppercase tracking-[0.08em] text-[#71717a] first:pt-0">{children}</h4>;
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
      className={cn(
        "flex h-5 shrink-0 items-center gap-[3px] rounded-full border px-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        on ? LOCKED : "border-[#27272a] text-[#71717a] hover:text-ui-1"
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {on ? "Locked" : "Lock"}
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
  /** The help text under the rows. */
  help?: string;
  /** Change here (a screen copies All screens', a page stops following); none where it can't. */
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
export function FineTuneRow({ card, chip, summary, parentText, open, onToggle, lock, keptOverride, overrides, help, onChange, onReset, onJump, flash = false, children }: FineTuneRowProps) {
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
      className={cn("border-t border-[#1a1a1d] transition-shadow duration-500", flash && "shadow-[inset_0_0_0_1.5px_var(--ui-accent)]")}
    >
      <header className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col items-start rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="truncate text-[14px] font-medium text-ui-1">{card.title}</span>
          <span className="w-full truncate text-[12px] text-[#71717a]">{summary}</span>
        </button>
        {lock && <LockToggle on={lock.on} screen={lock.screen} onToggle={lock.onToggle} />}
        <InheritChip state={chip.state} from={chip.from} fromName={chip.fromName} parentText={parentText} onReset={onReset} onCustomise={onChange} onJump={onJump} />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onToggle}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[#71717a] hover:bg-ui-hover"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-180")} />
        </button>
      </header>
      {open && (
        <div className="flex flex-col gap-1 pb-3">
          {keptOverride && (
            <div className="px-4">
              <InheritLockNote holder="page" section={card.title} />
            </div>
          )}
          {children}
          {help && <p className="mt-1 px-4 text-[12px] leading-snug text-[#a1a1aa]">{help}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5 whitespace-nowrap px-4 text-[12px] leading-snug">
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
              <span className="text-[#71717a]">
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

/** The fine-tune header (SPEC §4.3.2): the count, and the legend's two dots. */
export function FineTuneHeader({ heading }: { heading: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-ui-subtle px-4 pb-1.5 pt-4">
      <h3 className="flex-1 font-ui-mono text-[10px] uppercase tracking-[0.08em] text-[#71717a]">{heading}</h3>
      <span className="flex items-center gap-1 text-[11px] text-[#71717a]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" aria-hidden />
        changed here
      </span>
      <span className="flex items-center gap-1 text-[11px] text-[#71717a]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" aria-hidden />
        inherited
      </span>
    </div>
  );
}
