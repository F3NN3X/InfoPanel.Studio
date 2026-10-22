import { modules } from "@/modules";
import { BLANK_MODULE } from "@/lib/layout";
import { blankSensorRule } from "@/lib/alert-presets";
import { useToast } from "@/components/ui/toast";
import { allLocked } from "@/lib/theme-model";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { Appearance } from "@/lib/style-resolve";
import { addRule, alertsKey } from "./alerts-model";
import { followAll, toggleEnforce } from "./appearance-actions";
import { buildCommands, type CommandAction } from "./commands";
import { openExportSheet, openImportDoor } from "./file-doors";
import { insertables } from "./insert-panel";
import { widgetContext, type InspectorContext } from "./inspector-model";
import { toggleAdvanced } from "./inspector/inspector-prefs";
import { zoneDefs } from "./inspector/zone-fields";
import { panelWidgetActions } from "./panel-widget-actions";
import { ownStyle } from "./studio-actions";
import type { useStyleEdits } from "./use-style-edits";
import type { StudioMutations } from "./use-studio-mutations";
import type { StudioSelection } from "./use-studio-selection";
import { useStudioShortcuts, type ShortcutAction } from "./use-studio-shortcuts";
import type { StudioUi } from "./use-studio-ui";

interface CommandDeps {
  config: DashboardConfig;
  profile: ProfileView;
  setConfig: HistorySetter;
  history: { undo: () => void; redo: () => void; dragging: () => boolean; canUndo: boolean; canRedo: boolean };
  ui: StudioUi;
  sel: StudioSelection;
  edit: StudioMutations;
  appearance: Appearance;
  appearancePresets: ReturnType<typeof useStyleEdits>["appearancePresets"];
  setScopeStyle: ReturnType<typeof useStyleEdits>["setScopeStyle"];
  /** Show another page of the profile on the canvas. */
  onPageChange: (pageId: string) => void;
  /** Select a screen for editing. */
  onSelectProfile: (id: string) => void;
  /** Open Help at the article for where the user is. */
  onHelp: () => void;
}

/**
 * The studio's keyboard shortcuts and command palette: both run the same
 * actions as the mouse (`runCommand`). Also the palette's command list
 * and `focusZone` (select a zone and scroll it into view).
 */
