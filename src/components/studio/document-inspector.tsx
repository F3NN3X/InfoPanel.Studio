import { Monitor, Proportions, Zap } from "lucide-react";
import { isTauri } from "@/lib/desktop";
import { withIsland } from "@/lib/island/config";
import { resolveGeneral, type GeneralSettings } from "@/lib/general";
import type { DashboardConfig, PageRotate, ProfilePage, ProfileView } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";
import { DataApiPanel } from "./data-api-panel";
import { AppSettingsFooter } from "./inspector/app-settings-footer";
import { InspectorView, type SectionParts } from "./inspector/inspector-view";
import { IslandSection } from "./inspector/island-section";
import { useAccordionPref, useQuickBarPref, type AccordionMode } from "./inspector/inspector-prefs";
import { ClockBody, DisplayBody, PagesBody, PerformanceBody, ScopeDot, ScopeSwitch } from "./inspector/profile-behaviour";
import { ProfileHeader } from "./inspector/profile-header";
import { GridSection, ScreenSection } from "./inspector/profile-layout";
import { scopeOf, type LookScope, type ScopedSection } from "./inspector/profile-scope";
import type { InspectorContext, InspectorSection } from "./inspector-model";
import type { FieldsApi } from "./settings-panel";
import { SegmentedRow, ToggleRow } from "./setting-rows";

export interface DocumentInspectorProps {
  /** Open, reveal and outline a section whenever `seq` changes (the palette's document commands). */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The dashboard: the profile count, and what the header's thumbnail inherits. */
  config: DashboardConfig;
  /** The profile being edited (its performance and name). */
  profile: ProfileView;
  /** The clocks' 12 / 24 h (the all-screens style's `clock`; unset = the locale's). */
  hours: string | undefined;
  onHours: (value: string | undefined) => void;
  /** Switch performance between the dashboard's value and the profile's own (starting from the shared one). */
  onScope: (section: ScopedSection, scope: LookScope) => void;
  /** Set the profile's frame rate or animations override. */
  onPerformance: (patch: PerformanceOverride) => void;
  /** General settings (clock, locale, motion, kiosk cursor). */
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
  /** Back to the Page inspector. */
  onBack: () => void;
}

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

const TAB_INFO = {
  layout: { icon: <Proportions className="h-4 w-4" />, description: "Size, grid and spacing for this profile." },
  behaviour: { icon: <Zap className="h-4 w-4" />, description: "Pages, pop-up alerts and performance." },
};

/**
 * The screen's settings the old profile inspector held, in the tabs Layout · Behaviour (the look
 * moved to Theme), until Screens and Settings take them. The registry (`inspector-model`) places
 * each section; Performance's switch chooses between the dashboard's value and the profile's own.
 */
export function DocumentInspector(props: DocumentInspectorProps & DashboardStudioProps) {
  return <DocumentSheet {...props} />;
}

function DocumentSheet({
  jumpTo,
  config,
  profile,
  hours,
  onHours,
  onScope,
  onPerformance,
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
  onBack,
}: DocumentInspectorProps & DashboardStudioProps) {
  const [quickBar, setQuickBar] = useQuickBarPref();
  const [accordion, setAccordion] = useAccordionPref();
  const scopes = { performance: scopeOf(profile, "performance") };
  const count = config.profiles.length;
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const context: InspectorContext = { kind: "dashboard", scope: "all", profileName: profile.name };
  // No schema rows here: every section is a custom body.
  const fields: FieldsApi = { values: {}, shown: (_key, def) => def.default, onChange: () => {}, onPatch: () => {}, onClear: () => {} };
  const resolved = resolveGeneral({ general });

  /** A scoped section's header: the dot, and the switch that picks the dashboard's value or the profile's own. */
  const scopedHeader = (section: "performance", label: string): Pick<SectionParts, "actions" | "pill"> => ({
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
        return { body: <ClockBody general={general} hours={hours} onHours={onHours} onGeneral={onGeneral} /> };
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

  return (
    <InspectorView
      context={context}
      contextKey="dashboard"
      header={<ProfileHeader profile={stored} dashboard={config} onBack={onBack} />}
      fields={fields}
      parts={parts}
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
