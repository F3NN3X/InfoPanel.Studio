import type { PanelDef, Widget } from "@/lib/panel-model";

/** What every widget editor section gets. */
export interface WidgetSectionProps {
  widget: Widget;
  /** The widget's panel (its layout decides which fields apply). */
  panel: PanelDef;
  /** The profile theme locks Colors: the widget's own color is ignored. */
  enforce?: boolean;
  /** Open Sources mode (the sensor field's data picker offers it). */
  onOpenExplorer: () => void;
  /** Set one field (quick edits to one field are one undo step). */
  set: <K extends keyof Widget>(key: K, value: Widget[K]) => void;
  /** Any edit; `field` names the undo step it coalesces into. */
  onChange: (fn: (w: Widget) => Widget, field?: string) => void;
}
