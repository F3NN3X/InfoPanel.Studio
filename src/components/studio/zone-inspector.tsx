import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import { useSensorCatalog } from "@/lib/catalog";
import { CUSTOM_GAUGE_ID, widgetGauge } from "@/lib/gauge-studio/model";
import { BLANK_MODULE, CANVAS_ID, type DashboardConfig, type ProfileView, type Placement, type StylePreset, type Widget } from "@/lib/layout";
import { withPanelField } from "@/lib/panel-model";
import { lockedIn, type Appearance } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { settingKeys, type ModuleSettings } from "@/modules/types";
import type { AppearanceTarget } from "./appearance-panel";
import type { SheetCard } from "./category-sheet";
import { BoundData } from "./inspector/bound-data";
import { setInspectorTab } from "./inspector/inspector-prefs";
import { InspectorNote, InspectorView, type SectionParts } from "./inspector/inspector-view";
import { cardsBySection, panelState } from "./inspector/panel-cards";
import { useZoneData } from "./inspector/use-zone-data";
import { followFields, shownValue, shownValues, withoutSettings, withSettings, zoneDefs, zoneLookValues } from "./inspector/zone-fields";
import { zoneMeta, zoneName } from "./inspector/zone-meta";
import {
  inspectorNotes,
  isVisible,
  widgetContext,
  type InspectorContext,
  type InspectorSection,
  type SectionExtra,
} from "./inspector-model";
import type { InspectorTab } from "@/modules/types";
import { usePanelSheet } from "./panel-sheet";
import { ToggleRow } from "./setting-rows";
import type { FieldsApi } from "./settings-panel";
import { ownStyle, withPastedStyle, zoneMinSize } from "./studio-actions";
import { StyleTools } from "./style-tools";
import { widgetName } from "./widget-kinds";
import { ZoneFrameFields, zoneFrameSet } from "./zone-design-section";
import type { ZoneRect } from "./zone-geometry";
import { moduleIcon } from "./zone-icons";
import { WidgetPicker, ZoneBoxFields, ZoneHeader, changedLabel } from "./zone-inspector-parts";
import { pinsOf, setPin, useQuickPins } from "./inspector/inspector-prefs";
import { defaultQuickKeys } from "./quick-sets";

interface ZoneInspectorProps {
  placement: Placement;
  config: DashboardConfig;
  /** The active profile (its grid limits the placement row; its zones the data usage). */
  profile: ProfileView;
  /** The theme (all-profiles style, profile and page theme) the widget follows. */
  appearance: Appearance;
  stylePresets: StylePreset[];
  /** Open and reveal a section (the selection chip's Style, the palette) whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The style copied with "Copy" (session only, survives reselection). */
  styleClipboard: ModuleSettings | null;
  onCopyStyle: (style: ModuleSettings) => void;
  /** A panel widget copied with "Copy" (session only, survives reselection). */
  widgetClipboard: Widget | null;
  onCopyWidget: (widget: Widget) => void;
  /** A panel's selected widget (kept by the studio; the canvas selects too). */
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  /** Bring the selected widget's editor into view (its breadcrumb). */
  onShowWidget: () => void;
  /** The settings search (kept by the studio: "Go to setting" fills it). */
  query: string;
  onQuery: (query: string) => void;
  /** The Changed filter (only values set here, across every tab). */
  changedOnly: boolean;
  onChangedOnly: (on: boolean) => void;
  /** Mutate the placement; changes with the same `key` coalesce in undo. */
  update: (fn: (p: Placement) => Placement, key?: string) => void;
  /** Mutate the active profile (bindings). */
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  onZoneBox: (patch: Partial<ZoneRect>) => void;
  /** Open the widget picker for this zone. */
  onPickWidget: () => void;
  /** Make the widget's style the global style of every profile, or of this one. */
  onUseAsGlobal: (target: AppearanceTarget, style: ModuleSettings) => void;
  onSavePreset: (name: string, settings: ModuleSettings) => void;
  onDeletePreset: (id: string) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** A panel's "Save as panel preset" name input is open (the palette opens it too). */
  presetNaming: boolean;
  onPresetNaming: (open: boolean) => void;
  /** Save this panel zone to My panels. */
  onSavePanelPreset: (name: string) => void;
  /** A Follow bar's theme name: Studio › Theme. */
  onEditGlobalTheme: (level: "profile" | "page") => void;
  /** Open a bound point in Sources mode. */
  onOpenPoint: (key: string) => void;
  onOpenExplorer: () => void;
  /** Show a tab, and maybe the data picker, whenever `seq` changes (the zone context menu). */
  request?: { tab: InspectorTab; picker: boolean; seq: number };
  /** A canvas zone: open its items in the canvas editor. */
  onEditCanvas?: () => void;
  /** A Custom gauge zone: open its spec in the Gauges page. */
  onEditGauge?: () => void;
}

