import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "@/lib/layout";
import { cardSet, resetCard, THEME_CARDS, type ThemeAt, type ThemeCard } from "./theme-cards";
import { resetInheritance } from "./inheritance-actions";

/**
 * Theme's Exceptions (SPEC §7.3): what below the current scope doesn't follow it, per card. A screen lists its pages
 * and widgets that set their own; a page its widgets (never the page's
 * own sections). Make it follow resets exactly that one; Make all follow every listed one. Also the preview's
 * levels (the page rendered at the scope); its tags are `theme-differences.ts`. Pure.
 */

export interface ThemeException {
  /** Unique in the list. */
  key: string;
  kind: "page" | "widget";
  card: ThemeCard;
  profile: MonitorProfile;
  page?: ProfilePage;
  zone?: Placement;
  /** The screen locks what it customises: kept, but it shows the screen's (SPEC §5). */
  ignored: boolean;
}

/** The widget's cards with a custom section, and whether the screen locks every custom section of each. */
function zoneCards(profile: MonitorProfile, zone: Placement): { card: ThemeCard; ignored: boolean }[] {
  const locks = profile.widgetTheme?.locks;
  return THEME_CARDS.flatMap((card) => {
    const custom = card.sections.filter((sec) => zone.follow?.[sec] === false);
    return custom.length > 0 ? [{ card, ignored: custom.every((sec) => locks?.[sec] === true) }] : [];
  });
}

function pageCards(config: DashboardConfig, profile: MonitorProfile, page: ProfilePage): { card: ThemeCard; ignored: boolean }[] {
  const at: ThemeAt = { level: "page", profileId: profile.id, pageId: page.id };
  const locks = profile.widgetTheme?.locks;
  return THEME_CARDS.filter((card) => cardSet(config, at, card)).map((card) => ({
    card,
    ignored: card.sections.filter((sec) => page.widgetTheme?.follow?.[sec] === false).every((sec) => locks?.[sec] === true),
  }));
}

/** The exceptions at a scope, screens first, then each page and its widgets. */
export function exceptionsOf(config: DashboardConfig, at: ThemeAt): ThemeException[] {
  return config.profiles.filter((p) => p.id === at.profileId).flatMap((profile) => {
    const pages = profile.pages.filter((pg) => at.level !== "page" || pg.id === at.pageId);
    return [
      ...pages.flatMap((page) => [
        ...(at.level === "page"
          ? []
          : pageCards(config, profile, page).map(
              ({ card, ignored }): ThemeException => ({ key: `page:${page.id}:${card.id}`, kind: "page", card, profile, page, ignored })
            )),
        ...page.placements.flatMap((zone) =>
          zoneCards(profile, zone).map(
            ({ card, ignored }): ThemeException => ({ key: `widget:${page.id}:${zone.id}:${card.id}`, kind: "widget", card, profile, page, zone, ignored })
          )
        ),
      ]),
    ];
  });
}

/** Make it follow: a page or widget follows again (its own values stay stored, as Reset to inherited does). */
export function makeFollow(config: DashboardConfig, ex: ThemeException): DashboardConfig {
  if (ex.kind === "page") return resetCard(config, { level: "page", profileId: ex.profile.id, pageId: ex.page!.id }, ex.card);
  const scope = { level: "widget", profileId: ex.profile.id, pageId: ex.page!.id, zoneId: ex.zone!.id } as const;
  return ex.card.sections.reduce((c, sec) => resetInheritance(c, sec, scope), config);
}

/** Make all follow: every exception at the scope, so a page scope only ever touches its widgets. */
export const makeAllFollow = (config: DashboardConfig, at: ThemeAt): DashboardConfig => exceptionsOf(config, at).reduce(makeFollow, config);

/** "N widgets override this" under a card. */
export const widgetOverrides = (exceptions: readonly ThemeException[], card: ThemeCard): number =>
  exceptions.filter((ex) => ex.kind === "widget" && ex.card.id === card.id).length;

const pageLevel = (page: ProfilePage): ProfilePage => {
  const { widgetTheme: _theme, ...rest } = page;
  return rest;
};

/**
 * The screen as the preview draws it at a scope: a screen without its pages' own look (widgets keep theirs: they are
 * the badged exceptions), a page as it is.
 */
export function previewProfile(profile: MonitorProfile, at: ThemeAt): MonitorProfile {
  return at.level === "page" ? profile : { ...profile, pages: profile.pages.map(pageLevel) };
}
