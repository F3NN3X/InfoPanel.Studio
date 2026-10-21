import type { KeyboardEvent } from "react";
import { LEVEL_LABELS, resolveInheritance, valueText, type Inheritance, type InheritScope } from "@/lib/inheritance";
import type { SectionId } from "@/lib/theme-model";
import { InheritChip, InheritLockNote, type MakeThemeTarget } from "./inherit-chip";
import { customiseInheritance, inheritanceJump, resetInheritance } from "./inheritance-actions";
import type { SectionInherit } from "./inspector/inspector-view";
import type { InheritanceContext } from "./use-inheritance";

const LINK = "rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** Whether a key press is the user typing (a field keeps its ⌫). */
const typing = (e: KeyboardEvent<HTMLElement>): boolean =>
  e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** The state of a chip over several sections: locked beats custom beats inherited. */
function lead(states: Inheritance[]): Inheritance {
  return states.find((s) => s.state === "locked") ?? states.find((s) => s.state === "custom") ?? states[0];
}

interface SectionInheritInput {
  /** The theme sections the card covers (more than one in the merged Colors card). */
  sections: readonly SectionId[];
  /** The card's title (the kept-override note names it). */
  title: string;
  scope: InheritScope;
  ctx: InheritanceContext;
  /** "Make this the theme for… ▸" (widget zones). */
  onMakeTheme?: (sections: readonly SectionId[], target: MakeThemeTarget) => void;
}

/**
 * A section card's inheritance chip, action line, kept-override note and ⌫ reset (SPEC §4.3, §5), over
 * `lib/inheritance.ts`. Plain data, no hooks: the inspector calls it per section while rendering.
 */
export function sectionInherit({ sections, title, scope, ctx, onMakeTheme }: SectionInheritInput): SectionInherit {
  const states = sections.map((sec) => resolveInheritance(ctx.config, sec, scope));
  const main = lead(states);
  const mainPath = sections[states.indexOf(main)];
  const level = LEVEL_LABELS[main.from ?? "all"];
  const reset = () => ctx.setConfig((c) => sections.reduce((acc, sec) => resetInheritance(acc, sec, scope), c));
  const customise = () => ctx.setConfig((c) => sections.reduce((acc, sec) => customiseInheritance(acc, sec, scope), c));
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
    actions: (
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] leading-snug">
        {main.state === "custom" && (
          <button type="button" onClick={reset} className={LINK}>
            Reset to inherited
          </button>
        )}
        {main.state === "inherited" && (
          <button type="button" onClick={customise} className={LINK}>
            Customise here
          </button>
        )}
        {main.state === "locked" ? (
          <button type="button" onClick={jump} className={LINK}>
            Edit lock in Theme ↗
          </button>
        ) : (
          main.from && (
            <button type="button" onClick={jump} className={LINK}>
              Edit {level} ↗
            </button>
          )
        )}
      </p>
    ),
    onKeyDown:
      main.state === "custom"
        ? (e) => {
            if ((e.key === "Backspace" || e.key === "Delete") && !typing(e) && !e.defaultPrevented) {
              e.preventDefault();
              reset();
            }
          }
        : undefined,
  };
}
