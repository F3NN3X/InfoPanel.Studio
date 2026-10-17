import { useEffect, useRef } from "react";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { DocumentInspector } from "./document-inspector";
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
  /** The global style the zones render under. */
  appearance: Appearance;
  ui: StudioUi;
  sel: StudioSelection;
  edit: StudioMutations;
  documentProps: DocumentState["props"];
  setScopeStyle: DocumentState["setScopeStyle"];
  /** Open a data point in Sources mode (a Bound data row); without it, Sources just opens. */
  onOpenPoint?: (key: string) => void;
  /** Open a canvas zone's items in the canvas editor. */
  onEditCanvas?: (zoneId: string) => void;
}

/**
 * The right (or docked) panel: one zone's inspector, the shared look of
 * several zones, or — with nothing selected — the Dashboard inspector.
 */
export function StudioInspector({
  config,
  profile,
  appearance,
  ui,
  sel,
  edit,
  documentProps,
  setScopeStyle,
  onOpenPoint,
  onEditCanvas,
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
  /** The Follow banner's "Edit global theme": Dashboard › Appearance. */
  const editGlobalTheme = () => {
    setInspectorTab("dashboard", "appearance");
    sel.select(null);
  };

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
        changedOnly={ui.inspectorChanged}
        onChangedOnly={ui.setInspectorChanged}
        jumpTo={ui.inspectorJump}
      />
    ) : selected ? (
      <ZoneInspector
        placement={selected}
        config={config}
        profile={profile}
        appearance={appearance}
        stylePresets={config.stylePresets ?? []}
        jumpTo={ui.inspectorJump}
        request={ui.inspectorRequest}
        styleClipboard={ui.styleClipboard}
        onCopyStyle={ui.setStyleClipboard}
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
        changedOnly={ui.inspectorChanged}
        onChangedOnly={ui.setInspectorChanged}
        update={edit.updateSelected}
        updateProfile={edit.updateProfile}
        onZoneBox={edit.setZoneBox}
        onPickWidget={() => ui.setPickerFor(selected.id)}
        onUseAsGlobal={(target, style) => setScopeStyle(target, () => style)}
        onSavePreset={edit.saveStylePreset}
        onDeletePreset={edit.deleteStylePreset}
        onToggleVisible={() => edit.toggleVisible(selected.id)}
        onDuplicate={() => edit.duplicateZones([selected.id])}
        onRemove={() => edit.removePlacement(selected.id)}
        presetNaming={ui.presetNaming}
        onPresetNaming={ui.setPresetNaming}
        onSavePanelPreset={edit.savePanelAsPreset}
        onEditGlobalTheme={editGlobalTheme}
        onOpenPoint={onOpenPoint ?? openExplorer}
        onOpenExplorer={openExplorer}
        onEditCanvas={onEditCanvas && (() => onEditCanvas(selected.id))}
      />
    ) : (
      <DocumentInspector
        jumpTo={ui.inspectorJump}
        query={ui.inspectorQuery}
        onQuery={ui.setInspectorQuery}
        changedOnly={ui.inspectorChanged}
        onChangedOnly={ui.setInspectorChanged}
        {...documentProps}
        activeProfile={profile}
        updateProfile={edit.updateProfile}
        canRemoveProfile={config.profiles.length > 1}
        onRemoveProfile={() => edit.removeProfile(profile.id)}
        autoPick={config.activeProfile === "auto"}
        onAutoPick={(auto) => edit.activateProfile(auto ? "auto" : profile.id)}
        pages={(config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0]).pages}
        onRotate={edit.setRotate}
        onOpenExplorer={openExplorer}
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
