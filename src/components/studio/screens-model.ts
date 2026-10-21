import type { DashboardConfig, MonitorProfile, PageRotate, ProfilePage } from "@/lib/layout";
import { resolveGeneral } from "@/lib/general";
import { resolvePerformance, type PerformanceOverride } from "@/lib/performance";
import { withPerformance, withScope } from "./inspector/profile-scope";

/**
 * The Screens view's pure rules (SPEC §8): the launch rule, a card's tag and meta line, a screen's own
 * performance, and which pages the rotation includes. All config → config, so each is one undo step.
 */

/** What the app opens on (PLAN decision 3): the best fit for the window, or one screen always. */
export type LaunchRule = "auto" | "fixed";

/** `config.activeProfile` as a rule. An id nothing matches opens like "auto" (`resolveProfile`), so it reads as such. */
export const launchRule = (config: DashboardConfig): LaunchRule =>
  config.activeProfile !== "auto" && config.profiles.some((p) => p.id === config.activeProfile) ? "fixed" : "auto";

/** The config opening on `id` ("auto", or a screen that exists); anything else is no change. */
export function withLaunch(config: DashboardConfig, id: string): DashboardConfig {
  if (id !== "auto" && !config.profiles.some((p) => p.id === id)) return config;
  return id === config.activeProfile ? config : { ...config, activeProfile: id };
}

export type LaunchTag = "best-fit" | "launch";

/** A card's one tag: "Best fit now" for the screen the window picks while the rule is best fit, "Opens on launch" for the fixed one. */
export function launchTag(config: DashboardConfig, profileId: string, autoProfileId: string): LaunchTag | undefined {
  if (launchRule(config) === "auto") return profileId === autoProfileId ? "best-fit" : undefined;
  return config.activeProfile === profileId ? "launch" : undefined;
}

/** A card's meta line: `1920×550 · 3 pages · grid 8 × 3`. */
export function screenMeta(p: Pick<MonitorProfile, "width" | "height" | "pages" | "cols" | "rows">): string {
  const pages = `${p.pages.length} ${p.pages.length === 1 ? "page" : "pages"}`;
  return `${p.width}×${p.height} · ${pages} · grid ${p.cols} × ${p.rows}`;
}

/** The screen with its own frame rate or animations: it takes All screens' values first (customising), then `patch`. */
export function withScreenPerformance(config: DashboardConfig, profileId: string, patch: PerformanceOverride): DashboardConfig {
  const own = withScope(config, profileId, "performance", "profile");
  return {
    ...own,
    profiles: own.profiles.map((p) => (p.id === profileId ? { ...p, performance: withPerformance(p.performance, patch) } : p)),
  };
}

const MOTION_TEXT = { system: "system motion", reduce: "reduced motion", full: "full motion" } as const;

/** A screen's own performance as text: "30 fps", "reduced motion", "30 fps · reduced motion". */
export function ownPerformanceText(performance: PerformanceOverride | undefined): string | undefined {
  const parts = [
    performance?.maxFps === undefined ? undefined : performance.maxFps === 0 ? "unlimited fps" : `${performance.maxFps} fps`,
    performance?.motion === undefined ? undefined : MOTION_TEXT[performance.motion],
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** A screen with its own value of one of All screens' performance defaults (Settings › Dashboard lists them, PLAN decision 25). */
export interface PerformanceOverrideOf {
  id: string;
  name: string;
  /** The value as text: "30 fps", "reduced motion". */
  text: string;
}

/** The screens that override `key`, each with its own value. */
export function screensOverriding(profiles: readonly MonitorProfile[], key: keyof PerformanceOverride): PerformanceOverrideOf[] {
  return profiles.flatMap((p) => {
    const text = ownPerformanceText(p.performance && { [key]: p.performance[key] });
    return text ? [{ id: p.id, name: p.name, text }] : [];
  });
}

/** A screen's own performance without `key` (the Reset): null when nothing of its own is left, which puts the screen back to All screens'. */
export function performanceWithout(performance: PerformanceOverride | undefined, key: keyof PerformanceOverride): PerformanceOverride | null {
  const { [key]: _removed, ...rest } = performance ?? {};
  return Object.keys(rest).length > 0 ? rest : null;
}

/** A screen where Smooth graphs do not run, and why. */
export interface SmoothOffScreen {
  id: string;
  name: string;
  /** "30 fps cap", "animations reduced", or both joined with " and ". */
  reason: string;
}

/**
 * The screens whose performance turns Smooth off: a cap below 60 fps, or reduced animations (the studio drops its
 * transitions then, so graphs step at the data rate). "Follow system" is the OS's call, so it does not count.
 */
export function smoothOffScreens(config: DashboardConfig): SmoothOffScreen[] {
  const general = resolveGeneral(config);
  return config.profiles.flatMap((p) => {
    const { maxFps, reduceMotion } = resolvePerformance({ profile: p.performance, general, system: false });
    const reasons = [maxFps > 0 && maxFps < 60 ? `${maxFps} fps cap` : undefined, reduceMotion ? "animations reduced" : undefined].filter(
      (reason): reason is string => reason !== undefined
    );
    return reasons.length > 0 ? [{ id: p.id, name: p.name, reason: reasons.join(" and ") }] : [];
  });
}

/** The pages the rotation steps through: the ticked ones that exist, else every page (none ticked = all). */
export function rotationPageIds(rotate: PageRotate | undefined, pages: readonly ProfilePage[]): string[] {
  const ticked = (rotate?.pages ?? []).filter((id) => pages.some((p) => p.id === id));
  return ticked.length > 0 ? pages.filter((p) => ticked.includes(p.id)).map((p) => p.id) : pages.map((p) => p.id);
}

/**
 * The rotation's `pages` after switching one page in or out (kept in page order; every page in = unset). A switch that
 * would leave none out returns null: none ticked means every page, so the last one stays.
 */
export function toggleRotationPage(
  rotate: PageRotate | undefined,
  pages: readonly ProfilePage[],
  pageId: string
): { pages: string[] | undefined } | null {
  const included = rotationPageIds(rotate, pages);
  const next = included.includes(pageId) ? included.filter((id) => id !== pageId) : [...included, pageId];
  if (next.length === 0) return null;
  const ordered = pages.map((p) => p.id).filter((id) => next.includes(id));
  return { pages: ordered.length === pages.length ? undefined : ordered };
}
