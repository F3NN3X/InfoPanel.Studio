import type { KeyboardEvent } from "react";
import { LEVEL_LABELS, resolveInheritance, valueText, type Inheritance, type InheritScope } from "@/lib/inheritance";
import type { DashboardConfig } from "@/lib/layout";
import type { SectionId } from "@/lib/theme-model";
import { InheritChip, InheritLockNote, type MakeThemeTarget } from "./inherit-chip";
import { customiseInheritance, inheritanceJump, resetInheritance } from "./inheritance-actions";
import type { SectionInherit } from "./inspector/inspector-view";
import type { FollowMode } from "./inspector-model";
import type { InheritanceContext } from "./use-inheritance";

const LINK = "rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** Whether a key press is the user typing (a field keeps its ⌫). */
const typing = (e: KeyboardEvent<HTMLElement>): boolean =>
  e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** The state of a chip over several sections: locked beats custom beats inherited. */
function lead(states: Inheritance[]): Inheritance {
  return states.find((s) => s.state === "locked") ?? states.find((s) => s.state === "custom") ?? states[0];
}

/** The action line under a section's rows: Reset to inherited / Change here, and Edit ‹level› ↗ where there is a home. */
function ActionLine({ state, level, onReset, onCustomise, onJump }: { state: Inheritance["state"]; level: string; onReset: () => void; onCustomise: () => void; onJump?: () => void }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] leading-snug">
      {state === "custom" && (
        <button type="button" onClick={onReset} className={LINK}>
          Reset to inherited
        </button>
      )}
      {state === "inherited" && (
        <button type="button" onClick={onCustomise} className={LINK}>
          Change here
        </button>
      )}
      {onJump &&
        (state === "locked" ? (
          <button type="button" onClick={onJump} className={LINK}>
            Edit lock in Theme ↗
          </button>
        ) : (
          <button type="button" onClick={onJump} className={LINK}>
            Edit {level} ↗
          </button>
        ))}
    </p>
  );
}

/** A chip state as the widget's follow mode (inherited is following the theme; base and built-in are editable). */
const followMode = (state: Inheritance["state"]): FollowMode =>
  state === "inherited" ? "theme" : state === "locked" ? "locked" : "custom";

/** ⌫ on a custom section resets it, unless the user is typing. */
const resetKey = (state: Inheritance["state"], reset: () => void): SectionInherit["onKeyDown"] =>
  state === "custom"
    ? (e) => {
        if ((e.key === "Backspace" || e.key === "Delete") && !typing(e) && !e.defaultPrevented) {
          e.preventDefault();
          reset();
        }
      }
    : undefined;

interface SectionInheritInput {
  /** The theme sections the card covers (more than one in the merged Colors card). */
  sections: readonly SectionId[];
  /** The card's title (the kept-override note names it). */
  title: string;
  scope: InheritScope;
  /** More widgets edited with this one (several selected): Reset and Customise apply to them too; the chip shows `scope`. */
  alsoScopes?: readonly InheritScope[];
  ctx: InheritanceContext;
  /** "Make this the theme for… ▸" (widget zones). */
  onMakeTheme?: (sections: readonly SectionId[], target: MakeThemeTarget) => void;
}

/**
 * A section card's inheritance chip, action line, kept-override note and ⌫ reset (SPEC §4.3, §5), over
 * `lib/inheritance.ts`. Plain data, no hooks: the inspector calls it per section while rendering.
 */
export function sectionInherit({ sections, title, scope, alsoScopes = [], ctx, onMakeTheme }: SectionInheritInput): SectionInherit {
  const states = sections.map((sec) => resolveInheritance(ctx.config, sec, scope));
  const main = lead(states);
  const mainPath = sections[states.indexOf(main)];
  const level = LEVEL_LABELS[main.from ?? "all"];
  const targets = [scope, ...alsoScopes];
  const each = (write: (config: DashboardConfig, sec: SectionId, at: InheritScope) => DashboardConfig) => () =>
    ctx.setConfig((c) => targets.reduce((cfg, at) => sections.reduce((acc, sec) => write(acc, sec, at), cfg), c));
  const reset = each(resetInheritance);
  const customise = each(customiseInheritance);
  const jump = () => {
    const target = inheritanceJump(main, mainPath, scope);
    if (target) ctx.navigateTo(target);
  };
  const holder = scope.level === "page" ? "page" : "widget";
  return {
    chip: (
      <InheritChip
        state={main.state}
        from={main.from}
        fromName={main.fromName}
        parentText={valueText(mainPath, main.parentValue)}
        onReset={reset}
        onJump={jump}
        onCustomise={customise}
        onMakeTheme={onMakeTheme && ((target) => onMakeTheme(sections, target))}
        className="mx-0.5"
      />
    ),
    note: main.state === "locked" && states.some((s) => s.keptOverride) ? <InheritLockNote holder={holder} section={title} /> : undefined,
    actions: <ActionLine state={main.state} level={level} onReset={reset} onCustomise={customise} onJump={main.state === "locked" || main.from ? jump : undefined} />,
    onKeyDown: resetKey(main.state, reset),
    mode: followMode(main.state),
    onCustomise: customise,
  };
}

interface ItemInheritInput {
  mode: "theme" | "custom" | "locked";
  panelName: string;
  onCustomise: () => void;
  onUseTheme: () => void;
}

/**
 * A panel widget's chip: it follows its panel (From Panel), is custom (Reset gives it back) or is locked by the
 * screen. A panel widget has no level of its own in the theme, so there is no "Edit ‹level› ↗" beyond the lock's.
 */
export function itemSectionInherit({ mode, panelName, onCustomise, onUseTheme }: ItemInheritInput, onEditLock: () => void): SectionInherit {
  const state = mode === "theme" ? "inherited" : mode;
  const level = LEVEL_LABELS.panel;
  return {
    chip: (
      <InheritChip
        state={state}
        from={mode === "locked" ? "screen" : "panel"}
        fromName={mode === "locked" ? undefined : panelName}
        onReset={onUseTheme}
        onCustomise={onCustomise}
        onJump={mode === "locked" ? onEditLock : undefined}
        className="mx-0.5"
      />
    ),
    actions: <ActionLine state={state} level={level} onReset={onUseTheme} onCustomise={onCustomise} onJump={mode === "locked" ? onEditLock : undefined} />,
    onKeyDown: resetKey(state, onUseTheme),
    mode,
    onCustomise,
  };
}
