import { lazy, Suspense, type ReactElement, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import { Bell, Blocks, ChevronRight, CircleHelp, Gauge, Images, Keyboard, LayoutGrid, Palette, PanelLeft, Pencil, Radio, Search, Settings, type LucideIcon } from "lucide-react";
import { CONTROL_MOTION, FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusDot } from "@/components/ui/status-chip";
import type { DashboardConfig } from "@/lib/layout";
import { isTauri } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { HIGHLIGHT, ITEM, POPUP } from "../menu-styles";
import { StudioLogo } from "../studio-logo";
import type { NavTarget, RailItem } from "../studio-nav";
import { useStoredFlag } from "../use-stored-flag";
import type { StudioStatus } from "../use-status-bar";
import { KEYS } from "../use-studio-shortcuts";
import { useDownMs } from "../use-data-api-grace";
import { attentionItems, cardLine, LINK_CHIP } from "./data-api-model";

/** The Data API popover's content comes with the first open. */
const DataApiPanel = lazy(() => import("./data-api-panel"));

/**
 * Whether the user collapsed the sidebar to the rail, the same on every page: a local flag, no config key. Only a
 * choice made with the toggle is stored. The name is from when Edit had a flag of its own (`studio.sidebar.editor`,
 * which opened on the rail); that one is no longer read, nor removed.
 */
export const SIDEBAR_KEY = "studio.sidebar.workspace";
/** Below this window width the sidebar stays a rail (Q6). */
const RAIL_MAX = 960;

const VIEWS: readonly { id: RailItem; label: string; icon: LucideIcon }[] = [
  { id: "theme", label: "Theme", icon: Palette },
  { id: "library", label: "Library", icon: Images },
  { id: "widgets", label: "Widgets", icon: Blocks },
  { id: "gauges", label: "Gauges", icon: Gauge },
  { id: "alerts", label: "Alerts & Island", icon: Bell },
  { id: "data", label: "Data sources", icon: Radio },
];

interface StudioSidebarProps {
  /** The highlighted view. */
  active: RailItem;
  onSelect: (item: RailItem) => void;
  /** The screen Edit opens on ("Edit <screen>", Q1). */
  screenName: string;
  /** Alerts firing now (the red badge). */
  alerts: number;
  windowWidth: number;
  status: StudioStatus;
  config: DashboardConfig;
  /** Write the Data API address (`config.dataApiUrl`, one undo step). */
  onAddress: (url: string) => void;
  onNavigate: (target: NavTarget) => void;
  /** The Data API popover's open state (the palette opens it). */
  dataApiOpen: boolean;
  onDataApiOpenChange: (open: boolean) => void;
  onHelp: () => void;
  onShortcuts: () => void;
  onPalette: () => void;
  /** The Live control's trigger, on a workspace page (no top bar there); a function of the rail state. */
  live?: (rail: boolean, tip: (trigger: ReactElement<Record<string, unknown>>, label: string) => ReactElement) => ReactNode;
}

/** A nav row: 36 px, an 18 px icon; a square of the same height on the rail. */
const rowClass = (rail: boolean, active?: boolean) =>
  cn(
    "relative flex h-9 shrink-0 items-center rounded-ui-md text-body",
    rail ? "w-9 justify-center self-center" : "w-full gap-2.5 px-3",
    FOCUS_RING,
    CONTROL_MOTION,
    "active:scale-100",
    active ? "bg-ui-raised text-ui-1" : "text-ui-3 hover:bg-ui-raised hover:text-ui-1",
  );

/** On the rail an item's name is a tooltip; the expanded sidebar has it in the row. */
function RailTip({ label, rail, children }: { label: string; rail: boolean; children: ReactElement<Record<string, unknown>> }) {
  return (
    // Always this tree, disabled off the rail: another element type would remount the trigger and drop its focus when `rail` flips.
    // Not hoverable: the popup sits over the view, and hovering it must not keep it open once the pointer leaves the rail.
    <Tooltip.Root disableHoverablePopup disabled={!rail}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={8} className="z-50">
          <Tooltip.Popup className="pointer-events-none rounded-ui-sm border border-ui-menu bg-ui-raised px-2 py-1 font-ui text-caption text-ui-2 shadow-ui-menu">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface NavRowProps {
  label: string;
  /** The row's visible text, when it differs from the name. */
  text?: ReactNode;
  icon: LucideIcon;
  rail: boolean;
  active?: boolean;
  /** A count beside the name; a red dot on the rail. */
  badge?: number;
  title?: string;
  onClick: () => void;
}

function NavRow({ label, text, icon: Icon, rail, active, badge = 0, title, onClick }: NavRowProps) {
  return (
    <RailTip label={label} rail={rail}>
      <button type="button" aria-label={badge > 0 ? `${label}, ${badge} active` : label} aria-current={active ? "page" : undefined} title={title} onClick={onClick} className={rowClass(rail, active)}>
        <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.5} aria-hidden />
        {!rail && <span className="min-w-0 flex-1 truncate text-left">{text ?? label}</span>}
        {badge > 0 && (rail ? <span aria-hidden className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-ui-danger" /> : <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ui-danger/12 px-1 text-micro text-ui-danger">{badge}</span>)}
      </button>
    </RailTip>
  );
}

/** Help and shortcuts (Q5): the article for this view, the shortcut sheet, the palette and Settings, each with its key. */
function HelpMenu({ rail, onHelp, onShortcuts, onPalette, onSettings }: { rail: boolean; onHelp: () => void; onShortcuts: () => void; onPalette: () => void; onSettings: () => void }) {
  const rows = [
    { label: "Help", hint: "F1", icon: CircleHelp, run: onHelp },
    { label: "Keyboard shortcuts", hint: KEYS.cheatsheet, icon: Keyboard, run: onShortcuts },
    { label: "Search or run a command", hint: KEYS.palette, icon: Search, run: onPalette },
    { label: "Settings", hint: KEYS.settings, icon: Settings, run: onSettings },
  ];
  return (
    <Menu.Root>
      <RailTip label="Help and shortcuts" rail={rail}>
        <Menu.Trigger aria-label="Help and shortcuts" className={cn(rowClass(rail), "data-popup-open:bg-ui-raised data-popup-open:text-ui-1")}>
          <CircleHelp className="h-4.5 w-4.5 shrink-0" strokeWidth={1.5} aria-hidden />
          {!rail && <span className="min-w-0 flex-1 truncate text-left">Help and shortcuts</span>}
        </Menu.Trigger>
      </RailTip>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" side="right" align="end" sideOffset={25}>
          <Menu.Popup className={cn(POPUP, "w-64")}>
            {rows.map(({ label, hint, icon: Icon, run }) => (
              <Menu.Item key={label} className={cn(ITEM, HIGHLIGHT)} onClick={run}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
                  {label}
                </span>
                <span className="font-ui-mono text-micro text-ui-hint group-data-highlighted:text-ui-2">{hint}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** What needs the user: an update, a pending restart, a server that isn't running, edits the server hasn't got (Q3). */
function AttentionRows({ status, rail, onNavigate }: { status: StudioStatus; rail: boolean; onNavigate: (t: NavTarget) => void }) {
  return attentionItems(status, onNavigate).map((item) => (
    <RailTip key={item.id} label={item.label} rail={rail}>
      <button type="button" aria-label={item.label} title={rail ? undefined : item.tip} onClick={item.onClick} className={cn(rowClass(rail), "text-ui-warn hover:text-ui-warn")}>
        <StatusDot tone={item.tone === "bad" ? "danger" : "warn"} />
        {!rail && <span className="min-w-0 flex-1 truncate text-left text-caption">{item.label}</span>}
      </button>
    </RailTip>
  ));
}

/** The Data API card and its popover: a dot and two lines, the dot alone on the rail. */
function DataApiCard({ rail, status, config, onAddress, onNavigate, open, setOpen }: Pick<StudioSidebarProps, "status" | "config" | "onAddress" | "onNavigate"> & { rail: boolean; open: boolean; setOpen: (open: boolean) => void }) {
  const { apiHealth, dataApi } = status;
  const line = cardLine(apiHealth.link, dataApi.latencyMs, useDownMs(apiHealth));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <RailTip label={`Data API: ${line}`} rail={rail}>
        <Popover.Trigger
          aria-label={`Data API: ${line}`}
          className={cn(
            "flex shrink-0 items-center rounded-ui-lg border border-ui-subtle bg-ui-panel text-left hover:border-ui-strong data-popup-open:border-ui-strong",
            FOCUS_RING,
            CONTROL_MOTION,
            "active:scale-100",
            rail ? "h-11 w-9 justify-center self-center" : "h-13.5 w-full gap-2 px-3",
          )}
        >
          <StatusDot tone={LINK_CHIP[apiHealth.link].tone} />
          {!rail && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ui-1">Data API</span>
                <span className={cn("block truncate text-caption", apiHealth.link === "slow" ? "text-ui-warn" : "text-ui-3")}>{line}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
            </>
          )}
        </Popover.Trigger>
      </RailTip>
      <Popover.Portal>
        <Popover.Positioner side="right" align="end" sideOffset={25} collisionPadding={12} className="z-[80]">
          <Popover.Popup data-help-article="sensors" className="w-92 rounded-ui-lg border border-ui-menu bg-ui-panel p-4 font-ui text-body text-ui-2 shadow-ui-menu outline-none transition-opacity duration-(--ui-dur-menu) ease-ui data-ending-style:opacity-0 data-starting-style:opacity-0">
            <Suspense fallback={<div className="h-105" />}>
              <DataApiPanel
                status={status}
                config={config}
                onAddress={onAddress}
                onOpenData={() => {
                  setOpen(false);
                  onNavigate({ view: "data" });
                }}
              />
            </Suspense>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The app sidebar on every page but a phone's (232 px, a 60 px rail when collapsed): the Frame mark, the views, then
 * Settings, Help and shortcuts, what needs attention and the Data API card. Collapse is the user's choice, kept
 * across every page and open by default. Below 960 px it stays a rail. A lazy chunk, so the studio's entry does not carry it.
 */
export default function StudioSidebar(props: StudioSidebarProps) {
  const { active, onSelect, screenName, alerts, windowWidth, status, onHelp, onShortcuts, onPalette, onNavigate, live } = props;
  const [collapsed, setCollapsed] = useStoredFlag(SIDEBAR_KEY, false);
  const narrow = windowWidth < RAIL_MAX;
  const rail = narrow || collapsed;
  const drag = isTauri();
  const toggle = () => setCollapsed(!collapsed);
  const collapseButton = !narrow && (
    <IconButton label={rail ? "Expand sidebar" : "Collapse sidebar"} size={30} aria-expanded={!rail} onClick={toggle} className={rail ? "self-center" : undefined}>
      <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
    </IconButton>
  );
  return (
    <Tooltip.Provider delay={300}>
      <aside aria-label="Studio sidebar" className={cn("flex min-h-0 shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-ui-subtle bg-ui-chrome p-3 font-ui", rail ? "w-15" : "w-58")}>
        {/* The sidebar runs the full height on every page and the title bar (the top bar, or the window strip) starts after it: its header row drags the window. */}
        <div data-tauri-drag-region={drag ? "" : undefined} className={cn("mb-3 flex h-8 shrink-0 items-center gap-2", rail ? "justify-center" : "pl-1")}>
          {narrow || !rail ? <StudioLogo className="pointer-events-none h-7 w-7 shrink-0" /> : null}
          {!rail && <span className={cn("min-w-0 flex-1 truncate text-body font-medium text-ui-1", drag && "pointer-events-none")}>InfoPanel Studio</span>}
          {collapseButton}
        </div>
        <nav aria-label="Studio views" className="flex shrink-0 flex-col gap-0.5">
          <NavRow label="Screens" icon={LayoutGrid} rail={rail} active={active === "screens"} onClick={() => onSelect("screens")} />
          <NavRow label={`Edit ${screenName}`} text="Edit" icon={Pencil} rail={rail} active={active === "design"} onClick={() => onSelect("design")} />
          {VIEWS.map((v) => (
            <NavRow key={v.id} label={v.label} icon={v.icon} rail={rail} active={active === v.id} badge={v.id === "alerts" ? alerts : 0} onClick={() => onSelect(v.id)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5">
          <NavRow label="Settings" icon={Settings} rail={rail} title={status.server.kind === "browser" ? "App settings live in the desktop app" : undefined} onClick={() => onSelect("settings")} />
          <HelpMenu rail={rail} onHelp={onHelp} onShortcuts={onShortcuts} onPalette={onPalette} onSettings={() => onSelect("settings")} />
          {live?.(rail, (trigger, label) => (
            <RailTip label={label} rail={rail}>
              {trigger}
            </RailTip>
          ))}
          <AttentionRows status={status} rail={rail} onNavigate={onNavigate} />
          <div className="mt-2 flex flex-col">
            <DataApiCard rail={rail} status={status} config={props.config} onAddress={props.onAddress} onNavigate={onNavigate} open={props.dataApiOpen} setOpen={props.onDataApiOpenChange} />
          </div>
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
