import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import type { DashboardConfig, MonitorProfile, ProfilePage } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { ITEM, POPUP } from "./menu-styles";
import type { ThemeAt } from "./theme-cards";

interface ThemeScopeBarProps {
  config: DashboardConfig;
  at: ThemeAt;
  /** The screen and page the Screen and Page segments name (the Design selection until another is picked). */
  profile: MonitorProfile;
  page: ProfilePage;
  /** Pick a level; `profileId` / `pageId` move the control to another screen or page. */
  onPick: (level: ThemeAt["level"], profileId: string, pageId: string) => void;
}

/** One segment: a bold label and its mono sub-label; active on #27272a. */
function Segment({ label, sub, active, onClick }: { label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        active ? "bg-[#27272a] text-[#fafafa]" : "text-ui-3 hover:text-ui-1"
      )}
    >
      <span className="truncate">{label}</span>
      <span className="font-ui-mono text-[11px] font-normal text-[#71717a] max-sm:hidden">{sub}</span>
    </button>
  );
}

/** A segment's menu: pick another screen or page. */
function Pick<T extends { id: string; name: string }>({
  label,
  items,
  current,
  meta,
  onPick,
}: {
  label: string;
  items: readonly T[];
  current: string;
  meta?: (item: T) => string;
  onPick: (item: T) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        title={label}
        className="-ml-0.5 flex h-7 w-4 shrink-0 items-center justify-center rounded-md text-[#71717a] hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
      >
        <ChevronDown className="h-3 w-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="start">
          <Menu.Popup className={cn(POPUP, "min-w-52")}>
            {items.map((item) => (
              <Menu.Item key={item.id} className={cn(ITEM, item.id === current && "text-ui-1")} onClick={() => onPick(item)}>
                <span className="truncate">{item.name}</span>
                {meta && <span className="font-ui-mono text-[11px] text-ui-4">{meta(item)}</span>}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Theme's level control (handoff SPEC §4.2): All screens · ‹screen› · ‹page›, each with its mono sub-label (the
 * screen count, the screen's size, "page"). The screen and page segments have a menu for another screen or page;
 * picking one keeps the level.
 */
export function ThemeScopeBar({ config, at, profile, page, onPick }: ThemeScopeBarProps) {
  const screens = config.profiles.length;
  return (
    <div role="group" aria-label="Theme level" className="flex min-w-0 items-center gap-0.5 rounded-lg border border-ui-default bg-ui-tile p-0.5 max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
      <Segment label="All screens" sub={String(screens)} active={at.level === "all"} onClick={() => onPick("all", profile.id, page.id)} />
      <Segment label={profile.name} sub={`${profile.width}×${profile.height}`} active={at.level === "screen"} onClick={() => onPick("screen", profile.id, page.id)} />
      {screens > 1 && (
        <Pick
          label="Another screen"
          items={config.profiles}
          current={profile.id}
          meta={(p) => `${p.width}×${p.height}`}
          onPick={(p) => onPick(at.level === "all" ? "screen" : at.level, p.id, p.id === profile.id ? page.id : p.pages[0].id)}
        />
      )}
      <Segment label={page.name} sub="page" active={at.level === "page"} onClick={() => onPick("page", profile.id, page.id)} />
      {profile.pages.length > 1 && <Pick label="Another page" items={profile.pages} current={page.id} onPick={(pg) => onPick("page", profile.id, pg.id)} />}
    </div>
  );
}
