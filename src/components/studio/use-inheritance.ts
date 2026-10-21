import { resolveInheritance, type Inheritance, type InheritPath, type InheritScope } from "@/lib/inheritance";
import type { DashboardConfig } from "@/lib/layout";
import { customiseInheritance, inheritanceJump, resetInheritance } from "./inheritance-actions";
import type { NavTarget } from "./studio-nav";

export interface InheritanceContext {
  config: DashboardConfig;
  /** The studio's history setter (each edit is one undo step). */
  setConfig: (update: (config: DashboardConfig) => DashboardConfig) => void;
  navigateTo: (target: NavTarget) => void;
}

export interface InheritanceApi extends Inheritance {
  reset: () => void;
  customise: () => void;
  /** Open the level the chip names (nothing for base / built-in). */
  jump: () => void;
}

/**
 * An `InheritChip`'s data and actions for one section or two-level datum at
 * a scope (`lib/inheritance.ts` resolves, `inheritance-actions.ts` edits).
 */
export function useInheritance(path: InheritPath, scope: InheritScope, ctx: InheritanceContext): InheritanceApi {
  const inheritance = resolveInheritance(ctx.config, path, scope);
  return {
    ...inheritance,
    reset: () => ctx.setConfig((c) => resetInheritance(c, path, scope)),
    customise: () => ctx.setConfig((c) => customiseInheritance(c, path, scope)),
    jump: () => {
      const target = inheritanceJump(inheritance, path, scope);
      if (target) ctx.navigateTo(target);
    },
  };
}
