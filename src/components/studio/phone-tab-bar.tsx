import { Menu } from "@base-ui/react/menu";
import { Bell, CircleHelp, Database, Ellipsis, Gauge, Images, LayoutDashboard, Monitor, Palette, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RailItem } from "./left-rail";

/** The bar's own tabs; everything else is under More (SPEC §3.5). */
const TABS: { id: RailItem; label: string; icon: LucideIcon }[] = [
  { id: "design", label: "Edit", icon: LayoutDashboard },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "library", label: "Library", icon: Images },
];

/** What More holds, in order; Help opens its window, so it is not a view. */
const MORE: { id: RailItem | "help"; label: string; icon: LucideIcon }[] = [
  { id: "screens", label: "Screens", icon: Monitor },
  { id: "gauges", label: "Gauges", icon: Gauge },
  { id: "data", label: "Data", icon: Database },
  { id: "alerts", label: "Alerts & Island", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: CircleHelp },
];

interface PhoneTabBarProps {
  /** The highlighted view. */
  active: RailItem;
  onSelect: (item: RailItem) => void;
  onHelp: () => void;
}

const TAB =
  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[9.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-accent/60";
const POPUP =
  "min-w-52 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[13px] text-ui-2 shadow-ui-menu outline-none";
const ITEM =
  "flex h-11 cursor-default items-center gap-2.5 rounded-md px-2.5 outline-none select-none data-highlighted:bg-ui-hover data-[active]:text-ui-1";

/** The phone's rail: a 52 px bottom bar, Edit · Theme · Library · More (Screens, Gauges, Data, Alerts & Island, Settings, Help). */
export function PhoneTabBar({ active, onSelect, onHelp }: PhoneTabBarProps) {
  const inMore = MORE.some((m) => m.id === active);
  return (
    <nav aria-label="Studio views" className="flex h-[52px] shrink-0 border-t border-ui-subtle bg-ui-chrome">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
          className={cn(TAB, active === id ? "text-ui-1" : "text-ui-4")}
        >
          <Icon className="h-5 w-5" strokeWidth={1.5} />
          {label}
        </button>
      ))}
      <Menu.Root>
        <Menu.Trigger aria-label="More" className={cn(TAB, inMore ? "text-ui-1" : "text-ui-4")}>
          <Ellipsis className="h-5 w-5" strokeWidth={1.5} />
          More
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" side="top" align="end" sideOffset={6}>
            <Menu.Popup className={POPUP}>
              {MORE.map(({ id, label, icon: Icon }) => (
                <Menu.Item
                  key={id}
                  className={ITEM}
                  data-active={id === active ? "" : undefined}
                  onClick={() => (id === "help" ? onHelp() : onSelect(id))}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} /> {label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </nav>
  );
}
