/**
 * A Studio widget on a Free page, selected (one-editor SPEC §5.5): the studio's own widget inspector (Show · Style ·
 * Data · Behaviour) over the widget's zone as the item stores it, with a Place section in px for the item's box and,
 * on a screen made for InfoPanel, the On InfoPanel section that picks what an export makes of it. Every edit is one
 * step of the screen's history, through the canvas editor.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { HistorySetter } from "@/hooks/use-config-history";
import { uid, type DashboardConfig, type Placement, type ProfileView, type Widget } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import type { Appearance } from "@/lib/style-resolve";
import type { NavTarget } from "@/components/studio/studio-nav";
import { cn } from "@/lib/utils";
import { checkGeometry, type GeoField } from "@/lib/infopanel/canvas-edit";
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

/** What a Free page's Studio widgets need from the studio around the editor: its config, theme and ways out. */
export interface WidgetHost {
  config: DashboardConfig;
  /** The screen's page as Edit shows it (its grid limits, data usage and theme). */
  profile: ProfileView;
  appearance: Appearance;
  /** The screen's own theme colours, when it has them (the dashboard's apply everywhere else). */
  scope?: CSSProperties;
  setConfig: HistorySetter;
  navigateTo: (target: NavTarget) => void;
  onHelp: () => void;
  onSaveStyle: (name: string, settings: ModuleSettings) => void;
  onUpdateStyle: (id: string, settings: ModuleSettings) => void;
}

const INPUT = "h-7 w-full min-w-0 rounded-[6px] border bg-ui-raised px-2 font-ui-mono text-[12px] text-ui-1 outline-none focus:border-ui-accent";
const PLACE: { field: GeoField; label: string }[] = [
  { field: "X", label: "X" },
  { field: "Y", label: "Y" },
  { field: "Width", label: "W" },
  { field: "Height", label: "H" },
];

/** One number of the Place section: a draft while typing, stored on Enter or leaving. */
function PlaceInput({ label, value, onCommit }: { label: string; value: number; onCommit: (raw: string) => string | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setError(onCommit(draft));
    setDraft(null);
  };
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] text-ui-4">{label}</span>
      <input
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error !== null}
        title={error ?? undefined}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
        className={cn(INPUT, error ? "border-ui-danger" : "border-ui-default")}
      />
    </label>
  );
}

/** Place on a Free page: the host item's box, in px. */
function PlaceSection({ editor, path, item }: { editor: CanvasEditor; path: Path; item: DisplayItem }) {
  const o = item as unknown as Record<GeoField, number>;
  return (
    <div className="mt-2.5" role="group" aria-label="Position and size (px)">
      <div className="mb-1.5 text-[11px] font-medium text-ui-3">Position and size (px)</div>
      <div className="grid grid-cols-4 gap-2">
        {PLACE.map(({ field, label }) => (
          <PlaceInput
            key={field}
            label={label}
            value={o[field]}
            onCommit={(raw) => {
              const r = checkGeometry(item.kind, field, raw);
              if (!r.ok) return r.message;
              const value = field === "Width" || field === "Height" ? Math.max(1, r.value) : r.value;
              if (value !== o[field]) editor.setField(path, field, value, `canvas-field:${editor.zone.id}:${path}:${field}`);
              return null;
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface WidgetItemInspectorProps {
  editor: CanvasEditor;
  path: Path;
  item: DisplayItem;
  host: WidgetHost;
}

export function WidgetItemInspector({ editor, path, item, host }: WidgetItemInspectorProps) {
  const toast = useToast();
  const widget = widgetOf(item)!;
  const zone = useMemo(() => zoneOfWidget(widget, path), [widget, path]);
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
    <div className="mt-2.5">
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
      place={<PlaceSection editor={editor} path={path} item={item} />}
      onInfoPanel={onInfoPanel}
    />
  );
}
