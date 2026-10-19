import type { PanelDef, Widget, WidgetKind } from "@/lib/panel-model";
import type { SheetCard } from "../category-sheet";
import { SelectRow } from "../setting-rows";
import { ALL_KINDS, KIND_INFO } from "../widget-kinds";
import { DataFields, hasData } from "./data-section";
import { hasKindFields, KindFields } from "./display-section";
import { LayoutFields } from "./layout-section";
import { AdvancedFields, ColorFields, hasColor, hasTypography, TypographyFields } from "./style-section";

interface WidgetCardsProps {
  widget: Widget;
  panel: PanelDef;
  /** `field`: the edited field (quick edits to one field are one undo step). */
  onChange: (fn: (w: Widget) => Widget, field?: string) => void;
  onChangeKind: (kind: WidgetKind) => void;
  /** The profile theme locks Colors (the color is ignored). */
  enforce?: boolean;
  /** Open Sources mode (the sensor field's data picker offers it). */
  onOpenExplorer: () => void;
}

/**
 * The selected panel widget's editor as sheet cards (README §4.7): Kind
 * (change kind + the kind's own fields), Display (label, sensors, number
 * format), Size & placement, Typography and Colors, Advanced (class names,
 * CSS). Only the cards its kind uses.
 */
export function widgetCards({ widget, panel, onChange, onChangeKind, enforce, onOpenExplorer }: WidgetCardsProps): SheetCard[] {
  const set = <K extends keyof Widget>(key: K, value: Widget[K]) =>
    onChange((w) => ({ ...w, [key]: value }), key);
  const props = { widget, panel, set, onChange, enforce, onOpenExplorer };
  const { label, hint } = KIND_INFO[widget.kind];
  const cards: (SheetCard | false)[] = [
    {
      id: "widget:kind",
      title: label,
      hint: "The kind and what is particular to it",
      editor: true,
      terms: ["Kind", "Widget", label, "Change kind", "Static text", "Image URL", "Max", "Invert fill", "Shape", "Thickness", "Max height", "Rows", "Columns", "Header", "History samples", "Show", "Text alignment"],
      node: (
        <>
          <SelectRow
            label="Kind"
            hint={hint}
            options={ALL_KINDS.map((k) => ({ value: k, label: KIND_INFO[k].label }))}
            value={widget.kind}
            onChange={(k) => onChangeKind(k as WidgetKind)}
          />
          {hasKindFields(widget) ? (
            <KindFields {...props} />
          ) : (
            !hasData(widget) && <p className="text-[12px] text-ui-4">No data: a decorative shape.</p>
          )}
        </>
      ),
    },
    hasData(widget) && {
      id: "widget:display",
      title: "Display",
      hint: "What the widget shows",
      terms: ["Display", "Label", "Sensor", "Sub sensor", "Unit", "Decimals", "Scale"],
      node: <DataFields {...props} />,
    },
    {
      id: "widget:layout",
      title: "Size & placement",
      hint: "Where the widget sits in its panel",
      terms: ["Size", "Placement", "Layout", "Width", "Height", "Align self", "Column span", "Row span", "Band", "Use as panel background"],
      node: <LayoutFields {...props} />,
    },
    hasTypography(widget) && {
      id: "widget:typography",
      title: "Typography",
      terms: ["Typography", "Font size", "Ring size"],
      node: <TypographyFields {...props} />,
    },
    hasColor(widget) && {
      id: "widget:colors",
      title: "Colors",
      terms: ["Colors", "Color"],
      node: <ColorFields {...props} />,
    },
    {
      id: "widget:advanced",
      title: "Advanced",
      hint: "Class names and custom CSS",
      terms: ["Advanced", "Class names", "Custom CSS", "CSS", "hooks"],
      node: <AdvancedFields {...props} />,
    },
  ];
  return cards.filter((c): c is SheetCard => c !== false);
}
