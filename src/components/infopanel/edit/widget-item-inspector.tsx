/**
 * A Studio widget on an imported profile's page, selected (Edit v3 SPEC §3.6, §10.2): the studio's own widget
 * inspector (Show · Style · Data · Behaviour) over the widget's zone as the item stores it, with the Place row on the
 * page's cells, its LAYER section and, on a screen made for InfoPanel, the On InfoPanel section that picks what an
 * export makes of it. Every edit is one
 * step of the screen's history, through the canvas editor.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { HistorySetter } from "@/hooks/use-config-history";
import { uid, type DashboardConfig, type Placement, type ProfileView, type Widget } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import type { Appearance } from "@/lib/style-resolve";
import type { NavTarget } from "@/components/studio/studio-nav";
import { itemAt, updateAt, type Path } from "@/lib/infopanel/editor/ops";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { tierOf } from "@/lib/infopanel/native/tiers";
import { widgetChoices, widgetOf, widgetRule, withWidget, WIDGET_PANEL } from "@/lib/infopanel/native/widget-item";
import { ZoneInspector } from "@/components/studio/zone-inspector";
import { savePanelPreset } from "@/components/studio/panel-preset-actions";
import { choiceHelp, OnInfoPanelSection } from "@/components/studio/inspector/on-infopanel-section";
import { useExportCheck } from "../export-check-panel";
import { widgetFromZone, zoneOfWidget } from "./widget-add";
import type { CanvasEditor } from "./use-canvas-editor";

/** What an imported profile's page's Studio widgets need from the studio around the editor: its config, theme and ways out. */
export interface WidgetHost {
  config: DashboardConfig;
  /** The screen's page as Edit shows it (its grid limits, data usage and theme). */
  profile: ProfileView;
  appearance: Appearance;
  /** The screen's own theme colours, when it has them (the built-in ones apply everywhere else). */
  scope?: CSSProperties;
  setConfig: HistorySetter;
  navigateTo: (target: NavTarget) => void;
  onHelp: () => void;
  onSaveStyle: (name: string, settings: ModuleSettings) => void;
  onUpdateStyle: (id: string, settings: ModuleSettings) => void;
}

interface WidgetItemInspectorProps {
  editor: CanvasEditor;
  path: Path;
  item: DisplayItem;
  host: WidgetHost;
  /** The Place row on the page's cells (SPEC §10.2: a widget only ever shows COL / ROW / W / H). */
  place?: ReactNode;
  /** The LAYER section, after the settings. */
  after?: ReactNode;
}

export function WidgetItemInspector({ editor, path, item, host, place, after }: WidgetItemInspectorProps) {
  const toast = useToast();
  const widget = widgetOf(item)!;
  // Visible is the item's Hidden, the eye in Layers: one state (sign-off round 1), so saved data keeps its shape.
  const zone = useMemo(() => ({ ...zoneOfWidget(widget, path), visible: item.Hidden !== true }), [widget, path, item.Hidden]);
  const [query, setQuery] = useState("");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Widget | null>(null);
  const [presetNaming, setPresetNaming] = useState(false);
  const check = useExportCheck();
  const row = check.on ? check.byPath.get(path) : undefined;

  /** The widget's zone changed by `fn`, written back to the item: one step, a `key` coalescing typing. */
  const update = (fn: (p: Placement) => Placement, key?: string) => {
    const current = widgetOf(itemAt(editor.committed, path));
    if (!current) return;
    const next = widgetFromZone(fn(zoneOfWidget(current, path)), current.onInfoPanel);
    editor.commit(
      updateAt(editor.committed, path, (it) => withWidget(it, next)),
      key ? `widget:${editor.zone.id}:${path}:${key}` : undefined,
    );
  };
  /** A change to the screen through its zones (bindings) reaches this widget's zone only. */
  const updateProfile = (fn: (p: ProfileView) => ProfileView, key?: string) => {
    const next = fn({ ...host.profile, placements: [zone] }).placements.find((p) => p.id === zone.id);
    if (next) update(() => next, key);
  };
  const setRule = (onInfoPanel: NonNullable<typeof widget.onInfoPanel>) => {
    const current = widgetOf(itemAt(editor.committed, path));
    if (current) editor.commit(updateAt(editor.committed, path, (it) => withWidget(it, { ...current, onInfoPanel })));
  };
  const explorer = () => host.navigateTo({ view: "data" });

  const rule = widgetRule(widget);
  const name = item.Name || widget.module;
  const onInfoPanel: ReactNode = row && (
    <div className="border-t border-ui-subtle px-3.5 py-3">
      <OnInfoPanelSection row={row} choice={{ options: widgetChoices(widget.module), value: rule, onChange: setRule }}>
        {choiceHelp(rule, name, widget.module === WIDGET_PANEL ? null : tierOf(widget.module))}
      </OnInfoPanelSection>
    </div>
  );

  return (
    <ZoneInspector
      placement={zone}
      config={host.config}
      profile={{ ...host.profile, placements: [zone] }}
      appearance={host.appearance}
      stylePresets={host.config.stylePresets ?? []}
      inherit={{ config: host.config, setConfig: host.setConfig, navigateTo: host.navigateTo }}
      widgetClipboard={clipboard}
      onCopyWidget={setClipboard}
      selectedWidgetId={selectedWidgetId}
      onSelectWidget={setSelectedWidgetId}
      onShowWidget={() => setQuery("")}
      query={query}
      onQuery={setQuery}
      update={update}
      updateProfile={updateProfile}
      onZoneBox={() => {}}
      onPickWidget={() => toast("To change the widget, add another from Add and remove this one")}
      onSavePreset={host.onSaveStyle}
      onUpdatePreset={host.onUpdateStyle}
      onToggleVisible={() => editor.setField(path, "Hidden", !item.Hidden)}
      onDuplicate={editor.duplicate}
      onRemove={editor.remove}
      onHelp={host.onHelp}
      presetNaming={presetNaming}
      onPresetNaming={setPresetNaming}
      onSavePanelPreset={(panelName) => {
        host.setConfig((c) => savePanelPreset(c, zone, uid("panelpreset"), panelName));
        setPresetNaming(false);
        toast(`Saved '${panelName}' to My panels`);
      }}
      onOpenPoint={explorer}
      onOpenExplorer={explorer}
      place={place}
      layer={after}
      onInfoPanel={onInfoPanel}
    />
  );
}
