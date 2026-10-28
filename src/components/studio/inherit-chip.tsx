import { Menu } from "@base-ui/react/menu";
import { Box, ChevronRight, Link2, Lock, Palette, Pencil, type LucideIcon } from "lucide-react";
import { LEVEL_LABELS, type InheritLevel, type InheritState } from "@/lib/inheritance";
import { cn } from "@/lib/utils";
import { ITEM, POPUP, SEPARATOR } from "./menu-styles";

/** Where "Make this the theme for… ▸" writes a widget's custom sections. */
export type MakeThemeTarget = "all" | "screen" | "page";

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
  className?: string;
}

interface ChipLook {
  icon: LucideIcon;
  text: (level: string) => string;
  tip: (name: string) => string;
  className: string;
}

/** The handoff's chip colors (SPEC §4.6): changed here, inherited (dashed), locked. */
const CHANGED = "border-[#3b82f6] bg-[#0b1530] text-[#93c5fd]";
const INHERITED = "border-dashed border-[#3f3f46] text-[#a1a1aa]";
export const LOCKED = "border-[#b45309] bg-[#2a1d05] text-[#fcd34d]";

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
    tip: () => "This is the base value everything below inherits.",
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
  { target: "all", label: "All screens" },
  { target: "screen", label: "This screen" },
  { target: "page", label: "This page" },
];

/** "Page · Gaming"; All screens has no other name. */
const levelWithName = (level: string, from: InheritLevel | undefined, name: string | undefined): string =>
  from && from !== "all" && name ? `${level} · ${name}` : level;

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
export function InheritChip({ state, from, fromName, parentText, onReset, onJump, onCustomise, onMakeTheme, className }: InheritChipProps) {
  const look = LOOK[state];
  const Icon = look.icon;
  const level = LEVEL_LABELS[from ?? "all"];
  const name = fromName ?? level;
  // A screen's chip names it ("From Desk bar"); a page or panel keeps its level.
  const shown = from === "screen" && fromName ? fromName : level;
  const source = levelWithName(level, from, fromName);
  const line = parentLine(state, parentText, source);
  return (
    <Menu.Root>
      <Menu.Trigger
        title={look.tip(name)}
        className={cn(
          "inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border pl-1.5 pr-2 font-ui text-[11px] font-medium leading-none transition-[filter] hover:brightness-[1.18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
          look.className,
          className
        )}
      >
        <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} aria-hidden />
        {look.text(shown)}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="start">
          <Menu.Popup className={cn(POPUP, "w-[220px] bg-[#1a1a1f] border-[#33333a]")}>
            {line && <div className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-ui-4">{line}</div>}
            {state === "custom" && (
              <>
                {line && <div className={SEPARATOR} />}
                {onReset && (
                  <Menu.Item className={ITEM} onClick={onReset}>
                    Reset to inherited <span className="text-[11px] text-ui-4">⌫</span>
                  </Menu.Item>
                )}
                {onJump && (
                  <Menu.Item className={ITEM} onClick={onJump}>
                    Edit {level} ↗
                  </Menu.Item>
                )}
                {onMakeTheme && (
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger className={ITEM}>
                      Make this the theme for… <ChevronRight className="h-3 w-3" />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner className="z-50" sideOffset={4} alignOffset={-4}>
                        <Menu.Popup className={POPUP}>
                          {MAKE_THEME.map((m) => (
                            <Menu.Item key={m.target} className={ITEM} onClick={() => onMakeTheme(m.target)}>
                              {m.label}
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                )}
              </>
            )}
            {state === "inherited" && (
              <>
                {line && <div className={SEPARATOR} />}
                {onCustomise && (
                  <Menu.Item className={ITEM} onClick={onCustomise}>
                    Change here
                  </Menu.Item>
                )}
                {onJump && (
                  <Menu.Item className={ITEM} onClick={onJump}>
                    Edit {level} ↗
                  </Menu.Item>
                )}
              </>
            )}
            {state === "theme" && <div className="px-2 py-1.5 text-[11px] leading-snug text-ui-4">{look.tip(name)}</div>}
            {state === "locked" && onJump && (
              <>
                {line && <div className={SEPARATOR} />}
                <Menu.Item className={ITEM} onClick={onJump}>
                  Edit lock in Theme ↗
                </Menu.Item>
              </>
            )}
            {state === "base" && onReset && (
              <>
                {line && <div className={SEPARATOR} />}
                <Menu.Item className={ITEM} onClick={onReset}>
                  Reset to built-in
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
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
    <p className="rounded-md bg-ui-warning/10 px-2 py-1.5 text-[11.5px] leading-snug text-[oklch(0.88_0.10_85)]">
      {keptOverrideText(holder, section)}
    </p>
  );
}
