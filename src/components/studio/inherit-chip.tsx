import { Menu } from "@/components/ui/menu";
import { Box, ChevronRight, Link2, Lock, Palette, Pencil, type LucideIcon } from "lucide-react";
import { LEVEL_LABELS, type InheritLevel, type InheritState } from "@/lib/inheritance";
import { cn } from "@/lib/utils";

/** Where "Make this the theme for… ▸" writes a widget's custom sections. */
export type MakeThemeTarget = "screen" | "page";

/** A chip's state: where the value comes from, or (Theme) from the theme applied at this level. */
export type ChipState = InheritState | "theme";

export interface InheritChipProps {
  state: ChipState;
  /** The level the chip names (inherited: the source; custom: Reset's target; locked: the lock's). */
  from?: InheritLevel;
  /** That level's own name ("Desk bar", "Gaming"): a screen's chip text, the tooltip and the menu. */
  fromName?: string;
  /** The parent's value as text, for the menu's first line ("#3D8BFF"). */
  parentText?: string;
  onReset?: () => void;
  onJump?: () => void;
  onCustomise?: () => void;
  /** Widget only: "Make this the theme for… ▸". */
  onMakeTheme?: (target: MakeThemeTarget) => void;
  /** A dot in place of the words (a section of the editor's inspector, rules §4): hollow follows, filled is set here. */
  dot?: boolean;
  className?: string;
}

interface ChipLook {
  icon: LucideIcon;
  text: (level: string) => string;
  tip: (name: string) => string;
  className: string;
}

/** The chip's looks (SPEC §4.6): changed here is the one that stands out (accent text and a dot), inherited is quiet text, locked keeps its amber pill. */
const CHANGED = "text-ui-accent-text";
const INHERITED = "text-ui-3";
export const LOCKED = "border-ui-lock-line bg-ui-warn-tint text-ui-lock-text";

/** Each state has its own icon, wording and border style, so color never carries it alone (SPEC §5). */
const LOOK: Readonly<Record<ChipState, ChipLook>> = {
  inherited: {
    icon: Link2,
    text: (level) => `From ${level}`,
    tip: (name) => `Inherited — the value comes from ${name}. Change it here to make it this level's own.`,
    className: INHERITED,
  },
  theme: {
    icon: Palette,
    text: () => "From theme",
    tip: () => "The value comes from the theme applied at this level.",
    className: INHERITED,
  },
  custom: {
    icon: Pencil,
    text: () => "Changed here",
    tip: (name) => `Changed at this level. Reset to go back to ${name}.`,
    className: CHANGED,
  },
  locked: {
    icon: Lock,
    text: () => "Locked",
    tip: (name) => `${name} forces this section everywhere below it. Edit or unlock it there.`,
    className: LOCKED,
  },
  base: {
    icon: Pencil,
    text: () => "Changed here",
    tip: () => "This is the screen's own value everything below inherits.",
    className: CHANGED,
  },
  builtin: {
    icon: Box,
    text: () => "Built-in",
    tip: () => "Not set anywhere yet — using the built-in default.",
    className: INHERITED,
  },
};

const MAKE_THEME: { target: MakeThemeTarget; label: string }[] = [
  { target: "screen", label: "This screen" },
  { target: "page", label: "This page" },
];

/** "Page · Gaming". */
const levelWithName = (level: string, from: InheritLevel | undefined, name: string | undefined): string =>
  from && name ? `${level} · ${name}` : level;

/** The menu's muted first line: the parent's value and where it comes from. */
function parentLine(state: ChipState, value: string | undefined, source: string): string | undefined {
  if (!value) return undefined;
  if (state === "base") return `Without it: ${value} (built-in)`;
  if (state === "builtin") return `${value} (built-in)`;
  return state === "custom" ? `Without it: ${value} from ${source}` : `${value} from ${source}`;
}

/**
 * The inheritance chip (SPEC §5): a 20 px pill saying where a section's
 * value comes from. Click, Enter or Space opens its menu: the parent's
 * value, then Reset / Customise / Edit ‹level› ↗ (and, on a widget,
 * Make this the theme for… ▸). Esc closes it. Pure: the caller resolves
 * the state (`useInheritance`) and acts.
 */
