import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_CARD_HELP } from "@/help/context";
import { InheritChip, InheritLockNote } from "./inherit-chip";
import { sectionIconById } from "./inspector/section-icons";
import type { CardInherit, PageCardOption, ThemeCard } from "./theme-cards";

const LINK = "rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** Whether a key press is the user typing (a field keeps its ⌫). */
const typing = (e: KeyboardEvent<HTMLElement>): boolean =>
  e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** A small overline inside a card ("Color tokens", "Status & series colors"). */
export function CardLabel({ children }: { children: ReactNode }) {
  return <h4 className="px-4 pb-0.5 pt-2 font-ui-mono text-[10px] uppercase tracking-[0.06em] text-[#7c7c86] first:pt-0">{children}</h4>;
}

/** The header's lock toggle at Screen scope (SPEC §7.2). */
function LockToggle({ on, screen, onToggle }: { on: boolean; screen: string; onToggle: () => void }) {
  const Icon = on ? Lock : LockOpen;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={on ? `Forced on every page and widget of ${screen} — click to unlock` : `Force this section on every page and widget of ${screen}`}
      className={cn(
        "flex h-5 shrink-0 items-center gap-[3px] rounded-[5px] border px-1.5 text-[10.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        on ? "border-ui-warning/55 bg-ui-warning/12 text-[oklch(0.88_0.10_85)]" : "border-ui-strong text-[#8a8a94] hover:text-ui-1"
      )}
    >
      <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} aria-hidden />
      {on ? "Locked" : "Lock"}
    </button>
  );
}

interface ThemeSectionCardProps {
  card: ThemeCard;
  inherit: CardInherit;
  /** The chip's menu: the parent's value as text. */
  parentText?: string;
  open: boolean;
  onToggle: () => void;
  /** Own values at this level ("N changed", on the action line: the 360 px header has no room beside the lock and chip). */
  changed: number;
  /** Screen scope, lockable cards: the lock and its screen's name. */
  lock?: { on: boolean; screen: string; onToggle: () => void };
  /** Widgets below with a custom section of the card ("N widgets override this"). */
  overrides: number;
  /** The scope can customise it here (a screen: Customise here). */
  onCustomise?: () => void;
  onReset: () => void;
  /** Edit ‹level› ↗: the level the chip names. */
  onJump?: () => void;
  /** Briefly outline it (a link just opened it). */
  flash?: boolean;
  children: ReactNode;
}

/**
 * One of Theme's section cards (SPEC §4.3, §7.2): the step number, name, the lock (Screen scope), the inheritance
 * chip and the chevron; open, its rows, then the action line (Reset to inherited · Customise here · N changed ·
 * N widgets override this). ⌫ resets it while it holds focus (not in a field).
 */
export function ThemeSectionCard({
  card,
  inherit,
  parentText,
  open,
  onToggle,
  changed,
  lock,
  overrides,
  onCustomise,
  onReset,
  onJump,
  flash = false,
  children,
}: ThemeSectionCardProps) {
  const custom = inherit.state === "custom";
  return (
    <section
      data-nav-section={card.id}
      data-help-section={THEME_CARD_HELP}
      onKeyDown={(e) => {
        if (custom && (e.key === "Backspace" || e.key === "Delete") && !typing(e) && !e.defaultPrevented) {
          e.preventDefault();
          onReset();
        }
      }}
      className={cn("border-t border-ui-subtle transition-shadow duration-500", flash && "shadow-[inset_0_0_0_1.5px_var(--ui-accent)]")}
    >
      <header className="flex min-h-[38px] items-center gap-2 py-[9px] pl-3.5 pr-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="w-3.5 shrink-0 font-ui-mono text-[10px] text-ui-5">{card.step}</span>
          <span className="truncate text-[12.5px] font-medium">{card.title}</span>
        </button>
        {lock && <LockToggle on={lock.on} screen={lock.screen} onToggle={lock.onToggle} />}
        <InheritChip
          state={inherit.state}
          from={inherit.from}
          fromName={inherit.fromName}
          parentText={parentText}
          onReset={onReset}
          onCustomise={onCustomise}
          onJump={onJump}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onToggle}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[#7c7c86] hover:bg-ui-hover"
        >
          <ChevronDown className={cn("h-[17px] w-[17px] transition-transform duration-150", open && "rotate-180")} />
        </button>
      </header>
      {open && (
        <div className="flex flex-col gap-1 pb-3">
          {inherit.keptOverride && (
            <div className="px-3.5">
              <InheritLockNote holder="page" section={card.title} />
            </div>
          )}
          {children}
          <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5 whitespace-nowrap px-3.5 text-[11.5px] leading-snug">
            {inherit.state === "custom" && (
              <button type="button" onClick={onReset} className={LINK}>
                Reset to inherited
              </button>
            )}
            {inherit.state === "inherited" && onCustomise && (
              <button type="button" onClick={onCustomise} className={LINK}>
                Customise here
              </button>
            )}
            {changed > 0 && <span className="text-[#8a8a94]">{changed} changed</span>}
            {overrides > 0 && (
              <span className="text-ui-3">
                {overrides} {overrides === 1 ? "widget overrides this" : "widgets override this"}
                {lock?.on && " — ignored while locked"}
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Page scope's "Customise a section for this page" (SPEC §7.2): one button per section the page follows, disabled
 * with its reason where a page can't hold it.
 */
export function CustomiseList({ options, screen, onCustomise }: { options: readonly PageCardOption[]; screen: string; onCustomise: (card: ThemeCard) => void }) {
  return (
    <section data-nav-section="customise" className="flex flex-col gap-2 border-t border-ui-subtle px-3.5 py-3">
      <h3 className="text-[12px] font-medium text-ui-1">Customise a section for this page</h3>
      <p className="text-[11px] text-[#7c7c86]">The other sections follow {screen}.</p>
      {options.map(({ card, disabled, note }) => {
        const Icon = sectionIconById(card.id);
        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled !== undefined}
            onClick={() => onCustomise(card)}
            className="flex h-[30px] items-center gap-2 rounded-[7px] border border-ui-default bg-ui-tile px-2.5 text-left text-[12px] text-ui-1 transition-colors enabled:hover:bg-ui-hover disabled:cursor-not-allowed disabled:text-ui-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
          >
            <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">{card.title}</span>
            {(disabled ?? note) && <span className="shrink-0 text-[10.5px] text-[#7c7c86]">{disabled ?? note}</span>}
          </button>
        );
      })}
    </section>
  );
}

/** The scope help line above the list (SPEC §7.2, verbatim per scope). */
export function scopeHelp(level: "all" | "screen" | "page", screen: string, page: string): string {
  if (level === "all") return "The base look for every screen. Screens and pages only store what they change.";
  if (level === "screen") return `What ${screen} changes from All screens. Lock a section to force it on every page and widget of this screen.`;
  return `${page} only stores the sections it customises. Everything else follows ${screen}.`;
}
