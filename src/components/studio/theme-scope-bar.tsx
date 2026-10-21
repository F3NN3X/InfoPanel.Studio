import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, ChevronRight, Globe, LayoutDashboard, Monitor } from "lucide-react";
import type { DashboardConfig, MonitorProfile, ProfilePage } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { ITEM, POPUP } from "./menu-styles";
import { pageIcon } from "./page-icons";
import { ownCount, type ThemeAt } from "./theme-cards";

interface ThemeScopeBarProps {
  config: DashboardConfig;
  at: ThemeAt;
  /** The screen and page the Screen and Page buttons name (the Design selection until another is picked). */
  profile: MonitorProfile;
  page: ProfilePage;
  /** Pick a scope; `profileId` / `pageId` move the bar to another screen or page. */
  onPick: (level: ThemeAt["level"], profileId: string, pageId: string) => void;
}

/** One crumb: icon, label and its mono sub-line; active on #26262c. */
function Crumb({ icon, label, sub, active, onClick }: { icon: ReactNode; label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[30px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0",
        active ? "bg-[#26262c] text-ui-1" : "text-[#9a9aa4] hover:text-ui-1"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="font-ui-mono text-[10.5px] font-normal text-[#7c7c86] max-sm:hidden">{sub}</span>
    </button>
  );
}

/** A crumb's dropdown: pick another screen or page. */
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
        className="flex h-[30px] w-5 shrink-0 items-center justify-center rounded-md text-[#7c7c86] hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
      >
        <ChevronDown className="h-3.5 w-3.5" />
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

const Sep = () => <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#4a4a53]" />;

/**
 * Theme's scope bar (SPEC §7.1): All screens › ‹Screen› › Page: ‹page›, a segmented breadcrumb. The screen and
 * page buttons each have a dropdown for another screen or page; picking one keeps the level.
 */
export function ThemeScopeBar({ config, at, profile, page, onPick }: ThemeScopeBarProps) {
  const screens = config.profiles.length;
  const screenAt: ThemeAt = { level: "screen", profileId: profile.id };
  const pageAt: ThemeAt = { level: "page", profileId: profile.id, pageId: page.id };
  const PageIcon = pageIcon(page.icon) ?? LayoutDashboard;
  return (
    <div role="group" aria-label="Theme scope" className="flex min-w-0 items-center gap-0.5 rounded-lg border border-ui-default bg-ui-tile p-0.5 max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
      <Crumb
        icon={<Globe />}
        label="All screens"
        sub={`${screens} ${screens === 1 ? "screen" : "screens"}`}
        active={at.level === "all"}
        onClick={() => onPick("all", profile.id, page.id)}
      />
      <Sep />
      <Crumb
        icon={<Monitor />}
        label={profile.name}
        sub={`${profile.width}×${profile.height} · ${ownCount(config, screenAt)} own`}
        active={at.level === "screen"}
        onClick={() => onPick("screen", profile.id, page.id)}
      />
      <Pick
        label="Another screen"
        items={config.profiles}
        current={profile.id}
        meta={(p) => `${p.width}×${p.height}`}
        onPick={(p) => onPick(at.level === "all" ? "screen" : at.level, p.id, p.id === profile.id ? page.id : p.pages[0].id)}
      />
      <Sep />
      <Crumb
        icon={<PageIcon />}
        label={`Page: ${page.name}`}
        sub={`${ownCount(config, pageAt)} own`}
        active={at.level === "page"}
        onClick={() => onPick("page", profile.id, page.id)}
      />
      <Pick label="Another page" items={profile.pages} current={page.id} onPick={(pg) => onPick("page", profile.id, pg.id)} />
    </div>
  );
}
