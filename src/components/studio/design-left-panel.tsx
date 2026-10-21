import { useCallback, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { InsertPanel } from "./insert-panel";
import { LayersPanel } from "./layers-panel";
import { useStorageKey } from "./use-stored-flag";

/** The left panel's tabs: the zone list or the widget picker. */
export type LeftTab = "layers" | "add";

/** The left panel's width: 232px is the least (SPEC §6.1), a drag widens it up to the most. */
export const LEFT_MIN_WIDTH = 232;
export const LEFT_MAX_WIDTH = 440;

/** A width inside the left panel's range, rounded. */
export function clampLeftWidth(width: number): number {
  return Math.round(Math.min(LEFT_MAX_WIDTH, Math.max(LEFT_MIN_WIDTH, width)));
}

/** The stored left panel width; anything but a number = the least. */
export function parseLeftWidth(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? clampLeftWidth(n) : LEFT_MIN_WIDTH;
}

/** localStorage key holding the dragged left panel width. */
const WIDTH_KEY = "studio.drawerWidth";

/** The left panel's width, remembered across reloads (localStorage `studio.drawerWidth`). */
export function useStoredLeftWidth() {
  const [width, setWidth] = useState(() => {
    try {
      return parseLeftWidth(localStorage.getItem(WIDTH_KEY));
    } catch {
      return LEFT_MIN_WIDTH;
    }
  });
  const set = useCallback((next: number) => {
    const clamped = clampLeftWidth(next);
    setWidth(clamped);
    try {
      if (clamped === LEFT_MIN_WIDTH) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // Storage unavailable (private mode, quota): keep the session state.
    }
  }, []);
  useStorageKey(WIDTH_KEY, (raw) => setWidth(parseLeftWidth(raw)));
  return [width, set] as const;
}

interface SplitterProps {
  /** The left panel's current width. */
  width: number;
  /** Commit a dragged width. */
  onCommit: (width: number) => void;
}

/**
 * The grab area on the left panel's right edge. Like the dock's splitter, a
 * drag only moves a guide line and the width is committed on release (the
 * canvas does not re-lay out on every pointer move). Double-click resets to
 * the narrowest width.
 */
function Splitter({ width, onCommit }: SplitterProps) {
  /** The pointer's offset from where the drag started (px, right = positive). */
  const [drag, setDrag] = useState<number | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const target = (x: number) => clampLeftWidth(width + x - startX);
    const move = (ev: PointerEvent) => setDrag(target(ev.clientX) - width);
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      if (ev.type === "pointercancel") return;
      const next = target(ev.clientX);
      if (next !== width) onCommit(next);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the left panel"
      title="Drag to resize the panel (double-click for the narrowest)"
      onPointerDown={onPointerDown}
      onDoubleClick={() => onCommit(LEFT_MIN_WIDTH)}
      // Sits on the panel's right border: the border is the line, this is its grab area.
      className="group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none"
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ui-accent/0 transition-colors group-hover:bg-ui-accent/60",
          drag !== null && "bg-ui-accent"
        )}
        style={drag !== null ? { transform: `translateX(calc(-50% + ${drag}px))` } : undefined}
      />
    </div>
  );
}

interface DesignLeftPanelProps {
  tab: LeftTab;
  onTab: (tab: LeftTab) => void;
  /** The panel's width, and the commit of a dragged one. */
  width: number;
  onResize: (width: number) => void;
  layers: ComponentProps<typeof LayersPanel>;
  insert: ComponentProps<typeof InsertPanel>;
}

/** The Design view's left panel (SPEC §6.1): Layers | Add widget, beside the rail; its right edge drags wider. */
export function DesignLeftPanel({ tab, onTab, width, onResize, layers, insert }: DesignLeftPanelProps) {
  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ui-subtle bg-ui-panel font-ui" style={{ width }}>
      <div className="shrink-0 px-3 pb-2 pt-3">
        <Segmented
          label="Left panel"
          className="w-full flex-nowrap [&>button]:flex-1"
          value={tab}
          onChange={onTab}
          options={[
            { value: "layers", label: "Layers" },
            { value: "add", label: "Add widget" },
          ]}
        />
      </div>
      {tab === "layers" ? <LayersPanel {...layers} /> : <InsertPanel {...insert} />}
      <Splitter width={width} onCommit={onResize} />
    </aside>
  );
}
