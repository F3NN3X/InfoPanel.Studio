import { useEffect, useRef } from "react";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { DocumentInspector } from "./document-inspector";
import { PageInspector } from "./page-inspector";
import type { InheritanceContext } from "./use-inheritance";
import { setInspectorTab } from "./inspector/inspector-prefs";
import { MultiInspector } from "./inspector/multi-inspector";
import { InspectorChromeProvider, type InspectorChrome } from "./inspector-layout";
import type { useDocumentProps } from "./use-document-props";
import type { StudioMutations } from "./use-studio-mutations";
import type { StudioSelection } from "./use-studio-selection";
import type { StudioUi } from "./use-studio-ui";
import { ZoneInspector } from "./zone-inspector";

type DocumentState = ReturnType<typeof useDocumentProps>;

interface StudioInspectorProps {
  config: DashboardConfig;
  profile: ProfileView;
  /** The theme the zones render under. */
  appearance: Appearance;
  ui: StudioUi;
  sel: StudioSelection;
  edit: StudioMutations;
  documentProps: DocumentState["props"];
  /** The studio window ("Use this window's size"). */
  windowSize: { width: number; height: number };
  /** The history setter (the inheritance chips edit the config through it). */
  setConfig: InheritanceContext["setConfig"];
  /** F1: Help at the article for what the user is on. */
  onHelp: () => void;
  /** LIVE: send the kiosks of this screen to a page now. */
  onShowOnKiosks: (pageId: string) => void;
  /** Open a data point in Sources mode (a Bound data row); without it, Sources just opens. */
  onOpenPoint?: (key: string) => void;
  /** Open a canvas zone's items in the canvas editor. */
  onEditCanvas?: (zoneId: string) => void;
  /** Open a Custom gauge zone's spec in the Gauges page. */
  onEditGauge?: (zoneId: string) => void;
}

/**
 * The right (or docked) panel: one zone's inspector, the shared look of
 * several zones, or — with nothing selected — the Page inspector (the screen's
 * Layout / Look / Behaviour tabs, the old profile inspector, open from its links).
 */