/** A Custom gauge zone's spec drawn small (at p = 0.6), with the way into its editor. */
function GaugeNote({ zone, onEdit }: { zone: Placement; onEdit: () => void }) {
  const id = useId();
  const gauge = widgetGauge(zone);
  const k = gauge ? Math.min(1, 64 / gauge.width, 64 / gauge.height) : 1;
  return (
    <InspectorNote>
      <span className="flex items-center gap-3">
        {gauge && (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
            <VectorGaugeSvg gauge={gauge} p={0.6} id={id} width={Math.floor(gauge.width * k)} height={Math.floor(gauge.height * k)} />
          </span>
        )}
        <span>
          A gauge you design on the Gauges page.{" "}
          <button type="button" onClick={onEdit} className="font-medium text-ui-accent-text hover:underline">
            Edit gauge…
          </button>
        </span>
      </span>
    </InspectorNote>
  );
}

/** The custom cards of a special section as one body (a caption over each when several share it). */
function cardParts(cards: SheetCard[], editor: boolean): SectionParts {
  return {
    body: cards.map((c) => (
      <div key={c.id} className="space-y-2">
        {c.node}
      </div>
    )),
    actions:
      cards.some((c) => c.actions) ? <span className="flex items-center gap-1">{cards.map((c) => c.actions && <span key={c.id}>{c.actions}</span>)}</span> : undefined,
    changed: cards.reduce((n, c) => n + (c.changed ?? 0), 0),
    onReset: () => cards.forEach((c) => c.onReset?.()),
    editor,
  };
}

/**
 * The inspector of one zone (README §4.6–4.7): the header (icon, editable
 * name, meta, Hide / Duplicate / Delete, the panel crumbs) and placement
 * row, then the registry's tabs — Show · Style · Data · Behaviour for widgets
 * and panels, Widget + Zone frame for a blank zone. The zone's custom UI
 * (widget picker, Follow / Custom, style tools, zone frame, a panel's
 * editors, Bound data) fills the sections the registry marks for it.
 */
