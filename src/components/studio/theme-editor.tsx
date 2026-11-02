import { scrollBehavior } from "@/lib/scroll-behavior";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { useSensorCatalog } from "@/lib/catalog";
import { FONT_CATALOG } from "@/lib/fonts";
import { resolveFont, type GeneralFont } from "@/lib/general";
import { resolveInheritance, valueText } from "@/lib/inheritance";
import { uid, type DashboardConfig } from "@/lib/layout";
import { deletePalette, duplicatePalette, paletteName, paletteUsers, renamePalette, savePalette, themePalettes } from "@/lib/palettes";
import type { TemplatePresetGroup } from "@/lib/screen-templates/template-presets";
import { templateThemeRows } from "@/lib/screen-templates/template-rows";
import { hexToHsl, hslToHex, resolveTheme } from "@/lib/theme";
import { applyTheme, themeState, themeUses } from "@/lib/theme-apply";
import { allLocked, themedOf } from "@/lib/theme-model";
import { skinLabel, skinOf } from "@/lib/theme-skins";
import type { ModuleSettings } from "@/modules/types";
import { ColorPill } from "./inspector/color-pill";
import { MoreRows, moreKey } from "./inspector/more-rows";
import { shownValue, shownValues } from "./inspector/zone-fields";
import { InspectorChromeProvider } from "./inspector-layout";
import { allSections, isVisible, rowSection, splitMore, visibleSections, type InspectorSection } from "./inspector-model";
import { smoothOffScreens } from "./screens-model";
import { InlineRow, SelectRow } from "./setting-rows";
import { dropKeys } from "./settings-model";
import { SettingField, type FieldsApi } from "./settings-panel";
import { SmoothOffNote } from "./smooth-off-note";
import type { NavRequest, NavTarget } from "./studio-nav";
import {
  atOfScope,
  cardLocked,
  customiseCard,
  THEME_CARDS,
  withBackgroundAt,
  withCardLock,
  withLookAt,
  withPageFont,
  withThemeRadius,
  withToken,
  withTokens,
  withValuesAt,
  type ThemeAt,
  type ThemeCard,
} from "./theme-cards";
import { scopeAppearance, scopeId, scopeLookValues, validScope, withLockAll, type ThemeScope } from "./theme-editor-model";
import { THEME_EDITOR_SETTINGS } from "./theme-editor-settings";
import { differencesOf, followAll, widgetsKeeping, widgetsKeepingAfter } from "./theme-differences";
import { exceptionsOf, widgetOverrides } from "./theme-exceptions";
import { FineTuneHeader, FineTuneRow, RowsLabel } from "./theme-fine-tune";
import { changedHere, fineTuneChip, fineTuneHeading, fineTuneSummary, resetFineTune } from "./theme-fine-tune-model";
import { ThemeLookCard, ThemeUpdateBar } from "./theme-look-card";
import { appliedToast, appliedToScreensToast, paletteToast, paletteUsedBy, resetToast, savedToast, skinToast } from "./theme-messages";
import { PalettePicker } from "./theme-palette-picker";
import { BackgroundPicker, SkinPicker } from "./theme-part-pickers";
import { SwitchThemePicker } from "./theme-pickers";
import { ThemePreview } from "./theme-preview";
import { ALL_TOKENS, type TokenRow } from "./theme-rows";
import { ThemeScopeBar } from "./theme-scope-bar";
import { ThemeToastRow, useThemeToast } from "./theme-toast";
import {
  backgroundLabel,
  cardKind,
  cardName,
  kindLine,
  levelHelp,
  otherUses,
  pageParts,
  resetText,
  themeCounts,
  themeLinkOf,
  updateBarText,
  usedByText,
  type ThemeDrill,
  type ThemeLink,
} from "./theme-view-model";
import { themeTarget, type AppearancePresetsApi } from "./use-appearance-presets";

