import { useState } from "react";
import { withPanelField, type PanelDef, type Widget, type WidgetKind } from "@/lib/panel-model";
import { newWidget, type Placement } from "@/lib/layout";
import type { SheetGroup } from "./category-sheet";
import { PanelCodeView } from "./panel-code-view";
import { PanelLayers } from "./panel-layers";
import { PanelBackgroundFields, PanelLayoutFields, PanelMainFields } from "./panel-layout-section";
import { PanelMenu, PresetNameInput } from "./panel-preset-tools";
import { panelWidgetActions } from "./panel-widget-actions";
import { AddWidgetSelect } from "./widget-kind-menu";
import { widgetName } from "./widget-kinds";
import { useSensorCatalog } from "@/lib/catalog";

interface PanelSheetArgs {
  /** The selected zone; the cards exist only when it is a panel. */
  placement: Placement;
  /**
   * Mutate the placement (panel def lives on it). Field edits pass a key
   * (`panel:<field>`, `panel-widget:<id>:<field>`) so quick edits to one
   * field coalesce into one undo step; structural edits pass none.
   */
  update: (fn: (p: Placement) => Placement, key?: string) => void;
  /** The selected widget (kept by the studio: the canvas selects too). */
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  /** The widget copied with "Copy" (session only, shared across panels). */
  widgetClipboard: Widget | null;
  onCopyWidget: (widget: Widget) => void;
  /** The "Save as panel preset" name input is open (kept by the studio: the palette opens it). */
  presetNaming: boolean;
  onPresetNaming: (open: boolean) => void;
  /** Save this panel zone to My panels under a name. */
  onSavePreset: (name: string) => void;
}

/**
 * A panel zone's own cards: Panel (Visual / Code, size, gap, padding,
 * preset), Layout, Background (overlay) and Widgets (the layers). The
 * inspector places each in the section the registry marks for it
 * (`inspector/panel-cards.ts`); a selected widget has an inspector of its
 * own (`inspector/item-model.ts`). In the Code view the layout and widget
 * cards give way to one wide code card. `undefined` for other zones.
 * (Title, accent and surface are the Widget and Colors & surface cards.)
 */
export function usePanelSheet({
  placement,
  update,
  selectedWidgetId,
  onSelectWidget,
  widgetClipboard,
  onCopyWidget,
  presetNaming,
  onPresetNaming,
  onSavePreset,
}: PanelSheetArgs): SheetGroup[] | undefined {
  const [view, setView] = useState<"visual" | "code">("visual");
  const catalog = useSensorCatalog();
  const panel = placement.panel;
  if (!panel) return undefined;

  const actions = panelWidgetActions({
    placement,
    update,
    selectedWidgetId,
    onSelectWidget,
    widgetClipboard,
    onCopyWidget,
  });
  const { updatePanel, updateWidget } = actions;
  const layout = panel.layout === "wrap" || !panel.layout ? "stack" : panel.layout;

  const setPanelField = <K extends keyof PanelDef>(key: K, value: PanelDef[K]) =>
    updatePanel((p) => ({ ...p, [key]: value }), `panel:${key}`);

  /** Code view Apply: a changed title also updates the shown one (`withPanelField`). */
  const applyCode = (next: PanelDef) =>
    update((p) => {
      const replaced = { ...p, panel: next };
      return next.title === p.panel!.title ? replaced : withPanelField(replaced, "title", next.title);
    });

  const layoutProps = { panel, setField: setPanelField, updatePanel };
  const visual = view === "visual";

  const panelCards: SheetGroup["cards"] = [
    {
      id: "panel:main",
      title: "Panel",
      hint: "The panel as a whole. Its title, surface and accent are in Widget and Colors & surface.",
      terms: ["Panel", "Editor", "Visual", "Code", "JSON", "Size", "Fill", "Hug", "Gap", "Padding", "Save as Panel", "Panel"],
      actions: <PanelMenu onSavePreset={() => onPresetNaming(true)} />,
      node: (
        <>
          <PanelMainFields panel={panel} setField={setPanelField} view={view} onView={setView} />
          {presetNaming && (
            <PresetNameInput initial={panel.title} onSave={onSavePreset} onCancel={() => onPresetNaming(false)} />
          )}
        </>
      ),
    },
  ];
  if (visual) {
    panelCards.push({
      id: "panel:layout",
      title: "Layout",
      hint: "How the widgets are arranged and how the panel fits its space",
      terms: [
        "Layout", "Stack", "Grid", "Overlay", "Direction", "Wrap", "Alignment", "Columns", "Column sizes",
        "Row sizes", "Cell alignment", "Band alignment", "Bottom band columns",
      ],
      node: <PanelLayoutFields {...layoutProps} />,
    });
    if (layout === "overlay") {
      panelCards.push({
        id: "panel:background",
        title: "Background",
        hint: "The image that fills the overlay",
        terms: ["Background", "Background image", "Image URL", "Upload", "Dim", "scrim", "Dark scrim"],
        node: <PanelBackgroundFields {...layoutProps} />,
      });
    }
    panelCards.push({
      id: "panel:widgets",
      title: "Widgets",
      hint: "Drag to reorder; the eye hides a widget",
      terms: ["Widgets", "Add widget", "Layers", ...panel.widgets.map((w) => widgetName(w, catalog))],
      node: (
        <>
          <PanelLayers
          widgets={panel.widgets}
          selectedId={selectedWidgetId}
          onSelect={onSelectWidget}
          onToggleVisible={(id) => updateWidget(id, (w) => ({ ...w, visible: !w.visible }))}
          onMove={actions.move}
          onDuplicate={actions.duplicate}
          onCopy={actions.copy}
          onPasteAfter={widgetClipboard ? actions.paste : undefined}
          onChangeKind={actions.changeKind}
          onRemove={actions.remove}
        />
          <AddWidgetSelect onAdd={(kind: WidgetKind) => actions.insert(newWidget(kind))} />
          <p className="text-[11px] leading-snug text-ui-hint">
            Click a widget to edit it. Copy / paste and change kind keep the shared fields.
          </p>
        </>
      ),
    });
  } else {
    panelCards.push({
      id: "panel:code",
      title: "Code",
      hint: "The whole panel as JSON",
      wide: true,
      terms: ["Code", "JSON"],
      node: <PanelCodeView panel={panel} onApply={applyCode} />,
    });
  }

  return [{ heading: "Panel", cards: panelCards }];
}