export function StudioInspector({
  config,
  profile,
  appearance,
  ui,
  sel,
  edit,
  documentProps,
  windowSize,
  setConfig,
  onHelp,
  onShowOnKiosks,
  onOpenPoint,
  onEditCanvas,
  onEditGauge,
}: StudioInspectorProps) {
  const { selected, selectedWidgetId, selection } = sel;
  const { mode, sheet, setFloatOpen } = ui.studioLayout;
  const floating = mode !== "docked";
  /** Floating closes; the sheet's header collapses it to half and its strip picks a tool. */
  const chrome: InspectorChrome =
    mode === "sheet"
      ? {
          mode,
          onClose: () => sheet.setSnap("half"),
          sheet: { snap: sheet.snap, setSnap: sheet.setSnap, tool: sheet.tool, setTool: sheet.setTool },
        }
      : { mode, onClose: mode === "floating" ? () => setFloatOpen(false) : undefined };

  // The zoom bar's resolution button and a profile's settings ask for a Dashboard tab.
  const tabRequest = ui.documentTabRequest;
  const lastTabRequest = useRef(tabRequest?.seq);
  useEffect(() => {
    if (!tabRequest || tabRequest.seq === lastTabRequest.current) return;
    lastTabRequest.current = tabRequest.seq;
    setInspectorTab("dashboard", tabRequest.tab);
  }, [tabRequest]);

  const openExplorer = () => ui.setMode("sources");
  /** The theme at the screen's scope (the interim screen tabs' "Edit … in Theme"). */
  const editGlobalTheme = (level: "profile" | "page") =>
    ui.openTheme(level === "page" && profile.pageId ? { kind: "page", pageId: profile.pageId } : { kind: "profile" });

  const inheritCtx: InheritanceContext = { config, setConfig, navigateTo: ui.navigateTo };
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const page = stored.pages.find((pg) => pg.id === profile.pageId) ?? stored.pages[0];

  const body =
    selection.length > 1 ? (
      <MultiInspector
        zones={selection}
        appearance={appearance}
        updateProfile={edit.updateProfile}
        onDeselect={(id) => sel.select(id, "toggle")}
        onToggleVisible={edit.toggleSelectionVisible}
        onDuplicate={edit.duplicateSelection}
        onRemove={edit.removeSelection}
        query={ui.inspectorQuery}
        onQuery={ui.setInspectorQuery}
        jumpTo={ui.inspectorJump}
      />
    ) : selected ? (
      <ZoneInspector
        placement={selected}
        config={config}
        profile={profile}
        appearance={appearance}
        stylePresets={config.stylePresets ?? []}
        inherit={inheritCtx}
        jumpTo={ui.inspectorJump}
        request={ui.inspectorRequest}
        widgetClipboard={ui.widgetClipboard}
        onCopyWidget={ui.setWidgetClipboard}
        selectedWidgetId={selectedWidgetId}
        onSelectWidget={(id) => sel.selectWidget(selected.id, id)}
        onShowWidget={() => {
          ui.setInspectorQuery("");
          requestAnimationFrame(ui.revealEditor);
        }}
        query={ui.inspectorQuery}
        onQuery={ui.setInspectorQuery}
        update={edit.updateSelected}
        updateProfile={edit.updateProfile}
        onZoneBox={edit.setZoneBox}
        onPickWidget={() => ui.setPickerFor(selected.id)}
        onSavePreset={edit.saveStylePreset}
        onToggleVisible={() => edit.toggleVisible(selected.id)}
        onDuplicate={() => edit.duplicateZones([selected.id])}
        onRemove={() => edit.removePlacement(selected.id)}
        presetNaming={ui.presetNaming}
        onPresetNaming={ui.setPresetNaming}
        onSavePanelPreset={edit.savePanelAsPreset}
        onOpenPoint={onOpenPoint ?? openExplorer}
        onOpenExplorer={openExplorer}
        onEditCanvas={onEditCanvas && (() => onEditCanvas(selected.id))}
        onEditGauge={onEditGauge && (() => onEditGauge(selected.id))}
      />
    ) : !ui.screenSettingsOpen ? (
      <PageInspector
        profile={stored}
        page={page}
        inherit={inheritCtx}
        onRename={edit.renamePageTo}
        onIcon={ui.setIconPage}
        onDuplicate={edit.duplicateCurrentPage}
        onDelete={ui.setDeletingPage}
        onShowOnKiosks={() => onShowOnKiosks(page.id)}
        onHelp={onHelp}
        onOpenScreenSettings={ui.openDocumentTab}
      />
    ) : (
      <DocumentInspector
        jumpTo={ui.inspectorJump}
        {...documentProps}
        updateProfile={edit.updateProfile}
        pages={(config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0]).pages}
        onRotate={edit.setRotate}
        onMovePage={edit.movePageTo}
        onAddPage={edit.addNewPage}
        onDeletePage={ui.setDeletingPage}
        windowSize={windowSize}
        renameRequest={ui.renameRequest}
        onRenameHandled={ui.clearRename}
        onOpenExplorer={openExplorer}
        onOpenTheme={() => editGlobalTheme("profile")}
        onOpenLibrary={() => ui.setMode("library")}
        onBack={() => ui.setScreenSettingsOpen(false)}
      />
    );

  return (
    <aside
      ref={ui.inspectorRef}
      aria-label="Inspector"
      className={cn(
        "flex flex-col overflow-hidden bg-ui-panel font-ui text-ui-2",
        // Floating, the shell's card gives it its size, border and shadow.
        floating ? "h-full w-full" : "w-[320px] shrink-0 border-l border-ui-subtle"
      )}
    >
      <InspectorChromeProvider value={chrome}>
        {body}
      </InspectorChromeProvider>
    </aside>
  );
}
