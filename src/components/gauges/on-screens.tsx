/**
 * "On your screens" (spec §5, B3): every gauge on every screen and page by kind, with what it reads and the way
 * in: Edit gauge for a canvas gauge or a Custom gauge widget, Open widget for widget rings (they are part of the
 * widget's own settings). A gauge row selects into the detail pane, opens on a double click and drags like a card.
 */
import { ArrowUpRight, Donut } from "lucide-react";
import { FOCUS } from "@/components/studio/menu-styles";
import { cn } from "@/lib/utils";
import type { GaugeEntry } from "@/lib/gauge-studio/model";
import type { RingsEntry } from "@/lib/gauge-studio/rings";
import { draggableGauge } from "./gauge-drag";
import { GaugeView } from "./gauge-view";

export interface OnScreensProps {
  gauges: GaugeEntry[];
  rings: RingsEntry[];
  selectedKey: string | null;
  /** The slow value every thumbnail shows. */
  p: number;
  scope: Record<string, string>;
  onSelect: (entry: GaugeEntry) => void;
  onOpen: (entry: GaugeEntry) => void;
  onDragStart: (entry: GaugeEntry, dt: DataTransfer) => void;
  onMenu: (entry: GaugeEntry, x: number, y: number) => void;
  /** Open the widget of a ring row on its screen and page. */
  onOpenWidget: (entry: RingsEntry) => void;
}

const CHIP = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-ui-sm border border-ui-strong px-2 text-caption text-ui-2";
const LINK = cn("inline-flex shrink-0 items-center gap-1 rounded-ui-sm px-1 text-caption text-ui-accent-text hover:underline", FOCUS);

/** "Canvas gauge", "Custom gauge widget" or an image sequence on a canvas. */
const kindOf = (e: GaugeEntry) => (e.source.kind === "widget" ? "Custom gauge widget" : "Canvas gauge");

/** An image sequence placed on a page has no editor here: its row opens it on the canvas. */
export const opensOnCanvas = (e: GaugeEntry): boolean => e.source.kind === "item" && !e.gauge;

const placeOf = (on: { screen: string; page: string } | undefined) => (on ? `${on.screen} / ${on.page}` : "");

/** What a gauge reads: its sensor where it has one, and its range and unit. */
function readsOf(e: GaugeEntry): string {
  const unit = e.gauge?.scale?.unit;
  const range = `${e.min}–${e.max}${unit ? ` ${unit}` : ""}`;
  return e.reads ? `${e.reads} · ${range}` : range;
}

export function OnScreens({ gauges, rings, selectedKey, p, scope, onSelect, onOpen, onDragStart, onMenu, onOpenWidget }: OnScreensProps) {
  return (
    <ul className="divide-y divide-ui-subtle overflow-hidden rounded-ui-lg border border-ui-default bg-ui-panel">
      {gauges.map((e) => (
        <li
          key={e.key}
          draggable={draggableGauge(e)}
          onDragStart={(ev) => onDragStart(e, ev.dataTransfer)}
          onContextMenu={(ev) => {
            ev.preventDefault();
            onSelect(e);
            const r = ev.currentTarget.getBoundingClientRect();
            if (ev.clientX === 0 && ev.clientY === 0) onMenu(e, r.left + 12, r.top + 12);
            else onMenu(e, ev.clientX, ev.clientY);
          }}
          className={cn("flex items-center gap-3 px-3 py-2.5", e.key === selectedKey && "bg-ui-active")}
        >
          <button
            type="button"
            aria-pressed={e.key === selectedKey}
            title={`${e.name}: double-click to edit`}
            onClick={() => onSelect(e)}
            onDoubleClick={() => onOpen(e)}
            className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-ui-md text-left", FOCUS)}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-ui-md border border-ui-subtle bg-ui-app">
              <GaugeView gauge={e.gauge} frames={e.frames} p={p} size={32} scope={scope} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ui-1">{e.name}</span>
              <span className="block truncate text-caption text-ui-3">{placeOf(e.on)}</span>
            </span>
            <span className={CHIP}>{kindOf(e)}</span>
            <span className="hidden min-w-0 max-w-65 flex-1 truncate font-ui-mono text-caption text-ui-3 min-[1100px]:block">{readsOf(e)}</span>
          </button>
          <button type="button" onClick={() => onOpen(e)} aria-label={`${opensOnCanvas(e) ? "Open on canvas" : "Edit gauge"} ${e.name}`} className={LINK}>
            {opensOnCanvas(e) ? "Open on canvas" : "Edit gauge"} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
      {rings.map((r) => (
        <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-ui-md border border-ui-subtle bg-ui-app text-ui-3">
              <Donut className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ui-1">{r.name}</span>
              <span className="block truncate text-caption text-ui-3">{placeOf(r.on)}</span>
            </span>
            <span className={CHIP}>Widget rings · {r.count}</span>
            <span className="hidden min-w-0 max-w-65 flex-1 truncate font-ui-mono text-caption text-ui-3 min-[1100px]:block">{r.reads}</span>
          </span>
          <button type="button" onClick={() => onOpenWidget(r)} aria-label={`Open widget ${r.name}`} title="Show it on the canvas" className={LINK}>
            Open widget <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
