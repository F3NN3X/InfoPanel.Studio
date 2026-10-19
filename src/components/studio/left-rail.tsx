import { useCallback, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Bell, Database, Gauge, Images, Keyboard, Layers, PanelTop, SquarePlus, Monitor, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The left panel's width: the original 256px is the least, a drag widens it up to the most. */
export const DRAWER_MIN_WIDTH = 256;
export const DRAWER_MAX_WIDTH = 440;

/** A width inside the left panel's range, rounded. */
export function clampDrawerWidth(width: number): number {
  return Math.round(Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, width)));
}

/** The stored left panel width; anything but a number = the least. */
export function parseDrawerWidth(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? clampDrawerWidth(n) : DRAWER_MIN_WIDTH;
}

/** localStorage key holding the dragged left panel width. */
const WIDTH_KEY = "studio.drawerWidth";

/** The left panel's width, remembered across reloads (localStorage `studio.drawerWidth`). */
export function useStoredDrawerWidth() {
  const [width, setWidth] = useState(() => {
    try {
      return parseDrawerWidth(localStorage.getItem(WIDTH_KEY));
    } catch {
      return DRAWER_MIN_WIDTH;
    }
  });
  const set = useCallback((next: number) => {
    const clamped = clampDrawerWidth(next);
    setWidth(clamped);
    try {
      if (clamped === DRAWER_MIN_WIDTH) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // Storage unavailable (private mode, quota): keep the session state.
    }
  }, []);
  return [width, set] as const;
}

/** The left panels; Sources is a canvas mode, not a panel. */
export type Drawer = "add" | "layers" | "profiles" | "island" | "alerts";
export type RailItem = Drawer | "library" | "gauges" | "sources";

const RAIL: { id: RailItem; label: string; icon: LucideIcon }[] = [
  { id: "layers", label: "Layers", icon: Layers },
  { id: "add", label: "Add", icon: SquarePlus },
  { id: "profiles", label: "Profiles", icon: Monitor },
  { id: "island", label: "Dynamic Island", icon: PanelTop },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "library", label: "Library", icon: Images },
  { id: "gauges", label: "Gauges", icon: Gauge },
  { id: "sources", label: "Data sources", icon: Database },
];

/** localStorage key holding the open drawer ("none" when collapsed). */
const STORAGE_KEY = "studio.drawer";

/** The stored drawer; null = collapsed, anything unknown = Add. */
export function parseDrawer(raw: string | null): Drawer | null {
  if (raw === "none") return null;
  return raw === "layers" || raw === "profiles" || raw === "island" || raw === "alerts" ? raw : "add";
}

/** The open drawer, remembered across reloads (localStorage `studio.drawer`). */
export function useStoredDrawer() {
  const [drawer, setDrawer] = useState<Drawer | null>(() => {
    try {
      return parseDrawer(localStorage.getItem(STORAGE_KEY));
    } catch {
      return "add";
    }
  });
  const set = (next: Drawer | null) => {
    setDrawer(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ?? "none");
    } catch {
      // Storage unavailable (private mode, quota): keep the session state.
    }
  };
  return [drawer, set] as const;
}

interface LeftRailProps {
  /** The highlighted item (open drawer or Sources), or null. */
  active: RailItem | null;
  onSelect: (item: RailItem) => void;
  /** The keyboard icon at the bottom opens the shortcuts sheet. */
  onShortcuts: () => void;
}

interface RailButtonProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}

/** One 38×38 rail icon with a tooltip to its right. */
function RailButton({ label, icon: Icon, active, onClick }: RailButtonProps) {
  return (
    // Not hoverable: the popup sits over the panel, and hovering it
    // must not keep it open once the pointer leaves the rail.
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
          active ? "bg-[#1e1e24] text-ui-1" : "text-ui-4 hover:bg-ui-hover hover:text-ui-2"
        )}
      >
        <Icon className="h-[21px] w-[21px]" strokeWidth={1.5} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={8} className="z-50">
          <Tooltip.Popup className="pointer-events-none rounded-md border border-ui-menu bg-ui-raised px-2 py-1 font-ui text-xs text-ui-2 shadow-ui-menu">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** 52px icon rail at the studio's left edge; each icon opens a left panel, Sources the explorer. */
export function LeftRail({ active, onSelect, onShortcuts }: LeftRailProps) {
  return (
    <Tooltip.Provider delay={300}>
      <nav className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-ui-subtle bg-ui-chrome py-2.5">
        {RAIL.map((item) => (
          <RailButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={active === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
        <div className="mt-auto">
          <RailButton label="Keyboard shortcuts" icon={Keyboard} onClick={onShortcuts} />
        </div>
      </nav>
    </Tooltip.Provider>
  );
}

interface DrawerSplitterProps {
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
function DrawerSplitter({ width, onCommit }: DrawerSplitterProps) {
  /** The pointer's offset from where the drag started (px, right = positive). */
  const [drag, setDrag] = useState<number | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const target = (x: number) => clampDrawerWidth(width + x - startX);
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
      onDoubleClick={() => onCommit(DRAWER_MIN_WIDTH)}
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

interface LeftDrawerProps {
  /** The panel's width (px). */
  width: number;
  /** Commit a dragged width. */
  onResize: (width: number) => void;
  children: ReactNode;
}

/**
 * The left panel next to the rail, widened by dragging its right edge; the
 * panels bring their own header and scrolling.
 */
export function LeftDrawer({ width, onResize, children }: LeftDrawerProps) {
  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ui-subtle bg-ui-panel font-ui" style={{ width }}>
      {children}
      <DrawerSplitter width={width} onCommit={onResize} />
    </aside>
  );
}