export function ZoneInspector({
  placement: zone,
  config,
  profile,
  appearance,
  stylePresets,
  jumpTo,
  styleClipboard,
  onCopyStyle,
  widgetClipboard,
  onCopyWidget,
  selectedWidgetId,
  onSelectWidget,
  onShowWidget,
  query,
  onQuery,
  changedOnly,
  onChangedOnly,
  update,
  updateProfile,
  onZoneBox,
  onPickWidget,
  onUseAsGlobal,
  onSavePreset,
  onDeletePreset,
  onToggleVisible,
  onDuplicate,
  onRemove,
  presetNaming,
  onPresetNaming,
  onSavePanelPreset,
  onEditGlobalTheme,
  onOpenPoint,
  onOpenExplorer,
  request,
  onEditCanvas,
  onEditGauge,
}: ZoneInspectorProps) {
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const catalog = useSensorCatalog();
  const data = useZoneData(profile);
  const mod = modules.find((m) => m.id === zone.module);
  const blank = zone.module === BLANK_MODULE;
  const defs = zoneDefs(zone);
  const styleKeys = new Set(defs.flatMap(settingKeys));
  // A locked Colors section forces a panel's widget colours too.
  const enforce = lockedIn(appearance, "colors");
  const groups =
    usePanelSheet({
      placement: zone,
      update,
      selectedWidgetId,
      onSelectWidget,
      widgetClipboard,
      onCopyWidget,
      presetNaming,
      onPresetNaming,
      onSavePreset: onSavePanelPreset,
      enforce,
      onOpenExplorer,
    }) ?? [];
  const cards = cardsBySection(groups);

  const context: InspectorContext = blank
    ? { kind: "blank" }
    : zone.panel
      ? { kind: "panel", defs, ...panelState(groups, zone.panel.layout) }
      : mod
        ? widgetContext(mod)
        : { kind: "widget", defs };

  // A panel widget picked on the canvas: its editor is in Show.
  useEffect(() => {
    if (selectedWidgetId === null) return;
    setInspectorTab("panel", "show");
    requestAnimationFrame(() =>
      document.querySelector("[data-widget-editor]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWidgetId]);

  // "Edit style" / "Bind data…" from the zone's context menu.
  const lastRequest = useRef(request?.seq);
  useEffect(() => {
    if (!request || request.seq === lastRequest.current) return;
    lastRequest.current = request.seq;
    if (context.kind === "blank" || context.kind === "multi") return;
    onQuery("");
    setInspectorTab(context.kind, request.tab);
    if (!request.picker) return;
    if (zone.panel && !selectedWidgetId) toast("Select a widget in the panel first");
    else setPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.seq]);

  // The quick bar's pins of this widget type (a panel's are shared by every panel).
  const allPins = useQuickPins();
  const pinType = zone.panel ? "panel" : zone.module;
  const quickDefaults = defaultQuickKeys(defs);
  const pinned = pinsOf(allPins, pinType, quickDefaults);

  const values = zoneLookValues(zone, appearance);
  const fields: FieldsApi = {
    values,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v, editKey) => update((p) => withSettings(p, { [key]: v }), `setting:${editKey ?? key}`),
    onPatch: (patch) => update((p) => withSettings(p, patch), `setting:${Object.keys(patch).join()}`),
    onClear: (keys) => update((p) => withoutSettings(p, keys)),
    ...followFields(zone, appearance, update),
    onOpenExplorer,
    pins: blank
      ? undefined
      : { has: (key) => pinned.includes(key), toggle: (key) => setPin(pinType, quickDefaults, key) },
  };
  const effective = shownValues(values, defs);

  /** Replace the widget's style (see `withPastedStyle`). */
  const applyStyle = (next: ModuleSettings) => update((p) => withPastedStyle(p, next, styleKeys));
  /** The look this widget shows of its own (its custom sections' values). */
  const style = ownStyle(zone, appearance);

  const zoneFrame = (showBackground: boolean): SectionParts => ({
    changed: zoneFrameSet(zone.design, showBackground),
    onReset: () => update((p) => ({ ...p, design: undefined })),
  });
  const frameFields = (showBackground: boolean) => (
    <ZoneFrameFields
      design={zone.design}
      onChange={(fn) => update((p) => ({ ...p, design: fn(p.design) }), "design")}
      showBackground={showBackground}
    />
  );

  const extraNode = (e: SectionExtra): { at: "top" | "bottom" | "more" | "actions"; node: ReactNode } => {
    switch (e.kind) {
      case "widgetPicker":
        return { at: "top", node: <WidgetPicker placement={zone} onPickWidget={onPickWidget} /> };
      case "visible":
        return { at: "bottom", node: <ToggleRow label="Visible" hint="Hidden zones stay editable but do not show in kiosk mode" value={zone.visible} onChange={onToggleVisible} /> };
      case "styleTools":
        return {
          at: "actions",
          node: (
            <StyleTools
              canPaste={styleClipboard !== null}
              presets={stylePresets}
              onCopy={() => onCopyStyle(style)}
              onPaste={() => styleClipboard && applyStyle(styleClipboard)}
              onUseAsGlobal={(target) => onUseAsGlobal(target, style)}
              onSavePreset={(name) => onSavePreset(name, style)}
              onApplyPreset={(id) => {
                const preset = stylePresets.find((p) => p.id === id);
                if (preset) applyStyle(preset.settings);
              }}
              onDeletePreset={onDeletePreset}
            />
          ),
        };
      case "zoneFrame":
        // A panel draws its own card (Surface): no frame background around it.
        return { at: "more", node: frameFields(!zone.panel) };
    }
  };

  const bound = (
    <BoundData
      zone={zone}
      config={config}
      data={data}
      selectedWidgetId={selectedWidgetId}
      updateProfile={updateProfile}
      onOpenPoint={onOpenPoint}
      onOpenExplorer={onOpenExplorer}
      picker={picker}
      onPicker={setPicker}
    />
  );

  const parts = (s: InspectorSection): SectionParts => {
    switch (s.special) {
      case "boundData":
      case "panelData":
        return { body: bound, plain: true };
      case "blankPick":
        return { body: <WidgetPicker placement={zone} onPickWidget={onPickWidget} /> };
      case "zoneFrame":
        return { ...zoneFrame(true), body: frameFields(true) };
      case undefined:
        break;
      default:
        return cardParts(cards.get(s.special) ?? [], s.special === "widgetKind");
    }
    const placed = s.extras.map(extraNode);
    const at = (where: "top" | "bottom" | "more" | "actions") => {
      const nodes = placed.filter((p) => p.at === where).map((p, i) => <div key={i}>{p.node}</div>);
      return nodes.length > 0 ? nodes : undefined;
    };
    const frame = s.extras.some((e) => e.kind === "zoneFrame") ? zoneFrame(!zone.panel) : {};
    // A panel can be replaced by a widget too (Change).
    const top =
      zone.panel && s.id === "header"
        ? [<WidgetPicker key="picker" placement={zone} onPickWidget={onPickWidget} />, ...(at("top") ?? [])]
        : at("top");
    return { ...frame, top, bottom: at("bottom"), more: at("more"), actions: at("actions") };
  };

  const present = (s: InspectorSection) =>
    s.special === undefined ||
    ["boundData", "panelData", "blankPick", "zoneFrame"].includes(s.special) ||
    (cards.get(s.special)?.length ?? 0) > 0;

  const canvasNote = zone.module === CANVAS_ID && zone.canvas && onEditCanvas && (
    <InspectorNote key="canvas">
      An imported InfoPanel profile. Its items, modes and sensors are edited in the canvas editor.{" "}
      <button type="button" onClick={onEditCanvas} className="font-medium text-ui-accent-text hover:underline">
        Edit items
      </button>
    </InspectorNote>
  );
  const gaugeNote = zone.module === CUSTOM_GAUGE_ID && onEditGauge && <GaugeNote key="gauge" zone={zone} onEdit={onEditGauge} />;
  const notes = (tab: Parameters<typeof inspectorNotes>[1]) => [
    tab === "show" || tab === undefined ? canvasNote : null,
    tab === "show" || tab === undefined ? gaugeNote : null,
    ...inspectorNotes(context, tab).map((n) => <InspectorNote key={n.kind}>{n.text}</InspectorNote>),
  ];

  const hasLabel = defs.some((d) => d.key === "label");
  const onName = zone.panel
    ? (name: string) => update((p) => withPanelField(p, "title", name), "panel:title")
    : hasLabel
      ? (name: string) => update((p) => withSettings(p, { label: name }), "setting:label")
      : undefined;
  const selectedWidget = zone.panel?.widgets.find((w) => w.id === selectedWidgetId);
  const Icon = moduleIcon(zone.module);

  const typeName = blank ? "Blank zone" : zone.panel ? "Panel" : (mod?.title ?? zone.module);
  const header = (changed: number) => (
    <>
      <ZoneHeader
          icon={<Icon />}
          name={zone.panel ? zoneName(zone) : hasLabel ? String(zone.settings?.label ?? "") : zoneName(zone)}
          placeholder={mod?.title}
          onName={onName}
          meta={`${typeName} · ${changedLabel(changed)}`}
          details={zoneMeta(zone, { dataPoints: data.usage.byZone.get(zone.id)?.length ?? 0, min: zoneMinSize(zone) })}
          visible={zone.visible}
          widget={selectedWidget && widgetName(selectedWidget, catalog)}
          onZoneCrumb={() => onSelectWidget(null)}
          onWidgetCrumb={onShowWidget}
          onToggleVisible={onToggleVisible}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      <ZoneBoxFields placement={zone} cols={profile.cols} rows={profile.rows} onZoneBox={onZoneBox} />
    </>
  );

  return (
    <InspectorView
      context={context}
      contextKey={context.kind}
      moreScope={pinType}
      header={header}
      fields={fields}
      visible={(def) => isVisible(def, effective)}
      present={present}
      parts={parts}
      notes={notes}
      query={query}
      onQuery={onQuery}
      changedOnly={changedOnly}
      onChangedOnly={onChangedOnly}
      jumpTo={jumpTo}
      identity={{
        icon: <Icon />,
        name: zoneName(zone),
        meta: (changed) => `${typeName} · ${changedLabel(changed)}`,
        hidden: !zone.visible,
        onToggleVisible,
      }}
      quickKeys={blank ? [] : pinned}
      onTheme={onEditGlobalTheme}
    />
  );
}
