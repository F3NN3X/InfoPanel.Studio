import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { VectorGaugeSvg } from "@/components/infopanel/VectorGaugeSvg";
import { useSensorCatalog } from "@/lib/catalog";
import { CUSTOM_GAUGE_ID, widgetGauge } from "@/lib/gauge-studio/model";
import { matchingStyle } from "@/lib/style-presets";
import { BLANK_MODULE, type DashboardConfig, type ProfileView, type Placement, type StylePreset, type Widget } from "@/lib/layout";
import { isLocked, type SectionId } from "@/lib/theme-model";
import { convertKind, withPanelField } from "@/lib/panel-model";
import type { Appearance } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { settingKeys, type ModuleSettings } from "@/modules/types";
import type { SheetCard } from "./category-sheet";
import { BoundData } from "./inspector/bound-data";
import { setInspectorTab } from "./inspector/inspector-prefs";
import { InspectorNote, InspectorView, type SectionParts } from "./inspector/inspector-view";
import { ItemInspector } from "./item-inspector";
import { cardsBySection, panelState } from "./inspector/panel-cards";
import { useZoneData } from "./inspector/use-zone-data";
import { customised, shownValue, shownValues, withoutSettings, withSettings, zoneDefs, zoneLookValues } from "./inspector/zone-fields";
import { zoneMeta, zoneName } from "./inspector/zone-meta";
import {
  chipSections,
  rowSection,
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
import { makeTheme, makeThemeSections } from "./inheritance-actions";
import { LinkRow } from "./link-row";
import { MakeThemeDialog, type MakeThemePending } from "./make-theme-dialog";
import { sectionInherit } from "./section-inherit";
import { ownStyle, withPastedStyle, zoneMinSize } from "./studio-actions";
import { StyleToolbar } from "./style-toolbar";
import type { InheritanceContext } from "./use-inheritance";import { widgetName } from "./widget-kinds";
import { ZoneFrameFields, zoneFrameSet } from "./zone-design-section";
import type { ZoneRect } from "./zone-geometry";
import { moduleIcon } from "./zone-icons";
import { WidgetPicker, ZoneHeader, changedLabel } from "./zone-inspector-parts";
import { PlaceRow } from "./place-row";
import { pinsOf, setPin, useQuickPins } from "./inspector/inspector-prefs";
import { defaultQuickKeys } from "./quick-sets";

interface ZoneInspectorProps {
  placement: Placement;
  config: DashboardConfig;
  /** The active profile (its grid limits the placement row; its zones the data usage). */
  profile: ProfileView;
  /** The theme (all-profiles style, profile and page theme) the widget follows. */
  appearance: Appearance;
  /** The Styles saved in the Library (Start from a Style). */
  stylePresets: StylePreset[];
  /** The inheritance chips' resolver, history setter and navigation. */
  inherit: InheritanceContext;
  /** Open and reveal a section (the selection chip's Style, the palette) whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
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
  /** Mutate the placement; changes with the same `key` coalesce in undo. */
  update: (fn: (p: Placement) => Placement, key?: string) => void;
  /** Mutate the active profile (bindings). */
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  /** The zone's cells typed in; false when it can't take them. */
  onZoneBox: (patch: Partial<ZoneRect>) => boolean | void;
  /** Open the widget picker for this zone. */
  onPickWidget: () => void;
  /** Keep the widget's own look as a Style (Library › Styles). */
  onSavePreset: (name: string, settings: ModuleSettings) => void;
  /** Overwrite a saved Style with the widget's own look. */
  onUpdatePreset: (id: string, settings: ModuleSettings) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** The header's Help icon (F1). */
  onHelp: () => void;
  /** A panel's "Save as Panel" name input is open (the palette opens it too). */
  presetNaming: boolean;
  onPresetNaming: (open: boolean) => void;
  /** Save this panel zone to My panels. */
  onSavePanelPreset: (name: string) => void;
  /** Open a bound point in Sources mode. */
  onOpenPoint: (key: string) => void;
  onOpenExplorer: () => void;
  /** Show a tab, and maybe the data picker, whenever `seq` changes (the zone context menu). */
  request?: { tab: InspectorTab; picker: boolean; seq: number };
  /** A Custom gauge zone: open its spec in Gauges. */
  onEditGauge?: () => void;
  /**
   * A Studio widget on an imported profile's page (Edit v3 SPEC §3.6): its Place row on the page's cells instead of
   * the grid zone's. Its look follows the theme as a grid zone's does, but it has no place in the config's zones, so
   * no inheritance chips.
   */
  place?: ReactNode;
  /** The On InfoPanel section, last (a screen made for InfoPanel). */
  onInfoPanel?: ReactNode;
  /** The LAYER section (Edit v3 SPEC §10.2): z-order and the group it sits in. */
  layer?: ReactNode;
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
          A gauge you design in Gauges.{" "}
          <button type="button" onClick={onEdit} className="font-medium text-ui-accent-text hover:underline">
            Edit gauge…
          </button>
        </span>
      </span>
    </InspectorNote>
  );
}

