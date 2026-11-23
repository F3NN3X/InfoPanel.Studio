import { useState } from "react";
import { PopoverParts } from "@/components/ui/popover";
import { Monitor } from "lucide-react";
import type { MonitorProfile } from "@/lib/layout";
import { importedFromInfoPanel } from "@/lib/screens/list";
import { cn } from "@/lib/utils";

interface ScreenSwitcherProps {
  profiles: MonitorProfile[];
  /** The screen on the canvas. */
  profile: MonitorProfile;
  /** The page on the canvas. */
  pageId: string;
  /** Edit this screen on this page. */
  onSelect: (profileId: string, pageId: string) => void;
  /** "Manage screens…": the Screens view. */
  onManage: () => void;
  /** "Screen settings…": Screens with this screen selected. */
  onScreenSettings: () => void;
  /** No page tabs beside it (a narrow window): it names the page too. */
  compact?: boolean;
}

const ROW = "flex w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-ui-hover focus-visible:bg-ui-hover";

/**
 * The top bar's breadcrumb (Edit v3 SPEC §6.1), which switches screen and page: the name over its size and grid in mono;
 * opened, every screen with its size, the current screen's pages beneath it, and Manage screens…. Choosing a page
 * switches screen and page.
 */
export function ScreenSwitcher({ profiles, profile, pageId, onSelect, onManage, onScreenSettings, compact = false }: ScreenSwitcherProps) {
  const [open, setOpen] = useState(false);
  const page = profile.pages.find((p) => p.id === pageId) ?? profile.pages[0];
  const kind = importedFromInfoPanel(profile) ? "Imported from InfoPanel" : "Screen";
  const choose = (profileId: string, toPage: string) => {
    setOpen(false);
    onSelect(profileId, toPage);
  };
  return (
    <PopoverParts.Root open={open} onOpenChange={setOpen}>
      <PopoverParts.Trigger
        title="Switch screen or page"
        aria-description={kind}
        className="flex min-w-0 shrink flex-col whitespace-nowrap rounded-ui-sm px-1 text-left leading-tight transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
      >
        <span className="max-w-44 truncate text-body font-medium text-ui-1">
          {profile.name}
          {compact && <span className="font-normal text-ui-3"> / {page.name}</span>}
        </span>
        <span className="font-ui-mono text-micro text-ui-hint max-xl:hidden">
          {profile.width} × {profile.height} · {profile.cols} × {profile.rows} grid
        </span>
      </PopoverParts.Trigger>
      <PopoverParts.Content side="bottom" align="start" sideOffset={6} className="w-75 rounded-10 p-1 text-body">
        <p className="px-2 pb-1 pt-1.5 text-micro text-ui-hint">
          {kind} · {profile.name}
        </p>
        {profiles.map((p) => (
          <div key={p.id}>
            <button type="button" className={cn(ROW, "h-8")} onClick={() => choose(p.id, p.id === profile.id ? page.id : p.pages[0].id)}>
              <Monitor className="h-4 w-4 shrink-0 text-ui-3" strokeWidth={1.75} />
              <span className={cn("min-w-0 flex-1 truncate", p.id === profile.id ? "font-medium text-ui-1" : "text-ui-2")}>{p.name}</span>
              <span className="font-ui-mono text-micro text-ui-4">
                {p.width}×{p.height}
              </span>
            </button>
            {p.id === profile.id &&
              p.pages.map((pg) => (
                <button
                  key={pg.id}
                  type="button"
                  className={cn(ROW, "h-7 pl-8", pg.id === page.id ? "text-ui-1" : "text-ui-hint")}
                  onClick={() => choose(p.id, pg.id)}
                >
                  <span className="truncate">{pg.name}</span>
                </button>
              ))}
          </div>
        ))}
        <div className="mx-1 my-1 h-px bg-ui-subtle" />
        <button
          type="button"
          className={cn(ROW, "h-8")}
          onClick={() => {
            setOpen(false);
            onManage();
          }}
        >
          Manage screens…
        </button>
        <button
          type="button"
          className={cn(ROW, "h-8")}
          onClick={() => {
            setOpen(false);
            onScreenSettings();
          }}
        >
          Screen settings…
        </button>
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}