interface ThemeEditorProps {
  config: DashboardConfig;
  /** The scope the studio holds (a page scope whose page is gone reads as the screen). */
  scope: ThemeScope;
  /** The screen and page the level control names. */
  profileId: string;
  pageId: string;
  onPick: (scope: ThemeScope, profileId: string, pageId: string) => void;
  setConfig: HistorySetter;
  navigateTo: (target: NavTarget) => void;
  /** The last link: Theme opens the place it names. */
  navRequest?: NavRequest;
  /** The palette's "Go to setting": open the section and focus the row whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
  presets: AppearancePresetsApi;
  /** The studio's undo (the toast row's Undo). */
  onUndo: () => void;
  /** Edit with a widget selected (the preview's Open in Edit). */
  onOpenZone: (profileId: string, pageId: string, zoneId: string) => void;
}

const FONTS = FONT_CATALOG.map((f) => ({ value: f.id, label: f.label }));

const TOP_BUTTON =
  "flex h-7 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-ui-strong px-2.5 text-caption text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** How long a section a link opened stays outlined. */
const FLASH_MS = 1200;

/** The last link request Theme acted on (it outlives a remount, so a stale one is not replayed). */
let handledNav = 0;
/** The last palette jump Theme acted on: Theme mounts lazily, after the jump is asked for, and must still act on it once. */
let handledJump: ThemeEditorProps["jumpTo"];

/** Each section's help text under its rows (SPEC §4.3.2). */
const HELP: Partial<Record<ThemeCard["id"], string>> = {
  colors: "These come from the theme's palette. Change one and the theme counts as edited.",
  type: "Page font is used for titles and labels. It isn't part of a theme, so switching themes keeps it.",
  spacing: "Corners are part of the theme, in the card above.",
  surface: "The skin is part of the theme, in the card above.",
};

/** The skin row is the theme card's Skin; Surface & border shows the skin section's other rows. */
const PART_KEYS = new Set(["skin"]);

/** A row of the two-level data, inset like a setting row. */
const DataRow = ({ children }: { children: ReactNode }) => <div className="py-[3px] pl-4 pr-2.5">{children}</div>;

/**
 * Theme (handoff SPEC §4): the live look of a level. The header holds the title, "Live look of" and the level
 * control (‹screen› · ‹page›), the level help and Lock all at Screen level; the 360 px column the theme
 * card and the fine-tune list, or a picker drilled into (Switch theme, Palette, Skin, Background); the right area the
 * preview of the screen's pages with what differs from the level, and the toast row.
 */
