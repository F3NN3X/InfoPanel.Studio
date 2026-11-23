import { Menu } from "@/components/ui/menu";
import { Check, ChevronDown, Monitor } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import type { DashboardConfig, MonitorProfile, ProfilePage } from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { ThemeAt } from "./theme-cards";

interface ThemeScopeBarProps {
  config: DashboardConfig;
  at: ThemeAt;
  /** The screen and page the level names (the Design selection until another is picked). */
  profile: MonitorProfile;
  page: ProfilePage;
  /** Pick a level; `profileId` / `pageId` move the control to another screen or page. */
  onPick: (level: ThemeAt["level"], profileId: string, pageId: string) => void;
}

/**
 * Theme's level picker: ‹screen› · whole screen, or ‹screen› › ‹page› page, one control with a menu of every screen and its
 * pages. Each screen owns its theme; a page changes sections of it.
 */
export function ThemeScopeBar({ config, at, profile, page, onPick }: ThemeScopeBarProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Theme level"
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-2 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body text-ui-1 hover:border-ui-hover-edge data-popup-open:border-ui-hover-edge",
          FOCUS_RING
        )}
      >
        <Monitor className="h-4 w-4 shrink-0 text-ui-3" strokeWidth={1.5} aria-hidden />
        <span className="truncate">{profile.name}</span>
        <span className="truncate text-ui-3 max-sm:hidden">{at.level === "screen" ? "· whole screen" : `› ${page.name} page`}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ui-hint" aria-hidden />
      </Menu.Trigger>
      <Menu.Content sideOffset={4} align="start" className="max-h-[60vh] min-w-64 overflow-y-auto">
        {config.profiles.map((p) => (
          <Menu.Group key={p.id}>
            <Menu.GroupLabel className="px-2 pb-1 pt-2 text-caption text-ui-3">
              {p.name} <span className="font-ui-mono">{p.width}×{p.height}</span>
            </Menu.GroupLabel>
            <Menu.Item onClick={() => onPick("screen", p.id, p.id === profile.id ? page.id : p.pages[0].id)}>
              <span>Whole screen</span>
              {at.level === "screen" && p.id === profile.id && <Check className="h-4 w-4" aria-hidden />}
            </Menu.Item>
            {p.pages.map((pg) => (
              <Menu.Item key={pg.id} onClick={() => onPick("page", p.id, pg.id)}>
                <span className="truncate">{pg.name} page</span>
                {at.level === "page" && p.id === profile.id && pg.id === page.id && <Check className="h-4 w-4" aria-hidden />}
              </Menu.Item>
            ))}
          </Menu.Group>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