export function useStudioCommands({
  config,
  profile,
  setConfig,
  history,
  ui,
  sel,
  edit,
  appearance,
  appearancePresets,
  setScopeStyle,
  onPageChange,
  onSelectProfile,
  onHelp,
}: CommandDeps) {
  const { selected, selectedWidget } = sel;
  const toast = useToast();
  const pages = (config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0]).pages;
  const currentPage = profile.pageId ?? pages[0].id;

  /** Select a zone (Layers drawer, palette) and bring it into view on the canvas. */
  const focusZone = (id: string) => {
    sel.select(id);
    requestAnimationFrame(() =>
      ui.scrollRef.current
        ?.querySelector(`[data-zone-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
    );
  };

  /** Esc: clear the settings search, else step out (widget → zones → none). Sources has its own. */
  const escape = () => {
    if (ui.showSources) return;
    if (ui.inspectorQuery !== "") ui.setInspectorQuery("");
    else if (selectedWidget) sel.clearWidget();
    else if (sel.selectedIds.length > 0) sel.select(null);
  };

  /** The primary panel's widget edits (inspector, canvas keys, palette). */
  const widgetActions = selected?.panel
    ? panelWidgetActions({
        placement: selected,
        update: edit.updateSelected,
        selectedWidgetId: sel.selectedWidgetId,
        onSelectWidget: (id) => sel.selectWidget(selected.id, id),
        widgetClipboard: ui.widgetClipboard,
        onCopyWidget: ui.setWidgetClipboard,
      })
    : null;

  useStudioShortcuts((action: ShortcutAction) => {
    switch (action.type) {
      case "nudge":
        return edit.moveSelection(action);
      case "resize":
        return edit.resizePrimary(action);
      case "escape":
        return escape();
      case "palette":
        return ui.setPaletteOpen(true);
      case "settings":
        return ui.navigateTo({ view: "settings" });
      case "cheatsheet":
        return ui.setShortcutsOpen(true);
      default:
        return runCommand(action);
    }
  }, selectedWidget !== null, history.dragging);

  /** Carry out a command palette entry (or a shortcut with the same action). */
  const runCommand = (action: CommandAction) => {
    switch (action.type) {
      case "add-module":
        ui.setMode("design");
        return edit.addPlacement(action.id);
      case "add-preset":
        ui.setMode("design");
        return edit.addPanelPresetById(action.id);
      case "alert-new": {
        const rule = blankSensorRule();
        ui.navigateTo({ view: "alerts", tab: "rules" });
        ui.setAlertRule(rule.id);
        return setConfig((c) => addRule(c, rule), alertsKey(`add:${rule.id}`));
      }
      case "profile":
        // "auto" is the app-opens rule; a profile id selects it for editing.
        return action.id === "auto" ? edit.activateProfile("auto") : onSelectProfile(action.id);
      case "drawer":
        return ui.openDrawer(action.drawer);
      case "toggle-dock":
        // Collapse the docked inspector, or open / close the floating one (Sources has none).
        return !ui.showSources && ui.studioLayout.toggleInspector();
      case "live":
        return ui.setLiveOpen(true);
      case "help":
        return onHelp();
      case "toggle-advanced":
        return toggleAdvanced();
      case "toggle-grid":
        return ui.setShowGrid((s) => !s);
      case "zoom-fit":
        return ui.fitZoom();
      case "zoom-in":
        return ui.zoomStep(1);
      case "zoom-out":
        return ui.zoomStep(-1);
      case "save":
        return ui.handleSave();
      case "export":
        return openExportSheet();
      case "import":
        return openImportDoor();
      case "undo":
        return history.undo();
      case "redo":
        return history.redo();
      case "shortcuts":
        return ui.setShortcutsOpen(true);
      case "select":
        ui.setMode("design");
        return focusZone(action.id);
      case "select-all":
        return sel.selectAll();
      case "goto-card":
        ui.setInspectorQuery("");
        return ui.jumpInspector(action.id);
      case "goto-setting":
        ui.setMode("design");
        ui.setInspectorQuery("");
        return ui.jumpInspector(action.section, action.key);
      case "navigate":
        return ui.navigateTo(action.target);
      case "follow-all":
        return edit.updateProfile(followAll);
      case "toggle-enforce":
        return setConfig((c) => toggleEnforce(c, profile));
      case "goto-theme-setting":
        // The editor mounts at its current scope first; then it opens the section and focuses the row.
        ui.setMode("theme");
        ui.setInspectorQuery("");
        return void requestAnimationFrame(() => ui.jumpTheme(action.section, action.key));
      case "open-theme":
        return ui.navigateTo({ view: "theme", section: action.section });
      case "deselect":
        return sel.select(null);
      case "sample-layout":
        return edit.loadSampleLayout();
      case "page-go":
        ui.setMode("design");
        return onPageChange(action.id);
      case "page-next":
        return edit.stepPage(1);
      case "page-prev":
        return edit.stepPage(-1);
      case "page-add":
        ui.setMode("design");
        return edit.addNewPage();
      case "page-duplicate":
        ui.setMode("design");
        return edit.duplicateCurrentPage(currentPage);
      case "page-delete":
        ui.setMode("design");
        return pages.length > 1 ? ui.setDeletingPage(currentPage) : toast("A screen needs at least one page");
      case "page-rename":
        ui.setMode("design");
        return ui.setRenamingPage(currentPage);
      case "move-to-page":
        return edit.moveSelectionToPage(action.id);
      case "apply-appearance": {
        const preset = appearancePresets.presets.find((p) => p.id === action.id);
        return preset && appearancePresets.apply(preset, { level: "all" });
      }
    }
    if (!selected) return;
    switch (action.type) {
      case "duplicate":
        return edit.duplicateSelection();
      case "toggle-visible":
        return edit.toggleSelectionVisible();
      case "remove":
        return edit.removeSelection();
      case "pick-widget":
        return ui.setPickerFor(selected.id);
      case "edit-style":
        ui.setMode("design");
        ui.setInspectorQuery("");
        ui.jumpInspector("colors");
        return ui.requestInspectorTab("style");
      case "bind-data":
        ui.setMode("design");
        return ui.requestInspectorTab("data", true);
      case "copy-style":
        ui.setStyleClipboard(ownStyle(selected, appearance));
        return toast("Style copied");
      case "paste-style":
        if (!ui.styleClipboard) return;
        edit.pasteStyleSelection(ui.styleClipboard);
        return toast("Style pasted");
      case "follow-global":
        return edit.followGlobalSelection();
      case "use-global": {
        const style = ownStyle(selected, appearance);
        setScopeStyle(action.target, () => style);
        return toast(action.target === "all" ? "Style is now the theme for all screens" : "Style is now the theme for this screen");
      }
      case "resize-step": {
        const rect = edit.resizeSelected({
          cols: selected.colSpan + action.cols,
          rows: selected.rowSpan + action.rows,
        });
        return rect && edit.setZoneRect(selected.id, rect);
      }
      case "save-panel-preset":
        ui.setMode("design");
        ui.setInspectorQuery("");
        ui.jumpInspector("panel");
        return ui.setPresetNaming(true);
      case "select-widget":
        return sel.selectWidget(selected.id, action.id);
    }
    if (!widgetActions || !selectedWidget) return;
    const id = selectedWidget.id;
    switch (action.type) {
      case "widget-remove":
        return widgetActions.remove(id);
      case "widget-duplicate":
        return widgetActions.duplicate(id);
      case "widget-copy":
        return widgetActions.copy(id);
      case "widget-paste":
        return widgetActions.paste(id);
      case "widget-move":
        return widgetActions.step(id, action.delta);
    }
  };

  /** What the inspector shows now, for the palette's "Go to setting" entries. */
  const inspectorContext = (): InspectorContext | null => {
    if (sel.selection.length > 1) return null;
    if (!selected) return null;
    if (selected.module === BLANK_MODULE) return null;
    // A selected panel widget: its own inspector (the layout only shows which rows it has).
    if (selected.panel && selectedWidget) {
      const layout = selected.panel.layout;
      return { kind: "item", widget: selectedWidget, layout: layout === "grid" || layout === "overlay" ? layout : "stack" };
    }
    const mod = selected.panel ? undefined : modules.find((m) => m.id === selected.module);
    if (mod) return widgetContext(mod);
    return { kind: selected.panel ? "panel" : "widget", defs: zoneDefs(selected) } as InspectorContext;
  };
  const commands = ui.paletteOpen
    ? buildCommands({
        insertables: insertables(config.panelPresets),
        profiles: config.profiles,
        pages,
        currentPage,
        placements: profile.placements,
        selected,
        selection: sel.selection,
        context: inspectorContext(),
        widget: selectedWidget,
        canPasteWidget: ui.widgetClipboard !== null,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        showGrid: ui.showGrid,
        enforced: allLocked(appearance.profile),
        appearancePresets: appearancePresets.presets,
      })
    : [];

  return { runCommand, commands, focusZone };
}