export function InheritChip({ state, from, fromName, parentText, onReset, onJump, onCustomise, onMakeTheme, dot = false, className }: InheritChipProps) {
  const look = LOOK[state];
  const Icon = look.icon;
  const level = LEVEL_LABELS[from ?? "screen"];
  const name = fromName ?? level;
  // A screen's chip names it ("From Desk bar"); a page or panel keeps its level.
  const shown = from === "screen" && fromName ? fromName : level;
  const source = levelWithName(level, from, fromName);
  const line = parentLine(state, parentText, source);
  const changedHere = state === "custom" || state === "base";
  const asDot = dot && state !== "locked";
  return (
    <Menu.Root>
      <Menu.Trigger
        title={look.tip(name)}
        aria-description={look.tip(name)}
        aria-label={asDot ? look.text(shown) : undefined}
        className={cn(
          "inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-transparent font-ui text-micro font-normal leading-none transition-[filter] hover:brightness-[1.3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
          asDot ? "w-5 justify-center" : "px-1",
          look.className,
          state === "locked" && "px-2 font-medium",
          className
        )}
      >
        {asDot ? (
          <span className={cn("h-1.75 w-1.75 shrink-0 rounded-full", changedHere ? "bg-ui-accent" : "border border-ui-source")} aria-hidden />
        ) : (
          <>
            {changedHere ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ui-blue" aria-hidden /> : <Icon className="h-3 w-3" strokeWidth={1.5} aria-hidden />}
            {look.text(shown)}
          </>
        )}
      </Menu.Trigger>
      <Menu.Content sideOffset={4} align="start" className="w-55 bg-ui-hover border-ui-menu">
        {line && <div className="px-2 pb-1 pt-1.5 text-micro leading-snug text-ui-4">{line}</div>}
        {state === "custom" && (
          <>
            {line && <div />}
            {onReset && (
              <Menu.Item onClick={onReset}>
                Reset to inherited <span className="text-micro text-ui-4">⌫</span>
              </Menu.Item>
            )}
            {onJump && (
              <Menu.Item onClick={onJump}>
                Edit {level} ↗
              </Menu.Item>
            )}
            {onMakeTheme && (
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger>
                  Make this the theme for… <ChevronRight className="h-3 w-3" />
                </Menu.SubmenuTrigger>
                <Menu.Content alignOffset={-4}>
                  {MAKE_THEME.map((m) => (
                    <Menu.Item key={m.target} onClick={() => onMakeTheme(m.target)}>
                      {m.label}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.SubmenuRoot>
            )}
          </>
        )}
        {state === "inherited" && (
          <>
            {line && <div />}
            {onCustomise && (
              <Menu.Item onClick={onCustomise}>
                Change here
              </Menu.Item>
            )}
            {onJump && (
              <Menu.Item onClick={onJump}>
                Edit {level} ↗
              </Menu.Item>
            )}
          </>
        )}
        {state === "theme" && <div className="px-2 py-1.5 text-micro leading-snug text-ui-4">{look.tip(name)}</div>}
        {state === "locked" && onJump && (
          <>
            {line && <div />}
            <Menu.Item onClick={onJump}>
              Edit lock in Theme ↗
            </Menu.Item>
          </>
        )}
        {state === "base" && onReset && (
          <>
            {line && <div />}
            <Menu.Item onClick={onReset}>
              Reset to built-in
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu.Root>
  );
}

/** The amber note's sentence for a kept override under a lock (SPEC §5). */
export const keptOverrideText = (holder: "widget" | "page", section: string): string =>
  `This ${holder} has its own ${section.toLowerCase()}; it returns if the Screen unlocks ${section}.`;

/**
 * Locked + a kept override: the section body's amber note. The page's or
 * widget's own values stay stored; they apply again when the screen unlocks.
 */
export function InheritLockNote({ holder, section }: { holder: "widget" | "page"; section: string }) {
  return (
    <p className="rounded-md bg-ui-warn/10 px-2 py-1.5 text-micro leading-snug text-ui-warn-text">
      {keptOverrideText(holder, section)}
    </p>
  );
}
