import { scrollBehavior } from "@/lib/scroll-behavior";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileArchive, FolderOpen, Info } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/tabs";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { useSensorCatalog } from "@/lib/catalog";
import { FONT_CATALOG } from "@/lib/fonts";
import { resolveFont, resolveGeneral, type GeneralFont } from "@/lib/general";
import { resolveInheritance, valueText } from "@/lib/inheritance";
import { uid, type DashboardConfig } from "@/lib/layout";
import { deletePalette, duplicatePalette, paletteName, paletteUsers, renamePalette, savePalette, themePalettes } from "@/lib/palettes";
import type { TemplatePresetGroup } from "@/lib/screen-templates/template-presets";
import { templateThemeRows } from "@/lib/screen-templates/template-rows";
import { DEFAULT_RADIUS, hexToHsl, hslToHex, resolveTheme } from "@/lib/theme";
import { applyThemeToLevel, themeState, themeUses } from "@/lib/theme-apply";
import { allLocked, isLocked, SECTION_KEYS, themedOf } from "@/lib/theme-model";
import { lookIdOf } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import { ColorPill } from "./inspector/color-pill";
import { MoreRows, moreKey } from "./inspector/more-rows";
import { shownValue, shownValues } from "./inspector/zone-fields";
import { InspectorChromeProvider } from "./inspector-layout";
import { allSections, isVisible, rowSection, splitMore, visibleSections, type InspectorSection } from "./inspector-model";
import { loadLook } from "@/looks";
import type { Look } from "@/looks/look";
import { PACK_IDS } from "@/looks/pack";
import { smoothOffScreens, withScreenPerformance } from "./screens-model";
import { InlineRow, SelectRow } from "./setting-rows";
import { dropKeys } from "./settings-model";
import { SettingField, type FieldsApi } from "./settings-panel";
import { SmoothOffNote } from "./smooth-off-note";
import { focusNavTarget, type NavRequest, type NavTarget } from "./studio-nav";
import {
  atOfScope,
  cardLocked,
  cardSet,
  customiseCard,
  THEME_CARDS,
  withBackgroundAt,
  withCardLock,
  withCorners,
  withKnobReset,
  withLookAt,
  withPageFont,
  resetCard,
  resetCorners,
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
import { BarFill, BarTitle, PageBar } from "./page-bar";
import { fineTuneChip, fineTuneSummary, resetFineTune } from "./theme-fine-tune-model";
import { lookUses, withoutLookId } from "@/looks/user-pack-config";
import { GALLERY_IDS, lookName as lookNameOf, lookPreset, lookPresetId } from "./look-gallery-model";
import { LookKnobs } from "./look-knobs";
import { MotionKnobs } from "./motion-knobs";
import { useStablePreset } from "./look-thumb";
import { knobCustom, knobValue, lockedKnobs, modeOf } from "./look-knobs-model";
import { ThemeActions, ThemeApplyScreens, ThemeLookCard, ThemeSave } from "./theme-look-card";
import { SAMPLE_PRESET_GROUPS } from "@/lib/screen-templates/sample-presets";
import { ThemeBrowse } from "./theme-browse";
import type { BrowseItem } from "./theme-browse-model";
import { previewOrder, type PreviewItem } from "./theme-live-preview-model";
import { PageCanvas } from "./theme-page-canvas";
import { ThemePreviewBar } from "./theme-preview-bar";
import { useThemeLivePreview } from "./use-theme-live-preview";
import { applyPreview, type ThemePreview as LivePreviewOf } from "@/lib/theme-preview";
import { changeSummary, changesLine } from "./theme-change-summary";
import { ThemeChanges, type QuickTheme } from "./theme-changes";
import { accentReadout, cardColour, colourRoles } from "./theme-contrast";
import { getKeepBackground, setKeepBackground } from "./theme-keep-background";
import { burnInOf, packParts, protectionMissing, protectionText } from "./theme-pack-model";
import { ThemeParts } from "./theme-parts";
import { ColourRoles } from "./theme-roles";
import { useImportedPacks } from "./use-imported-packs";
import { usePackWithFonts } from "./use-pack-fonts";
import type { PackImporterHandle } from "./user-packs";
import { appliedToast, appliedToScreensToast, lookToast, paletteToast, paletteUsedBy, resetToast, savedToast } from "./theme-messages";
import { PalettePicker } from "./theme-palette-picker";
import { BackgroundPicker } from "./theme-part-pickers";
import { SwitchThemePicker } from "./theme-pickers";
import { ThemePreview } from "./theme-preview";
import { ALL_TOKENS, type TokenRow } from "./theme-rows";
import { ThemeScopeBar } from "./theme-scope-bar";
import { ThemeToastRow, useThemeToast } from "./theme-toast";
import {
  backgroundLabel,
  cardKind,
  cardName,
  cornersPx,
  kindLine,
  otherUses,
  pageParts,
  radiusPx,
  resetText,
  themeCounts,
  themeLinkOf,
  updateBarText,
  usedByText,
  previewFit,
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

const SAMPLES = SAMPLE_PRESET_GROUPS.flatMap((g) => g.presets);
/** The themes the quick switch offers: the first few theme packs. */
const QUICK_IDS = GALLERY_IDS.filter((id) => PACK_IDS.has(id));

type ThemeTab = "customise" | "browse";

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
  spacing: "Corners and density are quick changes of the theme, above.",
  surface: "The theme and its cards are chosen above.",
};

/** The theme row (Skin) is the theme card's; Surface & border shows the skin section's other rows. */
const PART_KEYS = new Set(["lookId"]);

/** A row of the two-level data, inset like a setting row. */
const DataRow = ({ children }: { children: ReactNode }) => <div className="py-0.75 pl-4 pr-2.5">{children}</div>;

/**
 * Theme: the theme of a level. The header holds the title, the level picker (‹screen› · whole screen, or a page),
 * the Customise and Browse themes tabs, Save as my theme and the actions menu. Customise: the preview of the screen's
 * pages as the kiosk draws them, with what changed from the theme and a quick switch under it, and on the right the
 * theme card, Quick changes, In this theme and Fine-tune (or a picker drilled into: template themes, Palette,
 * Background). Browse themes: the filters, the groups of cards and the detail pane.
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
  const [tab, setTab] = useState<ThemeTab>("customise");
  const [lite, setLite] = useState(false);
  // Keep my background: remembered per screen on this PC, not saved with it.
  const [keep, setKeepNow] = useState(() => getKeepBackground(profile.id));
  useEffect(() => setKeepNow(getKeepBackground(profile.id)), [profile.id]);
  const setKeep = (on: boolean) => {
    setKeepBackground(profile.id, on);
    setKeepNow(on);
  };
  const imported = useImportedPacks();
  const importer = useRef<PackImporterHandle>(null);
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
    void import("@/lib/screen-templates/template-presets").then((m) => setTemplates(m.THEME_LIST_GROUPS));
  }, []);
  // The sample themes are Looks of the gallery: the template looks list only the templates' own.
  const rows = useMemo(() => (templates ? templateThemeRows(templates.filter((g) => !g.id.startsWith("look-"))) : undefined), [templates]);
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
    if (link) setTab("customise");
    if (link?.drill) setDrill(link.drill);
    else if (link?.section) openSection(link.section);
    const anchor = link?.anchor;
    if (anchor) requestAnimationFrame(() => requestAnimationFrame(() => focusNavTarget(document, { view: "theme", section: anchor })));
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
  // The theme the level shows (unknown ids draw Classic), and its name.
  const lookId = lookIdOf(appearance);
  const lookName = lookNameOf(lookId);
  const pack = usePackWithFonts(lookId);
  const [look, setLook] = useState<Look>();
  useEffect(() => {
    let live = true;
    void loadLook(lookId).then((l) => live && setLook(l ?? undefined), () => live && setLook(undefined));
    return () => {
      live = false;
    };
  }, [lookId]);

  // The theme applied here, where else it is used, and what changed since (the card, the Update bar, the chips).
  const state = themeState(config, target, templatePresets);
  const uses = state.applied ? themeUses(config, state.applied.id) : [];
  const others = otherUses(uses, target);
  const kind = cardKind(state);
  // A page with no theme of its own shows its screen's: it follows it.
  const shownState = at.level === "page" && !state.applied ? themeState(config, themeTarget({ level: "screen", profileId: profile.id }), templatePresets) : state;
  const name = cardName(shownState);
  const updateText = updateBarText(state, others);
  const palette = paletteName(theme.tokens, config.palettes, templatePalettes, effective.accent);
  const saved = state.theme && kind === "saved" ? state.theme : undefined;
  const { count: changeCount, what: changeWhat } = changeSummary(state);
  const isPack = PACK_IDS.has(lookId);
  const kindLabel = kind === "saved" ? kindLine(state, others, levelName) : `${isPack ? "Theme pack" : "Theme"}${kind === "custom" || kind === "deleted" ? " · not saved" : ""}`;
  const cardLine = `${kindLabel}${changeCount > 0 ? ` · ${changeCount} ${changeCount === 1 ? "change" : "changes"}` : ""}`;
  const fromName = at.level === "page" ? profile.name : name;
  // The theme's cards and the colours the level shows on them: the readout and the roles.
  const nativeMode = look?.modes.supported[0];
  const knobMode = nativeMode ? modeOf(values, nativeMode) : undefined;
  // Cards: Theme draws the card from the level's tokens, whatever the look's own surface is.
  const themeCard = hslToHex(theme.tokens.card);
  const cardHex = knobValue(values, "surface") === "theme" ? themeCard : cardColour(look, knobMode ?? nativeMode, themeCard);
  const roleRows = colourRoles(look, knobMode ?? nativeMode, (k) => knobValue(values, k), cardHex);
  const accentRow = roleRows[0];
  const readout = accentRow.swatches[0] ? accentReadout(accentRow.swatches[0], cardHex, name) : undefined;
  const general = resolveGeneral(config, profile);
  const parts = packParts(pack, look);

  // One object while the look is unchanged, so the look card's thumbnail draws once (not on each slider step).
  const preview = useStablePreset({ id: "current", name, description: "", theme: theme.tokens, radius: theme.radius, style: themedOf(shownStyle), ...(background ? { background } : {}) });
  const applyPreset = (p: AppearancePreset, keepBackground: boolean) => {
    live.cancel();
    // A level with no snapshot has nothing of its own: the pick replaces its look.
    const replaced = !state.applied;
    const kept = replaced ? 0 : state.own.length;
    const widgets = widgetsKeepingAfter(applyThemeToLevel(config, p, target, { keepBackground }), at, p);
    presets.apply(p, at, keepBackground);
    setDrill("main");
    const background = at.level !== "page" && !keepBackground && p.background !== undefined;
    show({
      ...appliedToast(p.name, at.level, { replaced, background, kept, widgets }, profile.name),
      ...(kept > 0 ? { reset: { label: `Reset to ${p.name}`, run: () => resetTo(p, p.name) } } : {}),
      ...(widgets > 0 ? { follow: { label: "Make them follow", run: () => setConfig((c) => followAll(c, widgetsKeeping(c, at, p))) } } : {}),
    });
  };
  /** A gallery Look: its id, the level's own colors, corners and fine-tune kept (one undo step). */
  const pickLook = (p: AppearancePreset, keepBackground: boolean) => {
    live.cancel();
    presets.applyLook(p, at, keepBackground);
    const background = at.level !== "page" && !keepBackground && p.background !== undefined;
    show({ ...lookToast(p.name, at.level, background, profile.name), reset: { label: `Reset to ${p.name}`, run: () => resetTo(p, p.name) } });
  };
  /** The screens a screen's theme can go on as well (Apply to other screens…, beside Save and in Saved and template themes). */
  const otherScreens =
    at.level === "screen" && state.theme ? config.profiles.filter((p) => p.id !== profile.id).map((p) => ({ id: p.id, name: p.name, size: `${p.width}×${p.height}` })) : undefined;
  /** The screen's theme on it and the ticked screens: one change, one undo step. */
  const applyToScreens = (profileIds: readonly string[], keepBackground: boolean) => {
    if (!state.theme) return;
    presets.applyToScreens(state.theme, [profile.id, ...profileIds], keepBackground);
    setDrill("main");
    show(appliedToScreensToast(state.theme.name, profileIds.length + 1, keepBackground));
  };
  const resetTo = (p: AppearancePreset, themeName: string) => {
    live.cancel();
    presets.reset(p, at);
    show(resetToast(themeName, at.level, levelName, profile.name));
  };
  const saveTheme = (themeName: string) => {
    presets.save(at, themeName, true);
    show(savedToast(themeName, "theme"));
  };

  /** The live preview's Apply: at the level as Switch theme does, or on every screen in one change (one undo step). */
  const applyLive = (item: PreviewItem, p: LivePreviewOf) => {
    if (p.scope.kind !== "all") return item.look ? pickLook(item.preset, p.keepBackground) : applyPreset(item.preset, p.keepBackground);
    setConfig((c) => applyPreview(c, p));
    setDrill("main");
    show(appliedToScreensToast(item.name, config.profiles.length, p.keepBackground));
  };
  const order = useMemo(() => previewOrder(presets.presets, imported.packs, GALLERY_IDS, SAMPLES), [presets.presets, imported.packs]);
  // A card picked (or hovered) is drawn without applying it: the config as Apply would leave it.
  const live = useThemeLivePreview({ config, at, keepBackground: keep, order, onApply: applyLive });
  const itemOf = (i: BrowseItem): PreviewItem => ({ id: i.id, name: i.name, preset: i.preset, look: i.kind !== "saved" });
  const shownConfig = live.config ?? config;
  const shownProfile = shownConfig.profiles.find((p) => p.id === profile.id) ?? profile;
  const shownPage = shownProfile.pages.find((pg) => pg.id === previewPage.id) ?? previewPage;
  // Browse's detail draws the previewed page across its width (with Compare, the two frames one above the other).
  const detailScale = previewFit(338, live.compare ? 190 : 380, profile);
  // The quick switch: a few theme packs to try, each drawn as it would apply.
  const quick = useMemo<QuickTheme[]>(
    () =>
      QUICK_IDS.filter((id) => id !== lookId)
        .slice(0, 4)
        .map((id) => ({ id, name: lookNameOf(id), preset: lookPreset({ id, name: lookNameOf(id), description: "" }, SAMPLES.find((p) => p.id === lookPresetId(id))) })),
    [lookId]
  );
  const allCount = GALLERY_IDS.length + presets.presets.length + imported.packs.length;

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
          {twoLevel && (
            <InlineRow label="Palette">
              <span className="min-w-0 truncate text-caption text-ui-3">{palette}</span>
              <Button small onClick={() => setDrill("palette")}>
                Change
              </Button>
            </InlineRow>
          )}
          <ColourRoles
            rows={roleRows}
            from={fromName}
            against={`${name}'s cards`}
            isSet={(keys) => keys.some((k) => values.own?.[k] !== undefined)}
            onReset={(keys) => fields.onClear([...keys])}
          />
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
                hint="Every widget whose Font is Theme uses it; a Font set on the widget or in the widget theme still wins"
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
        changedCount={card.sections.flatMap((sec) => SECTION_KEYS[sec]).filter((k) => values.own?.[k] !== undefined).length}
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
            otherScreens={otherScreens}
            onApplyToScreens={applyToScreens}
            onRename={presets.rename}
            onDuplicate={presets.duplicate}
            onDelete={presets.remove}
            onSaveCurrent={saveTheme}
            onBack={toMain}
            keep={keep}
            onKeep={setKeep}
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
      case "main": {
        // A page's corners are its own knob; a screen's are the one control over both stores (L48).
        const corners = twoLevel
          ? {
              px: cornersPx(knobValue(values, "radius"), theme.radius),
              custom: Math.abs(theme.radius - (state.theme?.radius ?? DEFAULT_RADIUS)) > 1e-6 || knobCustom(values, "corners"),
              // At the theme's own corners both stores are cleared, so nothing is left holding a value that changes nothing.
              set: (px: number) =>
                setConfig((c) => (px === radiusPx(state.theme?.radius ?? DEFAULT_RADIUS) ? resetCorners(c, twoLevel, state.theme?.radius) : withCorners(c, twoLevel, px)), key("corners")),
              reset: () => setConfig((c) => resetCorners(c, twoLevel, state.theme?.radius), key("corners-reset")),
            }
          : {
              px: cornersPx(knobValue(values, "radius"), theme.radius),
              custom: knobCustom(values, "corners"),
              set: (n: number) => setConfig((c) => withLookAt(c, at, { radius: String(n) }), key("corners")),
              reset: () => setConfig((c) => withKnobReset(c, at, ["radius"]), key("corners-reset")),
            };
        const pageCustom = at.level === "page" && THEME_CARDS.some((card) => cardSet(config, at, card));
        return (
          <>
            <ThemeLookCard preview={preview} name={name} kindLine={cardLine} note={at.level === "page" ? `From ${profile.name} · ${page.name} ${pageCustom ? "has its own sections" : "follows it"}` : undefined} onChange={() => setTab("browse")} />
            {at.level === "page" && (
              <section aria-label={`${page.name} and ${profile.name}`} className="mx-5 mb-3 flex flex-col gap-2 rounded-ui-lg border border-ui-subtle p-3.5">
                <h2 className="flex items-center gap-2 text-body text-ui-1">
                  <span aria-hidden className={cn("h-1.75 w-1.75 rounded-full", pageCustom ? "bg-ui-accent" : "border border-ui-hint")} />
                  {pageCustom ? `${page.name} has its own settings` : `${page.name} follows ${profile.name}`}
                </h2>
                <p className="text-caption text-ui-3">Change any setting below to set it for {page.name} only. {pageParts(profile.name)}</p>
                {pageCustom ? (
                  <Button className="self-start" onClick={() => setConfig((c) => THEME_CARDS.reduce((acc, card) => resetCard(acc, at, card), c), key("follow-again"))}>
                    Follow {profile.name} again
                  </Button>
                ) : (
                  <Button className="self-start" onClick={() => setConfig((c) => THEME_CARDS.reduce((acc, card) => customiseCard(acc, at, card), c), key("own-theme"))}>
                    Give {page.name} its own theme
                  </Button>
                )}
              </section>
            )}
            <LookKnobs
              values={values}
              from={fromName}
              locked={at.level === "page" ? lockedKnobs(appearance, profile.name) : undefined}
              onSet={(patch) => setConfig((c) => withLookAt(c, at, patch), key(`knob:${Object.keys(patch).join()}`))}
              onClear={(keys) => setConfig((c) => withKnobReset(c, at, keys), key(`knob-reset:${keys.join()}`))}
              corners={corners}
              accentNote={
                readout && (
                  <p role="status" data-testid="accent-contrast" className="flex items-start gap-2 rounded-ui-md border border-ui-subtle bg-ui-panel px-3 py-2 text-caption text-ui-2">
                    <Info className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", readout.low ? "text-ui-warn" : "text-ui-3")} aria-hidden />
                    <span>
                      <span className="font-ui-mono text-ui-1">{readout.text.split(" ")[0]}</span> {readout.text.split(" ").slice(1).join(" ")}
                    </span>
                  </p>
                )
              }
            />
            {pack?.motion && (
              <MotionKnobs
                motion={pack.motion}
                values={values}
                from={fromName}
                fx={profile.performance?.fx}
                screen={profile.name}
                locked={at.level === "page" && isLocked(appearance, "motion") ? `Locked by ${profile.name}` : undefined}
                onSet={(patch) => setConfig((c) => withLookAt(c, at, patch), key(`knob:${Object.keys(patch).join()}`))}
                onClear={(keys) => setConfig((c) => withKnobReset(c, at, keys), key(`knob-reset:${keys.join()}`))}
                onLevel={(fx) => setConfig((c) => withScreenPerformance(c, profile.id, { fx }), key("motion-level"))}
              />
            )}
            <ThemeParts
              summary={isPack ? `Theme pack · ${parts.length} parts` : "Plain theme"}
              parts={isPack ? parts : parts.filter((p) => p.id === "font")}
              keepBackground={keep}
              onKeepBackground={setKeep}
              backgroundOwn={at.level !== "page"}
              background={backgroundLabel(background)}
              onChangeBackground={() => setDrill("background")}
              burnIn={burnInOf(pack)}
              needsCare={protectionMissing(pack, general) || (pack?.burnIn !== undefined && pack.burnIn !== "static-safe")}
              protection={protectionText(general)}
              onChangeFont={() => openSection("type")}
              onChangeProtection={() => navigateTo({ view: "screens", profileId: profile.id, section: "performance" })}
            />
            <FineTuneHeader heading="Fine-tune" from={fromName} />
            {THEME_CARDS.map(renderSection)}
          </>
        );
      }
    }
  };

  // The importer is a lazy chunk inside Browse: a click before it has loaded waits for it (a few seconds at most) rather than doing nothing.
  const pickPack = (what: "folder" | "zip", tries = 120) => {
    if (importer.current) importer.current.pick(what);
    else if (tries > 0) requestAnimationFrame(() => pickPack(what, tries - 1));
  };
  const importMenu = (
    <Menu.Root>
      <Menu.Trigger render={<Button icon={<Download aria-hidden />} />} disabled={imported.off}>
        Import a pack
      </Menu.Trigger>
      <Menu.Content sideOffset={4} align="end" className="w-52">
        <Menu.Item onClick={() => pickPack("folder")}>
          <span className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-ui-hint" aria-hidden />
            Import a folder
          </span>
        </Menu.Item>
        <Menu.Item onClick={() => pickPack("zip")}>
          <span className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-ui-hint" aria-hidden />
            Import a zip
          </span>
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <PageBar>
        <BarTitle title="Theme" />
        <ThemeScopeBar config={config} at={at} profile={profile} page={page} onPick={pick} />
        <Tabs
          label="Theme"
          tabs={[
            { value: "customise" as const, label: "Customise" },
            {
              value: "browse" as const,
              label: (
                <span className="flex items-center gap-2">
                  Browse themes <span className="text-ui-hint">{allCount}</span>
                </span>
              ),
            },
          ]}
          value={tab}
          onChange={setTab}
          className="shrink-0 gap-5 self-stretch border-b-0 max-sm:order-last max-sm:w-full [&>button]:h-auto"
        />
        <BarFill />
        {tab === "browse" ? (
          importMenu
        ) : (
          <div className="flex items-center gap-2">
            <ThemeSave
              name={name}
              kind={kind}
              update={updateText ? { text: updateText, onUpdate: saved ? () => presets.update(saved.id, at) : undefined } : undefined}
              onSave={saveTheme}
              saveName={kind === "template" ? `${name} copy` : `My ${lookName}`}
            />
            {/* Saved and template themes has its own (one control on the page at a time). */}
            {drill !== "themes" && state.theme && otherScreens && otherScreens.length > 0 && (
              <ThemeApplyScreens name={state.theme.name} screens={otherScreens} onApply={(ids) => applyToScreens(ids, keep)} />
            )}
            <ThemeActions
              reset={state.theme ? { name, text: resetText(name, state.own.length, at.level, levelName), onReset: () => resetTo(state.theme!, name) } : undefined}
              onRename={saved ? (n) => presets.rename(saved.id, n) : undefined}
              onDuplicate={saved ? () => presets.duplicate(saved.id) : state.theme ? () => presets.saveCopy(state.theme!) : undefined}
              onDelete={saved ? () => presets.remove(saved.id) : undefined}
              lock={at.level === "screen" ? { on: lockedAll, screen: profile.name, onToggle: () => setConfig((c) => withLockAll(c, profile.id, !lockedAll), key("lock-all")) } : undefined}
            />
          </div>
        )}
      </PageBar>
      {toast && (
        <div className="shrink-0 px-7 pt-3 max-sm:px-3">
          <ThemeToastRow toast={toast} onUndo={onUndo} onDismiss={dismiss} />
        </div>
      )}
      <div className={cn("shrink-0 px-7 max-sm:px-3", live.shown && "pt-3")}>
        <ThemePreviewBar
          live={live}
          screenName={profile.name}
          pageName={page.name}
          keepBackground={keep}
          onKeepBackground={setKeep}
          onLevel={(level) => pick(level, profile.id, page.id)}
        />
      </div>
      {tab === "browse" ? (
        <ThemeBrowse
          levelName={levelName}
          currentLookId={lookId}
          currentPresetId={state.applied?.id}
          saved={presets.presets}
          packs={imported.packs}
          packsOff={imported.off}
          importer={importer}
          onPacksChange={() => void imported.refresh()}
          keepBackground={keep}
          onApply={(p, keepBackground, isLook) => (isLook ? pickLook(p, keepBackground) : applyPreset(p, keepBackground))}
          onPreview={(p, isLook) => {
            live.preview(order.find((o) => o.preset.id === p.id) ?? { id: p.id, name: p.name, preset: p, look: isLook });
            setTab("customise");
          }}
          previewId={live.shown?.id}
          onPreviewCard={(i) => live.preview(itemOf(i))}
          onHoverCard={(i) => live.hover(i && itemOf(i))}
          onVisible={live.setVisible}
          canvas={
            live.config && (
              <div className="flex flex-col gap-3">
                {live.compare && <PageCanvas config={config} profile={profile} at={at} pageId={previewPage.id} scale={detailScale} label="Now" />}
                <PageCanvas config={live.config} profile={shownProfile} at={at} pageId={previewPage.id} scale={detailScale} label={live.compare ? "Preview" : `On ${profile.name}`} />
              </div>
            )
          }
          onCustomise={() => setTab("customise")}
          onDuplicate={(item) => (item.kind === "saved" ? presets.duplicate(item.id) : presets.saveCopy(item.preset))}
          onRename={presets.rename}
          onDelete={presets.remove}
          onRemovePack={(id) => {
            const worn = lookUses(config, id);
            if (worn > 0) setConfig((c) => withoutLookId(c, id), key("remove-pack"));
            return worn;
          }}
          onTemplates={() => {
            setTab("customise");
            setDrill("themes");
          }}
          templatesText={themeCounts(presets.presets.length, rows ?? [])}
        />
      ) : (
        /* On a phone the preview and the column stack, and the page scrolls. */
        <div className="flex min-h-0 flex-1 max-sm:flex-col max-sm:overflow-y-auto">
          <main className="flex min-w-0 flex-1 flex-col items-start overflow-y-auto bg-ui-app px-7 py-5 max-sm:shrink-0 max-sm:overflow-visible max-sm:p-4">
            <ThemePreview
              config={shownConfig}
              at={at}
              profile={shownProfile}
              page={shownPage}
              onPage={setPreviewId}
              levelName={levelName}
              differences={live.shown ? [] : exceptions}
              compare={live.shown && live.compare ? { config, profile } : undefined}
              lite={lite}
              onLite={setLite}
              footer={
                <ThemeChanges
                  line={changesLine(changeCount, name)}
                  what={changeWhat}
                  changed={changeCount > 0}
                  reset={state.theme ? { name, onReset: () => resetTo(state.theme!, name) } : undefined}
                  quick={quick}
                  onQuick={(t) => live.preview({ ...t, look: true })}
                  onHover={(t) => live.hover(t && { ...t, look: true })}
                  allCount={allCount}
                  onAll={() => setTab("browse")}
                />
              }
              onFollow={(list) => setConfig((c) => followAll(c, list))}
              onOpenInEdit={(pageId, zoneId) => onOpenZone(profile.id, pageId, zoneId)}
            />
          </main>
          <aside
            ref={columnRef}
            aria-label="Theme"
            className="w-95 shrink-0 overflow-y-auto border-l border-ui-subtle bg-ui-chrome text-ui-2 max-sm:w-full max-sm:overflow-visible max-sm:border-b max-sm:border-l-0"
          >
            <InspectorChromeProvider value={{ mode: "docked" }}>{column()}</InspectorChromeProvider>
          </aside>
        </div>
      )}
    </div>
  );
}