/** The custom cards of a special section as one body (a caption over each when several share it). */
function cardParts(cards: SheetCard[]): SectionParts {
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
  };
}

/**
 * The inspector of one zone (README §4.6–4.7): the header (icon, editable
 * name, meta, Hide / Duplicate / Delete, the panel crumbs) and placement
 * row, then the registry's tabs — Show · Style · Data · Behaviour for widgets
 * and panels, Widget + Zone frame for a blank zone. The zone's custom UI
 * (widget picker, inheritance chips, style toolbar, zone frame, a panel's
 * editors, Bound data) fills the sections the registry marks for it. A
 * selected panel widget swaps in its own inspector (`ItemInspector`).
 */
export function ZoneInspector({
  placement: zone,
  config,
  profile,
  appearance,
  stylePresets,
  inherit,
  jumpTo,
  widgetClipboard,
  onCopyWidget,
  selectedWidgetId,
  onSelectWidget,
  onShowWidget,
  query,
  onQuery,
  update,
  updateProfile,
  onZoneBox,
  onPickWidget,
  onSavePreset,
  onUpdatePreset,
  onToggleVisible,
  onDuplicate,
  onRemove,
  onHelp,
  presetNaming,
  onPresetNaming,
  onSavePanelPreset,
  onOpenPoint,
  onOpenExplorer,
  request,
  onEditGauge,
  place,
  onInfoPanel,
  layer,
}: ZoneInspectorProps) {
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [makeThemePending, setMakeThemePending] = useState<MakeThemePending | null>(null);
  const catalog = useSensorCatalog();
  const data = useZoneData(profile);
  const mod = modules.find((m) => m.id === zone.module);
  const blank = zone.module === BLANK_MODULE;
  const defs = zoneDefs(zone);
  const styleKeys = new Set(defs.flatMap(settingKeys));
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
    }) ?? [];
  const cards = cardsBySection(groups);
  const panelView = zone.panel ? panelState(groups, zone.panel.layout) : undefined;
  // A selected panel widget has its own inspector (not over the Code view).
  const selectedWidget = zone.panel?.widgets.find((w) => w.id === selectedWidgetId);
  const item = panelView && !panelView.codeView ? selectedWidget : undefined;

  const context: InspectorContext = blank
    ? { kind: "blank" }
    : item && panelView
      ? { kind: "item", widget: item, layout: panelView.layout }
      : zone.panel && panelView
        ? { kind: "panel", defs, ...panelView }
        : mod
          ? widgetContext(mod)
          : { kind: "widget", defs };

  // A panel widget picked on the canvas: its inspector opens on Kind.
  useEffect(() => {
    if (selectedWidgetId === null) return;
    setInspectorTab("item", "show");
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
    onChange: (key, v, editKey) => update((p) => customised(withSettings(p, { [key]: v }), appearance, defs, [key]), `setting:${editKey ?? key}`),
    onPatch: (patch) => update((p) => customised(withSettings(p, patch), appearance, defs, Object.keys(patch)), `setting:${Object.keys(patch).join()}`),
    onClear: (keys) => update((p) => withoutSettings(p, keys)),
    // A section the screen locks shows its value read-only.
    readOnly: (def) => {
      const sec = rowSection(def);
      return sec !== undefined && isLocked(appearance, sec);
    },
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
        return {
          body: (
            <div className="space-y-3">
              {bound}
              <LinkRow
                note="Rename sensors and change the connection in"
                link="Data"
                onNavigate={() => inherit.navigateTo({ view: "data" })}
              />
            </div>
          ),
          plain: true,
        };
      case "blankPick":
        return { body: <WidgetPicker placement={zone} onPickWidget={onPickWidget} /> };
      case "zoneFrame":
        return { ...zoneFrame(true), body: frameFields(true) };
      case undefined:
        break;
      default:
        return cardParts(cards.get(s.special) ?? []);
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
    // The island's look lives in Alerts & Island: this card only decides what the widget sends.
    const island =
      s.id === "island" ? (
        <LinkRow note="How the island looks is set in" link="Alerts & Island" onNavigate={() => inherit.navigateTo({ view: "alerts", tab: "island" })} />
      ) : undefined;
    return { ...frame, top, bottom: island ? [...(at("bottom") ?? []), <div key="island-note">{island}</div>] : at("bottom"), more: at("more"), actions: at("actions") };
  };

  // The zone's place in the config, for the inheritance chips and Make this the theme.
  const profileId = profile.id;
  const pageId = profile.pageId ?? config.profiles.find((p) => p.id === profileId)?.pages[0]?.id ?? "";
  const scope = { level: "widget", profileId, pageId, zoneId: zone.id } as const;
  const askMakeTheme = (sections: readonly SectionId[], target: MakeThemePending["target"]) => {
    const found = makeThemeSections(config, scope, sections);
    if (found.length > 0) setMakeThemePending({ target, sections: found });
  };
  /** A section card's chip: the widget's inheritance of the theme sections it covers. */
  const inheritOf = (s: InspectorSection) => {
    const sections = chipSections(s);
    return sections.length === 0 || blank || place ? undefined : sectionInherit({ sections, title: s.title, scope, ctx: inherit, onMakeTheme: askMakeTheme });
  };

  const present = (s: InspectorSection) =>
    s.special === undefined ||
    ["boundData", "panelData", "blankPick", "zoneFrame"].includes(s.special) ||
    (cards.get(s.special)?.length ?? 0) > 0;

  const gaugeNote = zone.module === CUSTOM_GAUGE_ID && onEditGauge && <GaugeNote key="gauge" zone={zone} onEdit={onEditGauge} />;
  const customSections = makeThemeSections(config, scope);
  const styleToolbar = (context.kind === "widget" || context.kind === "panel") && (
    <StyleToolbar
      key="style-toolbar"
      saved={stylePresets}
      hasStyle={Object.keys(style).length > 0}
      canMakeTheme={customSections.length > 0}
      onApply={applyStyle}
      onSave={(name) => onSavePreset(name, style)}
      matched={matchingStyle(stylePresets, style)}
      onUpdate={(id) => onUpdatePreset(id, style)}
      onMakeTheme={(target) => askMakeTheme(customSections, target)}
    />
  );
  const notes = (tab: Parameters<typeof inspectorNotes>[1]) => [
    tab === "style" ? styleToolbar : null,
    tab === "show" || tab === undefined ? gaugeNote : null,
    ...inspectorNotes(context, tab).map((n) => <InspectorNote key={n.kind}>{n.text}</InspectorNote>),
  ];

  const hasLabel = defs.some((d) => d.key === "label");
  const onName = zone.panel
    ? (name: string) => update((p) => withPanelField(p, "title", name), "panel:title")
    : hasLabel
      ? (name: string) => update((p) => withSettings(p, { label: name }), "setting:label")
      : undefined;
  const Icon = moduleIcon(zone.module);

  const typeName = blank ? "Blank zone" : item ? "Panel item" : zone.panel ? "Panel" : (mod?.title ?? zone.module);
  const header = (changed: number) => (
    <>
      <ZoneHeader
          icon={<Icon />}
          name={zone.panel ? zoneName(zone) : hasLabel ? String(zone.settings?.label ?? "") : zoneName(zone)}
          placeholder={mod?.title}
          onName={onName}
          meta={`${typeName} · ${changedLabel(changed)}`}
          kind={blank || item ? undefined : "Studio widget"}
          details={zoneMeta(zone, { dataPoints: data.usage.byZone.get(zone.id)?.length ?? 0, min: zoneMinSize(zone) })}
          visible={zone.visible}
          widget={selectedWidget && widgetName(selectedWidget, catalog)}
          onZoneCrumb={() => onSelectWidget(null)}
          onWidgetCrumb={onShowWidget}
          onToggleVisible={onToggleVisible}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onHelp={onHelp}
        />
    </>
  );
  const placeRow = place ?? (
    <PlaceRow cell={{ col: zone.colStart, row: zone.rowStart, cols: zone.colSpan, rows: zone.rowSpan }} onCells={(patch) => onZoneBox(patch)} />
  );
  const after = (layer || onInfoPanel) && (
    <>
      {layer}
      {onInfoPanel}
    </>
  );

  if (item)
    return (
      <ItemInspector
        zone={zone}
        widget={item}
        appearance={appearance}
        header={header}
        place={placeRow}
        after={after}
        bound={bound}
        update={update}
        onChangeKind={(kind) => update((p) => ({ ...p, panel: { ...p.panel!, widgets: p.panel!.widgets.map((w) => (w.id === item.id ? convertKind(w, kind) : w)) } }))}
        onOpenExplorer={onOpenExplorer}
        onEditLock={(section) => inherit.navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId, section })}
        query={query}
        onQuery={onQuery}
        jumpTo={jumpTo}
        identity={{
          icon: <Icon />,
          name: widgetName(item, catalog),
          meta: (changed) => `Panel item · ${changedLabel(changed)}`,
          hidden: !item.visible,
          onToggleVisible,
        }}
      />
    );

  return (
    <>
    <InspectorView
      context={context}
      contextKey={context.kind}
      header={header}
      fields={fields}
      visible={(def) => isVisible(def, effective)}
      present={present}
      parts={parts}
      notes={notes}
      inherit={inheritOf}
      query={query}
      onQuery={onQuery}
      jumpTo={jumpTo}
      identity={{
        icon: <Icon />,
        name: zoneName(zone),
        meta: (changed) => `${typeName} · ${changedLabel(changed)}`,
        hidden: !zone.visible,
        onToggleVisible,
      }}
      quickKeys={blank ? [] : pinned}
      place={placeRow}
      after={after}
      underline
    />
    <MakeThemeDialog
      pending={makeThemePending}
      screenName={profile.name}
      pageName={config.profiles.find((p) => p.id === profileId)?.pages.find((pg) => pg.id === pageId)?.name ?? "this page"}
      onConfirm={(p) => inherit.setConfig((c) => makeTheme(c, scope, p.target, p.sections))}
      onClose={() => setMakeThemePending(null)}
    />
    </>
  );
}
