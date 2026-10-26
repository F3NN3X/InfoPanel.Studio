import { Fragment } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Bell, CircleHelp, Database, Gauge, Images, LayoutDashboard, Monitor, Palette, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The rail's full views (SPEC §3.2, PLAN decision 24), and Settings, which opens its own window. `design` is Edit,
 * for grid screens and InfoPanel profiles alike (one-editor SPEC §4.1, D1). `infopanel` has no button any more: it
 * stays as a route alias for old links and commands, and lands on Screens' InfoPanel filter.
 */
export type RailItem = "design" | "theme" | "screens" | "library" | "gauges" | "infopanel" | "data" | "alerts" | "settings";

/** The rail's items in groups; a thin divider sits between groups. Nothing addresses a button by position. */
const GROUPS: { id: RailItem; label: string; icon: LucideIcon }[][] = [
  [
    { id: "screens", label: "Screens", icon: Monitor },
    { id: "design", label: "Edit", icon: LayoutDashboard },
  ],
  [
    { id: "theme", label: "Theme", icon: Palette },
    { id: "library", label: "Library", icon: Images },
    { id: "gauges", label: "Gauges", icon: Gauge },
    { id: "alerts", label: "Alerts & Island", icon: Bell },
    { id: "data", label: "Data", icon: Database },
  ],
];

interface LeftRailProps {
  /** The highlighted view. */
  active: RailItem;
  onSelect: (item: RailItem) => void;
  /** Help opens its window at the article for the current view. */
  onHelp: () => void;
  /** Under 960 px the labels drop and the rail is 48 px wide (tooltips stay). */
  narrow: boolean;
}

interface RailButtonProps {
  label: string;
  icon: LucideIcon;
  narrow: boolean;
  active?: boolean;
  onClick: () => void;
}

/** One labelled rail item: a 20 px icon over a 10.5 px label (icon only when narrow, with a tooltip). */
function RailButton({ label, icon: Icon, narrow, active, onClick }: RailButtonProps) {
  return (
    // Not hoverable: the popup sits over the view, and hovering it
    // must not keep it open once the pointer leaves the rail.
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex flex-col items-center gap-[3px] rounded-lg pb-[6px] pt-[7px] transition-colors",
          narrow ? "h-9 w-9 justify-center p-0" : "w-[62px] px-0.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
          active ? "bg-ui-active text-ui-1" : "text-ui-4 hover:bg-ui-hover hover:text-ui-2"
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.5} />
        {!narrow && <span className="text-[10.5px] font-medium leading-tight">{label}</span>}
      </Tooltip.Trigger>
      {narrow && (
        <Tooltip.Portal>
          <Tooltip.Positioner side="right" sideOffset={8} className="z-50">
            <Tooltip.Popup className="pointer-events-none rounded-md border border-ui-menu bg-ui-raised px-2 py-1 font-ui text-xs text-ui-2 shadow-ui-menu">
              {label}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}

/** The studio's rail (72 px, labelled): every item but Help is a full view. */
export function LeftRail({ active, onSelect, onHelp, narrow }: LeftRailProps) {
  return (
    <Tooltip.Provider delay={300}>
      <nav
        aria-label="Studio views"
        className={cn(
          "flex shrink-0 flex-col items-center gap-1 border-r border-ui-subtle bg-ui-chrome py-2.5",
          narrow ? "w-12" : "w-[72px]"
        )}
      >
        {GROUPS.map((group, i) => (
          <Fragment key={group[0].id}>
            {i > 0 && <div role="separator" className="my-1 h-px w-8 bg-ui-default" />}
            {group.map((item) => (
              <RailButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                narrow={narrow}
                active={active === item.id}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </Fragment>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <RailButton label="Help" icon={CircleHelp} narrow={narrow} onClick={onHelp} />
          <RailButton label="Settings" icon={Settings} narrow={narrow} active={active === "settings"} onClick={() => onSelect("settings")} />
        </div>
      </nav>
    </Tooltip.Provider>
  );
}
