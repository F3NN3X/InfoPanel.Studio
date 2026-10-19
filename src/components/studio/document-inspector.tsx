import { useState } from "react";
import type { PageBackground } from "@/lib/appearance";
import type { GeneralSettings } from "@/lib/general";
import type { PageRotate, ProfilePage, ProfileView } from "@/lib/layout";
import type { WidgetTheme } from "@/lib/theme-model";
import { THEME_PRESETS, resolveTheme, type ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { AppearanceGallery, type CurrentLook } from "./appearance-gallery";
import { AppearanceScope, type AppearanceTarget } from "./appearance-panel";
import { BackgroundPanel, type BackgroundTarget } from "./background-panel";
import { DataApiPanel } from "./data-api-panel";
import { generalCards } from "./general-panel";
import { InspectorNote, InspectorView, type SectionParts } from "./inspector/inspector-view";
import { AutoPick, AutoRotate, ProfileFields, ProfileInherit } from "./inspector/profile-sections";
import { IslandSection } from "./inspector/island-section";
import { useAccordionPref, useQuickBarPref, type AccordionMode } from "./inspector/inspector-prefs";
import { withIsland } from "@/lib/island/config";
import {
  globalStyleValues,
  inspectorNotes,
  type InspectorContext,
  type InspectorSection,
} from "./inspector-model";
import { ProfileThemePanel, type ProfileTheme } from "./profile-theme-panel";
import { SkinGallery } from "./skin-gallery";
import { CardEffects, SurfacePicker } from "./surface-picker";
import type { FieldsApi } from "./settings-panel";
import { SegmentedRow, ToggleRow } from "./setting-rows";
import { dropKeys } from "./settings-model";
import { ThemePanel } from "./theme-panel";
import type { AppearancePresetsApi } from "./use-appearance-presets";
import { LayoutDashboard } from "lucide-react";
import { DashboardHeader, changedLabel } from "./zone-inspector-parts";
import { shownValue } from "./inspector/zone-fields";

/** The parts of the dashboard inspector the palette's "Appearance…" and friends jump to. */
export type DocumentTab = "appearance" | "background" | "general" | "connection";

/** The section each part jumps to (its document card id). */
export const DOCUMENT_CARD: Record<DocumentTab, string> = {
  appearance: "doc:appearance",
  background: "doc:background",
  general: "doc:type",
  connection: "doc:connection",
};

export interface DocumentInspectorProps {
  /** Open, reveal and outline a section whenever `seq` changes (the palette's document commands). */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The settings search (the studio's Esc clears it). */
  query: string;
  onQuery: (query: string) => void;
  /** The Changed filter (only values set here, across every tab). */
  changedOnly: boolean;
  onChangedOnly: (on: boolean) => void;
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
  /** The active profile (its own background and widget theme, and its name). */
  profile: {
    id: string;
    name: string;
    background?: PageBackground;
    widgetTheme?: WidgetTheme;
    theme?: Partial<ThemeTokens>;
    radius?: number;
  };
  /** Set the active profile's own theme colours / radius (both unset = inherit). */
  onProfileTheme: (next: ProfileTheme, key?: string) => void;
  onBackground: (target: BackgroundTarget, bg: PageBackground | undefined) => void;
  /** General settings (font, clock, locale, motion, kiosk cursor). */
  general: GeneralSettings | undefined;
  onGeneral: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
  dataApiUrl: string | undefined;
  onDataApiUrl: (url: string) => void;
}

/** What the Profile and General tabs edit besides the document props. */
export interface DashboardStudioProps {
  /** The active profile, whole (Profile tab). */
  activeProfile: ProfileView;
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  canRemoveProfile: boolean;
  onRemoveProfile: () => void;
  /** The config picks the profile by window size ("auto"). */
  autoPick: boolean;
  onAutoPick: (auto: boolean) => void;
  /** The active profile's pages (Auto-rotate's checklist) and the write of its `rotate` option. */
  pages: ProfilePage[];
  onRotate: (patch: Partial<PageRotate>) => void;
  /** The sensor pickers' "Open data explorer" (the island's sensor). */
  onOpenExplorer: () => void;
  /** Studio › Theme (the widget theme's editor). */
  onOpenTheme: () => void;
}

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

/**
 * The inspector with nothing selected: the Dashboard, in the tabs Profile ·
 * Appearance · General (README §4.7; the widget theme is Studio › Theme), with the same
 * sections, dots, search and More rows as a zone. The registry
 * places the existing cards (scope and force, presets, theme, page
 * background, general, connection) into its sections.
 */
export function DocumentInspector(props: DocumentInspectorProps & DashboardStudioProps) {
  // Remount per profile: the scope starts where this profile has its own settings.
  return <DocumentSheet key={props.profile.id} {...props} />;
}

function DocumentSheet({
  jumpTo,
  query,
  onQuery,
  changedOnly,
  onChangedOnly,
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
  general,
  onGeneral,
  dataApiUrl,
  onDataApiUrl,
  activeProfile,
  updateProfile,
  canRemoveProfile,
  onRemoveProfile,
  autoPick,
  onAutoPick,
  pages,
  onRotate,
  onOpenExplorer,
  onOpenTheme,
}: DocumentInspectorProps & DashboardStudioProps) {
  const [quickBar, setQuickBar] = useQuickBarPref();
  const [accordion, setAccordion] = useAccordionPref();
  const [target, setTarget] = useState<AppearanceTarget>(
    // A profile with its own look or background opens on it: editing "All profiles" would not show there.
    profile.widgetTheme || profile.background ? "profile" : "all"
  );
  const all = target === "all";
  const context: InspectorContext = { kind: "dashboard", scope: target, profileName: profile.name };

  const change = (fn: (style: ModuleSettings) => ModuleSettings) => onStyle(target, fn);
  const profileStyle = profile.widgetTheme?.values;
  const values = globalStyleValues(target, dashboardStyle, profileStyle);
  const fields: FieldsApi = {
    values,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v) => change((s) => ({ ...s, [key]: v })),
    onPatch: (patch) => change((s) => ({ ...s, ...patch })),
    onClear: (keys) => change((s) => dropKeys(s, new Set(keys)) ?? {}),
  };
  // The look the presets are compared with: the scope's theme and style over the dashboard's.
  const shownTheme = resolveTheme({ theme, radius }, all ? undefined : profile);
  const currentLook: CurrentLook = {
    tokens: shownTheme.tokens,
    radius: shownTheme.radius,
    style: all ? dashboardStyle : { ...dashboardStyle, ...profileStyle },
  };
  // The scope's stored look, no defaults: an unset surface is not glass when a skin is chosen.
  const scoped: ModuleSettings = { ...values.inherited, ...values.own };
  // The clocks' 12 / 24 h is the all-profiles style's themed `clock` (config v7).
  const hours = {
    value: dashboardStyle?.clock === undefined ? undefined : String(dashboardStyle.clock),
    onChange: (v: string | undefined) => onStyle("all", (s) => (v === undefined ? (dropKeys(s, new Set(["clock"])) ?? {}) : { ...s, clock: v })),
  };
  const generalById = new Map(generalCards(general, onGeneral, hours).map((c) => [c.id, c] as const));

  const themeEditor = all ? (
    <ThemePanel
      tokens={theme}
      presetName={
        THEME_PRESETS.find((p) => JSON.stringify(p.tokens) === JSON.stringify(theme))?.name ?? "custom"
      }
      onToken={onToken}
      onPreset={onThemePreset}
      query={query}
    />
  ) : (
    <ProfileThemePanel
      dashboard={{ theme, radius }}
      profile={{ theme: profile.theme, radius: profile.radius }}
      profileName={profile.name}
      onChange={onProfileTheme}
      query={query}
    />
  );

  const parts = (s: InspectorSection): SectionParts => {
    switch (s.special) {
      case "profileFields":
        return {
          body: (
            <ProfileFields
              profile={activeProfile}
              updateProfile={updateProfile}
              canRemove={canRemoveProfile}
              onRemove={onRemoveProfile}
              dashboardRadius={radius}
              otherZones={pages.filter((pg) => pg.id !== activeProfile.pageId).flatMap((pg) => pg.placements)}
            />
          ),
        };
      case "profileInherit":
        return {
          body: (
            <ProfileInherit
              profile={activeProfile}
              dashboardTheme={{ theme, radius }}
              dashboardBackground={background}
              onProfileTheme={onProfileTheme}
              onBackground={onBackground}
              updateProfile={updateProfile}
            />
          ),
        };
      case "profileSelection":
        return { body: <AutoPick auto={autoPick} onAuto={onAutoPick} /> };
      case "profileRotate":
        return { body: <AutoRotate rotate={activeProfile.rotate} pages={pages} onChange={onRotate} /> };
      case "profileIsland":
        return {
          body: (
            <IslandSection
              island={activeProfile.island}
              onChange={(patch) => updateProfile((p) => withIsland(p, patch), "profile:island")}
              onOpenExplorer={onOpenExplorer}
            />
          ),
        };
      case "scope":
        return {
          body: (
            <AppearanceScope target={target} onTarget={setTarget} onOpenTheme={onOpenTheme} />
          ),
        };
      case "presets":
        return {
          body: (
            <div className="space-y-4">
              <SkinGallery value={scoped.skin as string | undefined} onPick={(skin) => change((st) => ({ ...st, skin, surface: "auto" }))} />
              <AppearanceGallery api={presets} target={target} look={currentLook} />
            </div>
          ),
        };
      case "theme":
        return {
          body: (
            <div className="space-y-4">
              <SurfacePicker
                surface={scoped.surface}
                skin={scoped.skin}
                accent={typeof scoped.accent === "string" ? scoped.accent : undefined}
                onPick={(surface) => change((st) => ({ ...st, surface }))}
              />
              <CardEffects
                opacity={scoped.surfaceOpacity}
                blur={scoped.blur}
                onOpacity={(surfaceOpacity) => change((st) => ({ ...st, surfaceOpacity }))}
                onBlur={(blur) => change((st) => ({ ...st, blur }))}
              />
              {themeEditor}
            </div>
          ),
        };
      case "pageBackground":
        return {
          body: (
            <BackgroundPanel
              target={target}
              onTarget={setTarget}
              dashboard={background}
              profileBackground={profile.background}
              profileName={profile.name}
              profileId={profile.id}
              onChange={onBackground}
            />
          ),
        };
      case "type":
      case "clock":
      case "display": {
        const card = s.cardId ? generalById.get(s.cardId) : undefined;
        return card ? { body: card.node, changed: card.changed, onReset: card.onReset } : {};
      }
      case "studio":
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
      case "connection":
        return { body: <DataApiPanel value={dataApiUrl} onChange={onDataApiUrl} /> };
      default:
        return {};
    }
  };

  const notes = (tab: Parameters<typeof inspectorNotes>[1]) =>
    inspectorNotes(context, tab).map((n) => <InspectorNote key={n.kind}>{n.text}</InspectorNote>);

  return (
    <InspectorView
      context={context}
      contextKey="dashboard"
      header={
        <DashboardHeader profileName={profile.name} />
      }
      fields={fields}
      parts={parts}
      notes={notes}
      query={query}
      onQuery={onQuery}
      changedOnly={changedOnly}
      onChangedOnly={onChangedOnly}
      jumpTo={jumpTo}
      identity={{
        icon: <LayoutDashboard />,
        name: "Dashboard",
        meta: (changed) => `${profile.name} · ${changedLabel(changed)}`,
        peekNote: "Tap a widget to edit it.",
      }}
    />
  );
}
