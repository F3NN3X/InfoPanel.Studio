import type { ReactNode } from "react";
import { Monitor, Palette, Proportions, Zap } from "lucide-react";
import type { PageBackground } from "@/lib/appearance";
import { isTauri } from "@/lib/desktop";
import { withIsland } from "@/lib/island/config";
import { resolveGeneral, type GeneralSettings } from "@/lib/general";
import type { DashboardConfig, PageRotate, ProfilePage, ProfileView } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";
import { resolveTheme, type ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import type { CurrentLook } from "./appearance-gallery";
import { DataApiPanel } from "./data-api-panel";
import { AppSettingsFooter } from "./inspector/app-settings-footer";
import { InspectorNote, InspectorView, type SectionParts } from "./inspector/inspector-view";
import { IslandSection } from "./inspector/island-section";
import { useAccordionPref, useQuickBarPref, type AccordionMode } from "./inspector/inspector-prefs";
import { ClockBody, DisplayBody, PagesBody, PerformanceBody } from "./inspector/profile-behaviour";
import { ProfileHeader } from "./inspector/profile-header";
import { GridSection, ScreenSection } from "./inspector/profile-layout";
import { BackgroundBody, LookNote, ScopeDot, ScopeSwitch, StyleBody, ThemeBody } from "./inspector/profile-look";
import {
  lockState,
  scopeOf,
  type AppearanceTarget,
  type BackgroundTarget,
  type LookScope,
  type ProfileTheme,
  type ScopedSection,
} from "./inspector/profile-scope";
import { shownValue } from "./inspector/zone-fields";
import { globalStyleValues, type InspectorContext, type InspectorSection } from "./inspector-model";
import type { FieldsApi } from "./settings-panel";
import { SegmentedRow, ToggleRow } from "./setting-rows";
import { dropKeys } from "./settings-model";
import type { AppearancePresetsApi } from "./use-appearance-presets";

export interface DocumentInspectorProps {
  /** Open, reveal and outline a section whenever `seq` changes (the palette's document commands). */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The dashboard: the profile count, and what the header's thumbnail inherits. */
  config: DashboardConfig;
  theme: ThemeTokens;
  radius: number;
  onToken: (key: keyof ThemeTokens, value: string) => void;
  onThemePreset: (name: string) => void;
  /** The dashboard style (defaults for every widget of every profile). */
  dashboardStyle: ModuleSettings | undefined;
  onStyle: (target: AppearanceTarget, fn: (style: ModuleSettings) => ModuleSettings) => void;
  /** The appearance presets gallery. */
  presets: AppearancePresetsApi;
  /** The dashboard's page background (every profile without its own). */
  background: PageBackground | undefined;
  /** The profile being edited (its own look, performance and name). */
  profile: ProfileView;
  /** Set the profile's own theme colours / radius. */
  onProfileTheme: (next: ProfileTheme, key?: string) => void;
  onBackground: (target: BackgroundTarget, bg: PageBackground | undefined) => void;
  /** Switch a section between the dashboard's value and the profile's own (starting from the shared one). */
  onScope: (section: ScopedSection, scope: LookScope) => void;
  /** Corners: the dashboard's radius or the profile's. */
  onRadius: (scope: LookScope, radius: number) => void;
  /** Set the profile's frame rate or animations override. */
  onPerformance: (patch: PerformanceOverride) => void;
  /** Lock every widget-theme section of the profile, or unlock them. */
  onToggleLocks: () => void;
  /** General settings (font, clock, locale, motion, kiosk cursor). */
  general: GeneralSettings | undefined;
  onGeneral: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
  dataApiUrl: string | undefined;
  onDataApiUrl: (url: string) => void;
}

/** What the Layout and Behaviour tabs edit besides the document props. */
export interface DashboardStudioProps {
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  /** The profile's pages (the page list, the Grid's other pages) and the write of its `rotate` option. */
  pages: ProfilePage[];
  onRotate: (patch: Partial<PageRotate>) => void;
  onMovePage: (id: string, toIndex: number) => void;
  onAddPage: () => void;
  /** Ask to delete a page (the page tabs confirm it). */
  onDeletePage: (id: string) => void;
  /** The studio window, for "Use this window's size". */
  windowSize: { width: number; height: number };
  /** ⋯ Rename in the Profiles panel: focus the Name field (a counter), and report it done. */
  renameRequest: number | undefined;
  onRenameHandled: () => void;
  /** The sensor pickers' "Open data explorer" (the island's sensor). */
  onOpenExplorer: () => void;
  /** Studio › Theme (the widget theme's editor). */
  onOpenTheme: () => void;
  /** The Library (the background pickers' empty state). */
  onOpenLibrary: () => void;
  /** Back to the Page inspector. */
  onBack: () => void;
}

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

const TAB_INFO = {
  layout: { icon: <Proportions className="h-4 w-4" />, description: "Size, grid and spacing for this profile." },
  look: { icon: <Palette className="h-4 w-4" />, description: "Theme, widget style and background." },
  behaviour: { icon: <Zap className="h-4 w-4" />, description: "Pages, pop-up alerts and performance." },
};

/**
 * The inspector with nothing selected: the settings of the profile being edited, in the tabs
 * Layout · Look · Behaviour. The registry (`inspector-model`) places each section; Look's and
 * Performance's switches choose between the dashboard's value and the profile's own.
 */
export function DocumentInspector(props: DocumentInspectorProps & DashboardStudioProps) {
  return <DocumentSheet {...props} />;
}

function DocumentSheet({
  jumpTo,
  config,
  theme,
  radius,
  onToken,
  onThemePreset,
  dashboardStyle,
  onStyle,
  presets,
  background,
  profile,
  onProfileTheme,
  onBackground,
  onScope,
  onRadius,
  onPerformance,
  onToggleLocks,
  general,
  onGeneral,
  dataApiUrl,
  onDataApiUrl,
  updateProfile,
  pages,
  onRotate,
  onMovePage,
  onAddPage,
  onDeletePage,
  windowSize,
  renameRequest,
  onRenameHandled,
  onOpenExplorer,
  onOpenTheme,
  onOpenLibrary,
  onBack,
}: DocumentInspectorProps & DashboardStudioProps) {
  const [quickBar, setQuickBar] = useQuickBarPref();
  const [accordion, setAccordion] = useAccordionPref();
  const scopes = {
    theme: scopeOf(profile, "theme"),
    style: scopeOf(profile, "style"),
    background: scopeOf(profile, "background"),
    performance: scopeOf(profile, "performance"),
    font: scopeOf(profile, "font"),
  };
  const count = config.profiles.length;
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const context: InspectorContext = { kind: "dashboard", scope: "all", profileName: profile.name };

  // The Widget style switch picks where the skins, presets, surface and its numbers are written.
  const styleScope = scopes.style;
  const change = (fn: (style: ModuleSettings) => ModuleSettings) => onStyle(styleScope, fn);
  const profileStyle = profile.widgetTheme?.values;
  const values = globalStyleValues(styleScope, dashboardStyle, profileStyle);
  const fields: FieldsApi = {
    values,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v) => change((s) => ({ ...s, [key]: v })),
    onPatch: (patch) => change((s) => ({ ...s, ...patch })),
    onClear: (keys) => change((s) => dropKeys(s, new Set(keys)) ?? {}),
  };
  // The look the presets are compared with: the scope's theme and style over the dashboard's.
  const shownTheme = resolveTheme({ theme, radius }, styleScope === "all" ? undefined : profile);
  const currentLook: CurrentLook = {
    tokens: shownTheme.tokens,
    radius: shownTheme.radius,
    style: styleScope === "all" ? dashboardStyle : { ...dashboardStyle, ...profileStyle },
  };
  // The scope's stored look, no defaults: an unset surface is not glass when a skin is chosen.
  const scoped: ModuleSettings = { ...values.inherited, ...values.own };
  // The clocks' 12 / 24 h is the all-profiles style's themed `clock` (config v7).
  const hours = dashboardStyle?.clock === undefined ? undefined : String(dashboardStyle.clock);
  const setHours = (v: string | undefined) =>
    onStyle("all", (s) => (v === undefined ? (dropKeys(s, new Set(["clock"])) ?? {}) : { ...s, clock: v }));
  const resolved = resolveGeneral({ general });

  /** A scoped section's header: the dot, and the switch that picks the dashboard's value or the profile's own. */
  const scopedHeader = (section: ScopedSection, label: string): Pick<SectionParts, "actions" | "pill"> => ({
    pill: <ScopeDot scope={scopes[section]} />,
    actions: <ScopeSwitch scope={scopes[section]} onScope={(scope) => onScope(section, scope)} label={label} />,
  });

  const parts = (s: InspectorSection): SectionParts => {
    switch (s.special) {
      case "layoutScreen":
        return {
          body: (
            <ScreenSection
              profile={profile}
              updateProfile={updateProfile}
              windowSize={windowSize}
              renameRequest={renameRequest}
              onRenameHandled={onRenameHandled}
            />
          ),
        };
      case "layoutGrid":
        return {
          body: (
            <GridSection
              profile={profile}
              updateProfile={updateProfile}
              otherZones={pages.filter((pg) => pg.id !== profile.pageId).flatMap((pg) => pg.placements)}
            />
          ),
        };
      case "lookTheme":
        return {
          ...scopedHeader("theme", "Theme"),
          body: (
            <ThemeBody
              scope={scopes.theme}
              count={count}
              name={profile.name}
              dashboard={{ theme, radius }}
              profile={{ theme: profile.theme, radius: profile.radius }}
              onToken={onToken}
              onPreset={onThemePreset}
              onProfileTheme={onProfileTheme}
              onRadius={(r) => onRadius(scopes.theme, r)}
              font={resolved.font}
              onFont={(font) => onGeneral("font", font === "system" ? undefined : font)}
            />
          ),
        };
      case "lookStyle":
        return {
          ...scopedHeader("style", "Widget style"),
          body: (
            <StyleBody
              scope={styleScope}
              count={count}
              name={profile.name}
              scoped={scoped}
              look={currentLook}
              presets={presets}
              onChange={change}
              lock={lockState(profile.widgetTheme)}
              onToggleLock={onToggleLocks}
              onOpenTheme={onOpenTheme}
            />
          ),
        };
      case "lookBackground": {
        const scope = scopes.background;
        return {
          ...scopedHeader("background", "Background"),
          body: (
            <BackgroundBody
              scope={scope}
              count={count}
              name={profile.name}
              value={(scope === "all" ? background : profile.background) ?? { type: "none" }}
              profileId={profile.id}
              onChange={(bg) => onBackground(scope, bg)}
              onOpenLibrary={onOpenLibrary}
            />
          ),
        };
      }
      case "behaviourPages":
        return {
          body: (
            <PagesBody
              pages={pages}
              rotate={profile.rotate}
              onMove={onMovePage}
              onAdd={onAddPage}
              onDelete={onDeletePage}
              onRotate={onRotate}
              pageNav={resolved.kioskPageNav}
              onPageNav={(on) => onGeneral("kioskPageNav", on ? true : undefined)}
            />
          ),
        };
      case "behaviourIsland":
        return {
          body: (
            <div className="space-y-3">
              <p className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">
                Widgets with “Send to island” on appear here briefly — a new song, rain starting.
              </p>
              <IslandSection
                island={profile.island}
                onChange={(patch) => updateProfile((p) => withIsland(p, patch), "profile:island")}
                onOpenExplorer={onOpenExplorer}
              />
            </div>
          ),
        };
      case "behaviourPerformance":
        return {
          ...scopedHeader("performance", "Performance"),
          body: (
            <PerformanceBody
              scope={scopes.performance}
              count={count}
              name={profile.name}
              general={general}
              performance={profile.performance}
              onGeneral={onGeneral}
              onPerformance={onPerformance}
            />
          ),
        };
      case "behaviourClock":
        return { body: <ClockBody general={general} hours={hours} onHours={setHours} onGeneral={onGeneral} /> };
      case "behaviourDisplay":
        return {
          body: <DisplayBody hideCursor={resolved.hideCursor} onHideCursor={(on) => onGeneral("hideCursor", on ? true : undefined)} />,
        };
      case "behaviourStudio":
        return {
          body: (
            <div className="space-y-2">
              <ToggleRow
                label="Quick bar"
                hint="The pinned settings of the selected widget, over the canvas. A browser preference"
                value={quickBar}
                onChange={setQuickBar}
              />
              <SegmentedRow
                label="Inspector sections"
                hint="One open: opening a section closes the others in its tab. A browser preference"
                options={ACCORDION_MODES}
                value={accordion}
                onChange={(m) => setAccordion(m as AccordionMode)}
              />
            </div>
          ),
        };
      case "behaviourConnection":
        return { body: <DataApiPanel value={dataApiUrl} onChange={onDataApiUrl} /> };
      default:
        return {};
    }
  };

  const notes = (tab: string | undefined): ReactNode =>
    tab === "look" ? (
      <InspectorNote>
        <LookNote name={profile.name} />
      </InspectorNote>
    ) : null;

  return (
    <InspectorView
      context={context}
      contextKey="dashboard"
      header={<ProfileHeader profile={stored} dashboard={config} onBack={onBack} />}
      fields={fields}
      parts={parts}
      notes={notes}
      query=""
      onQuery={() => {}}
      searchable={false}
      footer={isTauri() ? <AppSettingsFooter /> : null}
      tabInfo={TAB_INFO}
      jumpTo={jumpTo}
      identity={{
        icon: <Monitor />,
        name: profile.name,
        meta: () => "Profile settings",
        peekNote: "Tap a widget to edit it.",
      }}
    />
  );
}
