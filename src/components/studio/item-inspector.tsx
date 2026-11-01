import type { ReactNode } from "react";
import { useSensorCatalog } from "@/lib/catalog";
import type { Placement } from "@/lib/layout";
import { panelLegacyLook, panelOwnSettings, WIDGET_KINDS, type Widget, type WidgetKind } from "@/lib/panel-model";
import { sensorAt } from "@/lib/sensors";
import { resolveWith, type Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { InspectorView, type SectionParts } from "./inspector/inspector-view";
import { itemFields, itemFollow, kindChoices, type ItemContext, type ItemFieldsInput } from "./inspector/item-model";
import type { InspectorSection, PanelLayoutKind } from "./inspector-model";
import type { SheetIdentity } from "./inspector/sheet-view";
import { itemSectionInherit } from "./section-inherit";
import { KIND_INFO } from "./widget-kinds";
import { zoneName } from "./inspector/zone-meta";

interface ItemInspectorProps {
  /** The panel zone. */
  zone: Placement;
  widget: Widget;
  appearance: Appearance;
  /** The zone's header (name, actions, the Panel › widget crumbs). */
  header: (changed: number) => ReactNode;
  /** The zone's Place row, and its LAYER and On InfoPanel after the sections. */
  place?: ReactNode;
  after?: ReactNode;
  /** The panel's Bound data block (its picker binds the widget; "Bind data…" opens it). */
  bound: ReactNode;
  /** Mutate the panel zone; changes with the same `key` coalesce in undo. */
  update: (fn: (p: Placement) => Placement, key?: string) => void;
  onChangeKind: (kind: WidgetKind) => void;
  onOpenExplorer: () => void;
  /** A section's "Edit lock in Theme ↗" (the screen locks it). */
  onEditLock: (section: string) => void;
  query: string;
  onQuery: (query: string) => void;
  jumpTo?: { id: string; key?: string; seq: number };
  identity: SheetIdentity;
}

/** The Kind chips: every kind (Custom gauge only on a widget that already is one), the current one lit. */
function KindChips({ kind, onChange }: { kind: WidgetKind; onChange: (kind: WidgetKind) => void }) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
        {kindChoices(WIDGET_KINDS, kind).map((k) => {
          const { label, icon: Icon, hint } = KIND_INFO[k];
          const on = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              title={hint}
              onClick={() => !on && onChange(k)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors",
                on ? "border-ui-accent/50 bg-ui-accent/[.14] text-ui-accent-text" : "border-ui-default text-ui-3 hover:text-ui-1"
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-ui-hint">Changing the kind keeps the label, sensor, unit, color and placement.</p>
    </div>
  );
}

/** A panel's layout as the item's sections read it. */
const layoutOf = (layout: string | undefined): PanelLayoutKind => (layout === "grid" || layout === "overlay" ? layout : "stack");

/**
 * A selected panel widget's inspector (SPEC §8): the zone's four tabs with
 * its kind's sections (`item-model.ts`), Typography, Color, Units & format
 * and Thresholds following the panel — the panel's look as it renders
 * under the theme (`resolveWith`).
 */
export function ItemInspector({
  zone,
  widget,
  appearance,
  header,
  place,
  after,
  bound,
  update,
  onChangeKind,
  onOpenExplorer,
  onEditLock,
  query,
  onQuery,
  jumpTo,
  identity,
}: ItemInspectorProps) {
  const catalog = useSensorCatalog();
  const panel = zone.panel!;
  const unit = (widget.sensor ? sensorAt(catalog.sensors, widget.sensor)?.unit : undefined) || widget.unit;
  const context: ItemContext = { kind: "item", widget, layout: layoutOf(panel.layout), unit };
  const look = resolveWith(appearance, panelOwnSettings(zone), zone.follow, panelLegacyLook(zone)) ?? {};
  const fieldsInput: ItemFieldsInput = {
    widget,
    layout: context.layout,
    look,
    locks: appearance.profile?.locks,
    panelName: zoneName(zone),
    unit,
    change: (fn, key) =>
      update(
        (p) => ({ ...p, panel: { ...p.panel!, widgets: p.panel!.widgets.map((w) => (w.id === widget.id ? fn(w) : w)) } }),
        key && `panel-widget:${widget.id}:${key}`
      ),
    onOpenExplorer,
  };
  const fields = itemFields(fieldsInput);
  /** A section's chip: the widget follows its panel (the panel is its only level in the theme). */
  const inherit = (s: InspectorSection) => {
    const follow = itemFollow(fieldsInput, s);
    return (
      follow &&
      itemSectionInherit({ mode: follow.mode, panelName: fieldsInput.panelName, onCustomise: follow.onCustomize, onUseTheme: follow.onUseTheme }, () =>
        onEditLock(follow.section)
      )
    );
  };

  const parts = (s: InspectorSection): SectionParts => {
    if (s.special === "itemKind") return { body: <KindChips kind={widget.kind} onChange={onChangeKind} />, editor: true };
    if (s.special === "panelData") return { body: bound, plain: true };
    return {};
  };

  return (
    <InspectorView
      context={context}
      contextKey="item"
      header={header}
      fields={fields}
      parts={parts}
      inherit={inherit}
      query={query}
      onQuery={onQuery}
      jumpTo={jumpTo}
      identity={identity}
      place={place}
      after={after}
      underline
    />
  );
}
