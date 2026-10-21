import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useSensorCatalog } from "@/lib/catalog";
import { FONT_CATALOG } from "@/lib/fonts";
import { GENERAL_DEFAULTS, resolveFont, type GeneralFont } from "@/lib/general";
import { resolveInheritance, valueText } from "@/lib/inheritance";
import type { DashboardConfig } from "@/lib/layout";
import { hexToHsl, hslToHex, resolveTheme, THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import { allLocked, isSectionId } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import { BackgroundEditor } from "./background-editor";
import { ColorPill } from "./inspector/color-pill";
import { useAccordionPref } from "./inspector/inspector-prefs";
import { MoreRows, moreKey } from "./inspector/more-rows";
import { shownValue, shownValues } from "./inspector/zone-fields";
import { InspectorChromeProvider } from "./inspector-layout";
import { allSections, changedCount, isVisible, rowSection, splitMore, visibleSections, type InspectorSection } from "./inspector-model";
import { LinkRow } from "./link-row";
import { InlineRow, SelectRow, SliderRow } from "./setting-rows";
import { dropKeys } from "./settings-model";
import { SettingField, type FieldsApi } from "./settings-panel";
import type { NavRequest, NavTarget } from "./studio-nav";
import { CardLabel, CustomiseList, scopeHelp, ThemeSectionCard } from "./theme-card-list";
import {
  atOfScope,
  cardInherit,
  cardLocked,
  cardOfSection,
  cardsAt,
  customiseCard,
  dataSet,
  resetCard,
  THEME_CARDS,
  withBackgroundAt,
  withCardLock,
  withPageFont,
  withThemeRadius,
  withToken,
  withTokens,
  type ThemeAt,
  type ThemeCard,
} from "./theme-cards";
import { scopeAppearance, scopeId, scopeLookValues, validScope, withLockAll, withScopeValues, type ThemeScope } from "./theme-editor-model";
import { THEME_EDITOR_SETTINGS } from "./theme-editor-settings";
import { exceptionsOf, makeAllFollow, makeFollow, widgetOverrides } from "./theme-exceptions";
import { ApplyTheme, SaveTheme } from "./theme-gallery";
import { ThemeExceptions, ThemePreview } from "./theme-preview";
import { ThemeScopeBar } from "./theme-scope-bar";
import { ThemeStartFrom } from "./theme-start-from";
import { ADVANCED_TOKENS, VISIBLE_TOKENS, type TokenRow } from "./theme-rows";
import type { AppearancePresetsApi } from "./use-appearance-presets";

interface ThemeEditorProps {
  config: DashboardConfig;
  /** The scope the studio holds (a page scope whose page is gone reads as the screen). */
  scope: ThemeScope;
  /** The screen and page the scope bar names. */
  profileId: string;
  pageId: string;
  onPick: (scope: ThemeScope, profileId: string, pageId: string) => void;
  setConfig: HistorySetter;
  navigateTo: (target: NavTarget) => void;
  /** The last link: Theme opens the card it names. */
  navRequest?: NavRequest;
  /** The palette's "Go to setting": open the card and focus the row whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
  presets: AppearancePresetsApi;
}

const FONTS = FONT_CATALOG.map((f) => ({ value: f.id, label: f.label }));

const TOP_BUTTON =
  "flex h-7 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-ui-strong px-2.5 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** How long a card a link opened stays outlined. */
const FLASH_MS = 1200;

/** The last link request Theme acted on (it outlives a remount, so a stale one is not replayed). */
let handledNav = 0;

/** The card a link's section names: a card id, or a widget-style section (Widget colors → Colors). */
function cardIdOf(section: string | undefined): string | undefined {
  if (!section) return undefined;
  if (THEME_CARDS.some((c) => c.id === section)) return section;
  return isSectionId(section) ? cardOfSection(section).id : undefined;
}

/** A row of the two-level data, inset like a setting row. */
const DataRow = ({ children }: { children: ReactNode }) => <div className="py-[3px] pl-4 pr-2.5">{children}</div>;

/**
 * Theme (SPEC §7): one editor for the inherited look at every scope. The top bar holds the scope bar (All screens ›
 * Screen › Page), Lock all at Screen scope, Apply a theme here… and Save as Theme; the 360 px column the scope help,
 * 1 · Start from (not on a page) and the ten section cards, each writing its own store; the right area the live
 * preview of the page at the scope and its Exceptions.
 */
export function ThemeEditor({ config, scope: requested, profileId, pageId, onPick, setConfig, navigateTo, navRequest, jumpTo, presets }: ThemeEditorProps) {
  const profile = config.profiles.find((p) => p.id === profileId) ?? config.profiles[0];
  const page = profile.pages.find((pg) => pg.id === pageId) ?? profile.pages[0];
  const scope = validScope(profile, requested);
  const at = atOfScope(scope, profile.id);
  const twoLevel = at.level === "page" ? undefined : at;
  const { sources } = useSensorCatalog();
  const [accordion] = useAccordionPref();
  const [open, setOpen] = useState<Record<string, boolean>>({ colors: true });
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const openCard = (id: string) => {
    setOpen((m) => (accordion === "one" ? { [id]: true } : { ...m, [id]: true }));
    setFlash(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };
  const toggle = (id: string) => setOpen((m) => (m[id] ? { ...m, [id]: false } : accordion === "one" ? { [id]: true } : { ...m, [id]: true }));

  // A link ("Edit All screens ↗", a LinkRow, Customise a section…) opens its card; useNavFocus focuses it.
  useEffect(() => {
    if (!navRequest || navRequest.seq <= handledNav || navRequest.target.view !== "theme") return;
    handledNav = navRequest.seq;
    const id = cardIdOf(navRequest.target.section);
    if (id) openCard(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.seq]);

  // The palette's "Go to setting": the card opens, then the row takes the cursor.
  const lastJump = useRef(jumpTo?.seq);
  useEffect(() => {
    if (!jumpTo || jumpTo.seq === lastJump.current) return;
    lastJump.current = jumpTo.seq;
    const id = cardIdOf(jumpTo.id);
    if (!id) return;
    openCard(id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = document.querySelector(`[data-nav-section="${CSS.escape(id)}"]`);
        card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        if (jumpTo.key)
          card?.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(jumpTo.key)}"] :is(input, select, textarea, button)`)?.focus({ preventScroll: true });
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.seq]);

  const pick = (level: ThemeAt["level"], toProfile: string, toPage: string) =>
    onPick(level === "all" ? { kind: "base" } : level === "screen" ? { kind: "profile" } : { kind: "page", pageId: toPage }, toProfile, toPage);
  /** Another scope of this screen with a card open (a LinkRow, a chip's Edit ‹level› ↗). */
  const goTo = (level: ThemeAt["level"], card: ThemeCard) => {
    pick(level, profile.id, page.id);
    openCard(card.id);
  };

  // The widget-style rows: the scope's values over the levels below it (the old Theme page's).
  const appearance = scopeAppearance(config, profile, scope);
  const values = scopeLookValues(appearance, scope.kind);
  const key = (what: string) => `theme:${profile.id}:${scopeId(scope)}:${what}`;
  const edit = (fn: (v: ModuleSettings) => ModuleSettings, what: string) => setConfig((c) => withScopeValues(c, profile.id, scope, fn), key(what));
  const fields: FieldsApi = {
    values,
    shown: (k, def) => shownValue(values, k, def),
    onChange: (k, v, editKey) => edit((s) => ({ ...s, [k]: v }), editKey ?? k),
    onPatch: (patch) => edit((s) => ({ ...s, ...patch }), Object.keys(patch).join()),
    onClear: (keys) => edit((s) => dropKeys(s, new Set(keys)) ?? {}, "clear"),
    // A page edits only the sections it customises (a following Widget colors inside a custom Colors is the screen's).
    readOnly:
      scope.kind === "page"
        ? (def) => {
            const sec = rowSection(def);
            return sec !== undefined && page.widgetTheme?.follow?.[sec] !== false;
          }
        : undefined,
  };
  const effective = shownValues(values, THEME_EDITOR_SETTINGS);
  const sections = visibleSections(allSections({ kind: "theme", scope: scope.kind }), (def) => isVisible(def, effective));
  const exceptions = exceptionsOf(config, at);
  const { cards, customise } = cardsAt(config, at);
  const theme = resolveTheme(config, at.level === "all" ? undefined : profile);
  const font = at.level === "all" ? (config.general?.font ?? GENERAL_DEFAULTS.font) : resolveFont({ font: config.general?.font ?? GENERAL_DEFAULTS.font }, profile);
  const fontLabel = FONTS.find((f) => f.value === font)?.label ?? font;
  const scopeName = at.level === "all" ? "All screens" : at.level === "screen" ? profile.name : page.name;
  /** Where a two-level value on a page comes from (the page has no level of its own). */
  const fromScreen = (card: ThemeCard) => (card.data && dataSet(config, card.data, profile) ? profile.name : "All screens");

  const sectionRows = (s: InspectorSection) => {
    const split = splitMore(s);
    const field = (def: (typeof s.settings)[number]) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />;
    return (
      <>
        {split.rows.map(field)}
        <MoreRows storeKey={moreKey("theme", s.id)} count={split.count}>
          {split.more.map(field)}
        </MoreRows>
      </>
    );
  };

  const tokenRow = ([k, label]: TokenRow) => (
    <InlineRow key={k} label={label}>
      <ColorPill
        value={hslToHex(theme.tokens[k])}
        label={label}
        onChange={(v) => twoLevel && setConfig((c) => withToken(c, twoLevel, k, hexToHsl(v)), key(`token:${k}`))}
      />
    </InlineRow>
  );

  /** A card's two-level rows: editors at All screens and Screen, a LinkRow to the screen on a page (PLAN decision 13). */
  const dataRows = (card: ThemeCard): ReactNode => {
    const link = (label: string, value: string, mono = false) => (
      <DataRow>
        <LinkRow label={label} value={value} mono={mono} from={fromScreen(card)} link={`Edit on ${profile.name}`} onNavigate={() => goTo("screen", card)} />
      </DataRow>
    );
    switch (card.data) {
      case "tokens": {
        if (!twoLevel) return link("Color tokens", THEME_PRESETS.find((p) => JSON.stringify(p.tokens) === JSON.stringify(theme.tokens))?.label ?? "Custom");
        return (
          <>
            <CardLabel>Color tokens</CardLabel>
            <DataRow>{VISIBLE_TOKENS.map(tokenRow)}</DataRow>
            <MoreRows storeKey={moreKey("theme", "tokens")} count={ADVANCED_TOKENS.length}>
              <DataRow>{ADVANCED_TOKENS.map(tokenRow)}</DataRow>
            </MoreRows>
          </>
        );
      }
      case "font":
        if (!twoLevel) return link("Page font", fontLabel);
        return (
          <DataRow>
            <SelectRow
              label="Page font"
              hint="Every widget whose Font is Theme uses it; a Font set on the widget or in the widget theme still wins."
              options={FONTS}
              value={font}
              onChange={(v) => setConfig((c) => withPageFont(c, twoLevel, v as GeneralFont), key("font"))}
            />
          </DataRow>
        );
      case "radius":
        if (!twoLevel) return link("Corners", `${theme.radius} rem`, true);
        return (
          <DataRow>
            <SliderRow
              label="Corners (rem)"
              hint="Every widget's corners; a widget's own Corner radius wins"
              value={theme.radius}
              min={0}
              max={1.5}
              step={0.05}
              fallback={config.radius}
              onChange={(r) => setConfig((c) => withThemeRadius(c, twoLevel, r), key("radius"))}
            />
          </DataRow>
        );
      case "background":
        if (!twoLevel) return null;
        return (
          <DataRow>
            <BackgroundEditor
              value={(at.level === "screen" ? profile.background : undefined) ?? config.background ?? { type: "none" }}
              types={["none", "color", "gradient", "image", "video"]}
              onChange={(bg) => setConfig((c) => withBackgroundAt(c, twoLevel, bg), key("background"))}
              copyLabel={at.level === "all" ? "All screens › Background" : `${profile.name} › Background`}
              profileId={profile.id}
              onOpenLibrary={() => navigateTo({ view: "library", tab: "media" })}
            />
          </DataRow>
        );
      default:
        return null;
    }
  };

  /** Sub-labels where a card holds more than one store. */
  const labelOf = (card: ThemeCard, s: InspectorSection): string | undefined =>
    card.id === "colors" ? (s.id === "colors" ? "Widget colors" : s.title) : card.id === "surface" && s.id === "skin" ? "Skin" : undefined;

  const renderCard = (card: ThemeCard) => {
    const inherit = cardInherit(config, at, card);
    const parent = resolveInheritance(config, card.sections[0] ?? "background", at);
    const secs = card.sections.flatMap((id) => sections.filter((s) => s.id === id));
    const ownData = card.data !== undefined && twoLevel !== undefined && dataSet(config, card.data, at.level === "screen" ? profile : undefined);
    const changed = secs.reduce((n, s) => n + changedCount(s, values), 0) + (ownData ? 1 : 0);
    const locked = cardLocked(config, profile.id, card);
    return (
      <ThemeSectionCard
        key={card.id}
        card={card}
        inherit={inherit}
        parentText={valueText(card.sections[0] ?? "background", parent.parentValue)}
        open={open[card.id] ?? false}
        onToggle={() => toggle(card.id)}
        changed={changed}
        lock={
          at.level === "screen" && card.lockable
            ? { on: locked, screen: profile.name, onToggle: () => setConfig((c) => withCardLock(c, profile.id, card, !locked), key(`lock:${card.id}`)) }
            : undefined
        }
        overrides={widgetOverrides(exceptions, card)}
        onCustomise={at.level === "screen" ? () => setConfig((c) => customiseCard(c, at, card)) : undefined}
        onReset={() => setConfig((c) => resetCard(c, at, card))}
        onJump={inherit.from ? () => goTo(inherit.from === "all" ? "all" : "screen", card) : undefined}
        flash={flash === card.id}
      >
        {dataRows(card)}
        {secs.map((s) => {
          const label = labelOf(card, s);
          return (
            <Fragment key={s.id}>
              {label && <CardLabel>{label}</CardLabel>}
              {sectionRows(s)}
            </Fragment>
          );
        })}
      </ThemeSectionCard>
    );
  };

  const lockedAll = allLocked(profile.widgetTheme);
  const shownStyle: ModuleSettings = { ...values.inherited, ...values.own };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ui-subtle px-4 py-2.5">
        <h1 className="text-[15px] font-semibold text-ui-1">Theme</h1>
        <span className="text-[12px] text-[#7c7c86]">Editing for</span>
        <ThemeScopeBar config={config} at={at} profile={profile} page={page} onPick={pick} />
        <div className="flex-1" />
        {at.level === "screen" && (
          <button
            type="button"
            className={TOP_BUTTON}
            onClick={() => setConfig((c) => withLockAll(c, profile.id, !lockedAll), key("lock-all"))}
            title={lockedAll ? `Unlock every section of ${profile.name}` : `Force every section on every page and widget of ${profile.name}`}
          >
            <Lock className="h-[15px] w-[15px]" strokeWidth={1.75} />
            {lockedAll ? "Unlock all" : "Lock all"}
          </button>
        )}
        <ApplyTheme
          at={at}
          scopeName={scopeName}
          api={presets}
          onPalette={(p) => twoLevel && setConfig((c) => withTokens(c, twoLevel, p.tokens))}
        />
        <SaveTheme at={at} api={presets} />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Theme sections" className="w-[360px] shrink-0 overflow-y-auto border-r border-ui-subtle bg-ui-chrome text-ui-2">
          <InspectorChromeProvider value={{ mode: "docked" }}>
            <p className="px-3.5 py-3 text-[11.5px] leading-[1.45] text-[#8a8a94]">{scopeHelp(at.level, profile.name, page.name)}</p>
            {twoLevel && (
              <ThemeStartFrom
                tokens={theme.tokens}
                radius={theme.radius}
                style={shownStyle}
                saved={presets.presets}
                onPalette={(tokens: ThemeTokens) => setConfig((c) => withTokens(c, twoLevel, tokens))}
                onSkin={(skin) => edit((st) => ({ ...st, skin, surface: "auto" }), "skin")}
                onSaved={(p) => presets.apply(p, at, false)}
                onLibrary={() => navigateTo({ view: "library", tab: "themes" })}
              />
            )}
            {cards.map(renderCard)}
            {at.level === "page" && (
              <CustomiseList
                options={customise}
                screen={profile.name}
                onCustomise={(card) => {
                  setConfig((c) => customiseCard(c, at, card));
                  openCard(card.id);
                }}
              />
            )}
          </InspectorChromeProvider>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col items-start gap-5 overflow-y-auto bg-[#0b0b0d] p-6">
          <ThemePreview config={config} at={at} profile={profile} page={page} exceptions={exceptions} />
          <ThemeExceptions
            scopeName={scopeName}
            exceptions={exceptions}
            onFollow={(ex) => setConfig((c) => makeFollow(c, ex))}
            onFollowAll={() => setConfig((c) => makeAllFollow(c, at))}
          />
        </main>
      </div>
    </div>
  );
}
