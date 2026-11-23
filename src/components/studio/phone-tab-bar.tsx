import { Menu } from "@/components/ui/menu";
import { Bell, Blocks, CircleHelp, Database, Ellipsis, Gauge, Images, LayoutDashboard, Monitor, Palette, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RailItem } from "./studio-nav";

/** The bar's own tabs; everything else is under More (SPEC §3.5). */
const TABS: { id: RailItem; label: string; icon: LucideIcon }[] = [
  { id: "design", label: "Edit", icon: LayoutDashboard },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "library", label: "Library", icon: Images },
];

/** What More holds, in order; Help opens its window, so it is not a view. */
const MORE: { id: RailItem | "help"; label: string; icon: LucideIcon }[] = [
  { id: "screens", label: "Screens", icon: Monitor },
  { id: "widgets", label: "Widgets", icon: Blocks },
  { id: "gauges", label: "Gauges", icon: Gauge },
  { id: "data", label: "Data sources", icon: Database },
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
  "flex flex-1 flex-col items-center justify-center gap-0.5 text-micro font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-accent/60";

/** The phone's rail: a 52 px bottom bar, Edit · Theme · Library · More (Screens, Widgets, Gauges, Data sources, Alerts & Island, Settings, Help). */
export function PhoneTabBar({ active, onSelect, onHelp }: PhoneTabBarProps) {
  const inMore = MORE.some((m) => m.id === active);
  return (
    <nav aria-label="Studio views" className="flex h-13 shrink-0 border-t border-ui-subtle bg-ui-chrome">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={active === id ? "page" : undefined}
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
        <Menu.Content side="top" align="end" sideOffset={6} className="min-w-52">
          {MORE.map(({ id, label, icon: Icon }) => (
            <Menu.Item
              key={id}
              className="h-11 justify-start gap-2.5 px-2.5 data-[active]:text-ui-1"
              data-active={id === active ? "" : undefined}
              onClick={() => (id === "help" ? onHelp() : onSelect(id))}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} /> {label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
    </nav>
  );
}