export function ThemeEditor({ config, scope: requested, profileId, pageId, onPick, setConfig, navigateTo, navRequest, jumpTo, presets, onUndo, onOpenZone }: ThemeEditorProps) {
  const profile = config.profiles.find((p) => p.id === profileId) ?? config.profiles[0];
  const page = profile.pages.find((pg) => pg.id === pageId) ?? profile.pages[0];
  const scope = validScope(profile, requested);
  const at = atOfScope(scope, profile.id);
  const target = themeTarget(at);
  const twoLevel = at.level === "page" ? undefined : at;
  const { sources } = useSensorCatalog();
  const [drill, setDrill] = useState<ThemeDrill>("main");
  const [open, setOpen] = useState<string | null>(null);
  // A page has no palette or background of its own: their pickers close when the level moves to a page.
  useEffect(() => {
    if (at.level === "page") setDrill((d) => (d === "palette" || d === "background" ? "main" : d));
  }, [at.level]);
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const columnRef = useRef<HTMLElement>(null);
  // A picker, and Main again after it, open at the top.
  useEffect(() => {
    columnRef.current?.scrollTo({ top: 0 });
  }, [drill]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const { toast, show, dismiss } = useThemeToast(config);
  // The page the preview draws: the level's, until another page of the screen is picked there.
  const [previewId, setPreviewId] = useState<string>();
  useEffect(() => setPreviewId(undefined), [page.id]);
  const previewPage = profile.pages.find((pg) => pg.id === previewId) ?? page;
  // The template looks come in their own chunk (they pull in the whole template catalog).
  const [templates, setTemplates] = useState<readonly TemplatePresetGroup[]>();
  useEffect(() => {
    void import("@/lib/screen-templates/template-presets").then((m) => setTemplates(m.TEMPLATE_PRESET_GROUPS));
  }, []);
  const rows = useMemo(() => (templates ? templateThemeRows(templates) : undefined), [templates]);
  const templatePresets = useMemo(() => templates?.flatMap((g) => g.presets) ?? [], [templates]);
  const templatePalettes = useMemo(() => themePalettes(templatePresets), [templatePresets]);

  const openSection = (id: string) => {
    setDrill("main");
    setOpen(id);
    setFlash(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };
  const follow = (link: ThemeLink | undefined) => {
    if (link?.drill) setDrill(link.drill);
    else if (link?.section) openSection(link.section);
  };

  // A link ("Edit Screen ↗", a LinkRow, Change a section…) opens its place; useNavFocus focuses it.
  useEffect(() => {
    if (!navRequest || navRequest.seq <= handledNav || navRequest.target.view !== "theme") return;
    handledNav = navRequest.seq;
    follow(themeLinkOf(navRequest.target.section));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.seq]);

  // The palette's "Go to setting": the section opens, then the row takes the cursor.
  useEffect(() => {
    if (!jumpTo || jumpTo === handledJump) return;
    handledJump = jumpTo;
    const link = themeLinkOf(jumpTo.id);
    follow(link);
    if (!link?.section) return;
    const id = link.section;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const section = document.querySelector(`[data-nav-section="${CSS.escape(id)}"]`);
        section?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
        if (jumpTo.key)
          section?.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(jumpTo.key)}"] :is(input, select, textarea, button)`)?.focus({ preventScroll: true });
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.seq]);

  const pick = (level: ThemeAt["level"], toProfile: string, toPage: string) =>
    onPick(level === "screen" ? { kind: "profile" } : { kind: "page", pageId: toPage }, toProfile, toPage);
  /** Another level of this screen with a section open (a chip's Edit ‹level› ↗). */
  const goTo = (level: ThemeAt["level"], card: ThemeCard) => {
    pick(level, profile.id, page.id);
    openSection(card.id);
  };

  // The widget-style rows: the level's values over the levels below it.
  const appearance = scopeAppearance(config, profile, scope);
  const values = scopeLookValues(appearance, scope.kind);
  const key = (what: string) => `theme:${profile.id}:${scopeId(scope)}:${what}`;
  const edit = (fn: (v: ModuleSettings) => ModuleSettings, what: string) => setConfig((c) => withValuesAt(c, at, fn), key(what));
  const fields: FieldsApi = {
    values,
    shown: (k, def) => shownValue(values, k, def),
    onChange: (k, v, editKey) => edit((s) => ({ ...s, [k]: v }), editKey ?? k),
    onPatch: (patch) => edit((s) => ({ ...s, ...patch }), Object.keys(patch).join()),
    onClear: (keys) => edit((s) => dropKeys(s, new Set(keys)) ?? {}, "clear"),
    // A page edits only the sections it changes (a following Widget colors inside a changed Colors is the screen's).
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
  // What below the level doesn't follow it; values a theme wrote into widgets are the theme's (owner rule).
  const exceptions = differencesOf(exceptionsOf(config, at));
  const theme = resolveTheme(profile);
  const background = profile.background;
  const font = resolveFont(profile);
  const fontLabel = FONTS.find((f) => f.value === font)?.label ?? font;
  const levelName = at.level === "screen" ? profile.name : page.name;
  const shownStyle: ModuleSettings = { ...values.inherited, ...values.own };

  // The theme applied here, where else it is used, and what changed since (the card, the Update bar, the chips).
  const state = themeState(config, target, templatePresets);
  const uses = state.applied ? themeUses(config, state.applied.id) : [];
  const others = otherUses(uses, target);
  const kind = cardKind(state);
  const name = cardName(state);
  const updateText = updateBarText(state, others);
  const palette = paletteName(theme.tokens, config.palettes, templatePalettes, effective.accent);
  const saved = state.theme && kind === "saved" ? state.theme : undefined;

  const applyPreset = (p: AppearancePreset, keepBackground: boolean) => {
    // A level with no snapshot has nothing of its own: the pick replaces its look.
    const replaced = !state.applied;
    const kept = replaced ? 0 : state.own.length;
    const widgets = widgetsKeepingAfter(applyTheme(config, p, target, { keepBackground }), at, p);
    presets.apply(p, at, keepBackground);
    setDrill("main");
    const background = at.level !== "page" && !keepBackground && p.background !== undefined;
    show({
      ...appliedToast(p.name, at.level, { replaced, background, kept, widgets }, profile.name),
      ...(kept > 0 ? { reset: { label: `Reset to ${p.name}`, run: () => resetTo(p, p.name) } } : {}),
      ...(widgets > 0 ? { follow: { label: "Make them follow", run: () => setConfig((c) => followAll(c, widgetsKeeping(c, at, p))) } } : {}),
    });
  };
  /** The screen's theme on it and the ticked screens: one change, one undo step. */
  const applyToScreens = (profileIds: readonly string[], keepBackground: boolean) => {
    if (!state.theme) return;
    presets.applyToScreens(state.theme, [profile.id, ...profileIds], keepBackground);
    setDrill("main");
    show(appliedToScreensToast(state.theme.name, profileIds.length + 1, keepBackground));
  };
  const resetTo = (p: AppearancePreset, themeName: string) => {
    presets.reset(p, at);
    show(resetToast(themeName, at.level, levelName, profile.name));
  };
  const saveTheme = (themeName: string) => {
    presets.save(at, themeName, true);
    show(savedToast(themeName, "theme"));
  };

  const sectionRows = (s: InspectorSection, only?: (k: string) => boolean) => {
    const split = splitMore(s);
    const keep = (def: (typeof s.settings)[number]) => !PART_KEYS.has(def.key) && (only?.(def.key) ?? true);
    const field = (def: (typeof s.settings)[number]) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />;
    const more = split.more.filter(keep);
    return (
      <>
        {split.rows.filter(keep).map(field)}
        <MoreRows storeKey={moreKey("theme", s.id)} count={more.length}>
          {more.map(field)}
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

  /** A section's rows: Colors in its three groups and the 19 tokens, Text with the page font, the rest as they are. */
  const rowsOf = (card: ThemeCard): ReactNode => {
    const secs = card.sections.flatMap((id) => sections.filter((s) => s.id === id));
    if (card.id === "colors") {
      const widget = secs.find((s) => s.id === "colors");
      const roles = secs.find((s) => s.id === "palette");
      const status = new Set(["ok", "warn", "crit"]);
      return (
        <>
          {widget && (
            <>
              <RowsLabel>Widget colors</RowsLabel>
              {sectionRows(widget)}
            </>
          )}
          {roles && (
            <>
              <RowsLabel>Status</RowsLabel>
              {sectionRows(roles, (k) => status.has(k))}
              <RowsLabel>Series colors</RowsLabel>
              {sectionRows(roles, (k) => !status.has(k))}
            </>
          )}
          {twoLevel && (
            <MoreRows storeKey={moreKey("theme", "tokens")} count={ALL_TOKENS.length} label={`More · all ${ALL_TOKENS.length} color tokens`}>
              <DataRow>{ALL_TOKENS.map(tokenRow)}</DataRow>
            </MoreRows>
          )}
        </>
      );
    }
    return (
      <>
        {card.data === "font" &&
          (twoLevel ? (
            <DataRow>
              <SelectRow
                label="Page font"
                hint="Every widget whose Font is Theme uses it; a Font set on the widget or in the widget theme still wins."
                options={FONTS}
                previewFonts
                value={font}
                onChange={(v) => setConfig((c) => withPageFont(c, twoLevel, v as GeneralFont), key("font"))}
              />
            </DataRow>
          ) : (
            <p className="px-4 pb-1 text-caption text-ui-hint">
              Page font: <span className="text-ui-1">{fontLabel}</span>, from {profile.name}
            </p>
          ))}
        {card.id === "motion" && effective.smoothing === "smooth" && (
          <SmoothOffNote
            screens={smoothOffScreens(config).filter((s) => s.id === profile.id)}
            onOpenScreen={(id) => navigateTo({ view: "screens", profileId: id, section: "performance" })}
          />
        )}
        {secs.map((s, i) => (
          <Fragment key={s.id}>
            {secs.length > 1 && i > 0 && <RowsLabel>{s.id === "border" ? "Border" : s.title}</RowsLabel>}
            {sectionRows(s)}
          </Fragment>
        ))}
      </>
    );
  };

  const chips = THEME_CARDS.map((card) => fineTuneChip(config, at, card, state));
  const changed = chips.filter(changedHere).length;

  const renderSection = (card: ThemeCard, i: number) => {
    const chip = chips[i];
    const parent = resolveInheritance(config, card.sections[0], at);
    const locked = cardLocked(config, profile.id, card);
    const pageLocked = at.level === "page" && chip.state === "locked";
    return (
      <FineTuneRow
        key={card.id}
        card={card}
        chip={chip}
        summary={fineTuneSummary(card.id, effective, { paletteName: palette, fontLabel })}
        parentText={valueText(card.sections[0], parent.parentValue)}
        open={open === card.id}
        onToggle={() => setOpen(open === card.id ? null : card.id)}
        lock={
          at.level === "screen" && card.lockable
            ? { on: locked, screen: profile.name, onToggle: () => setConfig((c) => withCardLock(c, profile.id, card, !locked), key(`lock:${card.id}`)) }
            : undefined
        }
        keptOverride={pageLocked && card.sections.some((sec) => page.widgetTheme?.follow?.[sec] === false)}
        overrides={widgetOverrides(exceptions, card)}
        help={HELP[card.id]}
        onChange={chip.state === "inherited" ? () => setConfig((c) => customiseCard(c, at, card)) : undefined}
        onReset={() => setConfig((c) => resetFineTune(c, at, card, state))}
        onJump={chip.from && chip.state !== "custom" && chip.state !== "base" ? () => goTo("screen", card) : undefined}
        flash={flash === card.id}
      >
        {rowsOf(card)}
      </FineTuneRow>
    );
  };

  const lockedAll = allLocked(profile.widgetTheme);
  const toMain = () => setDrill("main");

  const column = (): ReactNode => {
    switch (drill) {
      case "themes":
        return (
          <SwitchThemePicker
            saved={presets.presets}
            rows={rows}
            currentId={state.applied?.id}
            counts={themeCounts(presets.presets.length, rows ?? [])}
            usedBy={(id) => usedByText(themeUses(config, id))}
            onApply={applyPreset}
            otherScreens={at.level === "screen" && state.theme ? config.profiles.filter((p) => p.id !== profile.id).map((p) => ({ id: p.id, name: p.name, size: `${p.width}×${p.height}` })) : undefined}
            onApplyToScreens={applyToScreens}
            onRename={presets.rename}
            onDuplicate={presets.duplicate}
            onDelete={presets.remove}
            onSaveCurrent={saveTheme}
            onBack={toMain}
          />
        );
      case "palette":
        return (
          <PalettePicker
            current={theme.tokens}
            currentAccent={effective.accent}
            saved={config.palettes ?? []}
            themes={templatePalettes}
            usedBy={(tokens) => paletteUsedBy(paletteUsers(config, tokens))}
            onBack={toMain}
            onPick={(paletteLabel, colors) => {
              if (!twoLevel) return;
              setConfig((c) => withTokens(c, twoLevel, colors.tokens, colors.accent));
              toMain();
              show(paletteToast(paletteLabel));
            }}
            onRename={(id, n) => setConfig((c) => renamePalette(c, id, n))}
            onDuplicate={(id) => setConfig((c) => duplicatePalette(c, id, uid("palette")))}
            onDelete={(id) => setConfig((c) => deletePalette(c, id))}
            onSaveCurrent={(n) => {
              setConfig((c) => savePalette(c, uid("palette"), n, theme.tokens, effective.accent));
              show(savedToast(n, "palette"));
            }}
          />
        );
      case "skin":
        return (
          <SkinPicker
            current={skinOf(effective.skin)}
            onBack={toMain}
            onPick={(skin) => {
              setConfig((c) => withLookAt(c, at, { skin, surface: "auto" }));
              toMain();
              show(skinToast(skinLabel(skin), at.level, profile.name));
            }}
          />
        );
      case "background":
        return (
          <BackgroundPicker
            value={background}
            themes={state.theme?.background}
            tokens={theme.tokens}
            onChange={(bg) => twoLevel && setConfig((c) => withBackgroundAt(c, twoLevel, bg), key("background"))}
            copyLabel={`${profile.name} › Background`}
            profileId={profile.id}
            onOpenLibrary={() => navigateTo({ view: "library", tab: "media" })}
            onBack={toMain}
          />
        );
      case "main":
        return (
          <>
            <ThemeLookCard
              key={scopeId(scope)}
              preview={{ id: "current", name, description: "", theme: theme.tokens, radius: theme.radius, style: themedOf(shownStyle), ...(background ? { background } : {}) }}
              name={name}
              kind={kind}
              kindLine={kindLine(state, others, levelName)}
              reset={
                state.theme
                  ? {
                      text: resetText(name, state.own.length, at.level, levelName),
                      onReset: () => resetTo(state.theme!, name),
                    }
                  : undefined
              }
              onRename={saved ? (n) => presets.rename(saved.id, n) : undefined}
              onDuplicate={saved ? () => presets.duplicate(saved.id) : state.theme ? () => presets.saveCopy(state.theme!) : undefined}
              onDelete={saved ? () => presets.remove(saved.id) : undefined}
              tokens={theme.tokens}
              paletteName={palette}
              skinName={skinLabel(effective.skin)}
              radius={theme.radius}
              background={background}
              backgroundLabel={backgroundLabel(background)}
              partsNote={at.level === "page" ? pageParts(profile.name) : undefined}
              onPalette={() => setDrill("palette")}
              onSkin={() => setDrill("skin")}
              onRadius={(r) => twoLevel && setConfig((c) => withThemeRadius(c, twoLevel, r), key("radius"))}
              onBackground={() => setDrill("background")}
              counts={themeCounts(presets.presets.length, rows ?? [])}
              onSwitch={() => setDrill("themes")}
            />
            <FineTuneHeader heading={fineTuneHeading(changed)} />
            {THEME_CARDS.map(renderSection)}
          </>
        );
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-3.5 border-b border-ui-subtle px-4 py-2">
        <h1 className="text-[16px] font-semibold text-ui-1">Theme</h1>
        <span className="flex items-center gap-1.5 text-caption font-medium text-[#4ade80]">
          <span className="h-[7px] w-[7px] rounded-full bg-[#4ade80] shadow-[0_0_0_3px_rgba(74,222,128,.18)]" aria-hidden />
          Live look of
        </span>
        <ThemeScopeBar config={config} at={at} profile={profile} page={page} onPick={pick} />
        <p className="min-w-0 truncate text-body text-ui-hint">{levelHelp(at.level, profile.name, page.name)}</p>
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
      </div>
      {/* On a phone the column and the preview stack, and the page scrolls. */}
      <div className="flex min-h-0 flex-1 max-sm:flex-col max-sm:overflow-y-auto">
        <aside
          ref={columnRef}
          aria-label="Theme"
          className="w-[360px] shrink-0 overflow-y-auto border-r border-ui-subtle bg-ui-chrome text-ui-2 max-sm:w-full max-sm:overflow-visible max-sm:border-b max-sm:border-r-0"
        >
          <InspectorChromeProvider value={{ mode: "docked" }}>{column()}</InspectorChromeProvider>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col items-start overflow-y-auto bg-ui-app px-6 py-5 max-sm:shrink-0 max-sm:overflow-visible max-sm:p-4">
          <ThemePreview
            config={config}
            at={at}
            profile={profile}
            page={previewPage}
            onPage={setPreviewId}
            levelName={levelName}
            differences={exceptions}
            toast={toast && <ThemeToastRow toast={toast} onUndo={onUndo} onDismiss={dismiss} />}
            bar={
              <ThemeUpdateBar
                name={name}
                kind={kind}
                update={updateText ? { text: updateText, onUpdate: saved ? () => presets.update(saved.id, at) : undefined } : undefined}
                onSave={saveTheme}
                saveName={kind === "template" ? `${name} copy` : ""}
              />
            }
            onFollow={(list) => setConfig((c) => followAll(c, list))}
            onOpenInEdit={(pageId, zoneId) => onOpenZone(profile.id, pageId, zoneId)}
          />
        </main>
      </div>
    </div>
  );
}
