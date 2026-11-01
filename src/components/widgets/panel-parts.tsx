import { useId, type CSSProperties } from "react";
import type { Widget } from "@/lib/layout";
import type { SensorMap } from "@/modules/types";
import { widgetIcon } from "@/lib/widget-icons";
import { cn } from "@/lib/utils";
import { scopedCss } from "@/components/widget-style";
import { PANEL_ACCENT } from "./panel-skin";
import { WidgetView } from "./WidgetView";

interface PanelTitleProps {
  title: string;
  /** A key from `lib/widget-icons.ts` (replaces the accent dot). */
  icon?: string;
  className?: string;
}

/** The panel's small uppercase title (`.wp-panel-title`) with an accent dot or icon. */
export function PanelTitle({ title, icon, className }: PanelTitleProps) {
  const Icon = widgetIcon(icon);
  return (
    <div
      className={cn(
        "wp-panel-title flex items-center gap-1.5 text-micro font-semibold uppercase tracking-widest",
        className
      )}
    >
      {Icon ? (
        <Icon className="h-3 w-3" style={{ color: PANEL_ACCENT }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PANEL_ACCENT }} />
      )}
      {title}
    </div>
  );
}

/** The studio's widget selection in the selected panel zone (outlines only). */
export interface PanelSelection {
  selectedWidgetId: string | null;
}

interface WidgetCellProps {
  widget: Widget;
  sensors: SensorMap;
  className?: string;
  style?: CSSProperties;
  /** Studio only: outline the selected widget, and the others on hover. */
  selection?: PanelSelection;
  /** Studio canvas (unbound widgets say "pick a sensor"). */
  studio?: boolean;
}

/**
 * One widget's cell in a panel — the stable CSS hook
 * (`.wp-widget.wp-widget--{kind}[data-widget-id][data-widget-kind]` plus
 * the widget's own class names) and the scope of its custom CSS.
 */
export function WidgetCell({ widget, sensors, className, style, selection, studio }: WidgetCellProps) {
  const scope = useId();
  const css = widget.css ? scopedCss(scope, widget.css) : "";
  return (
    <div
      className={cn(
        "wp-widget min-w-0",
        `wp-widget--${widget.kind}`,
        className,
        widget.className,
        selection &&
          (selection.selectedWidgetId === widget.id
            ? "rounded-sm outline-[1.5px] -outline-offset-2 outline-ui-accent"
            : "rounded-sm hover:outline-1 hover:-outline-offset-1 hover:outline-ui-accent/50")
      )}
      style={style}
      data-widget-id={widget.id}
      data-widget-kind={widget.kind}
      data-wp-scope={css ? scope : undefined}
    >
      {css && <style>{css}</style>}
      <WidgetView widget={widget} sensors={sensors} studio={studio} />
    </div>
  );
}
