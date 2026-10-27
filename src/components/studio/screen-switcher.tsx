import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Monitor } from "lucide-react";
import type { MonitorProfile } from "@/lib/layout";
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
}

const ROW = "flex w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-ui-hover focus-visible:bg-ui-hover";

/**
 * The title bar's breadcrumb (Edit v3 SPEC §6.1), which switches screen and page: every screen with its size, the current screen's
 * pages beneath it, and Manage screens…. Choosing a page switches screen and page.
 */
export function ScreenSwitcher({ profiles, profile, pageId, onSelect, onManage }: ScreenSwitcherProps) {
  const [open, setOpen] = useState(false);
  const page = profile.pages.find((p) => p.id === pageId) ?? profile.pages[0];
  const choose = (profileId: string, toPage: string) => {
    setOpen(false);
    onSelect(profileId, toPage);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title="Switch screen or page"
        className="flex h-7 min-w-0 shrink items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-default bg-ui-raised px-2 text-[12.5px] text-ui-1 transition-colors hover:bg-ui-hover"
      >
        <Monitor className="h-[15px] w-[15px] shrink-0 text-ui-3" strokeWidth={1.75} />
        <span className="truncate font-semibold">{profile.name}</span>
        <span className="font-ui-mono text-[10.5px] text-ui-5 max-[959px]:hidden">
          {profile.width}×{profile.height}
        </span>
        <span aria-hidden className="text-ui-5">
          /
        </span>
        <span className="truncate text-ui-1">{page.name}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[80]">
          <Popover.Popup className="w-[300px] rounded-[10px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none">
            {profiles.map((p) => (
              <div key={p.id}>
                <button type="button" className={cn(ROW, "h-8")} onClick={() => choose(p.id, p.id === profile.id ? page.id : p.pages[0].id)}>
                  <Monitor className="h-4 w-4 shrink-0 text-ui-3" strokeWidth={1.75} />
                  <span className={cn("min-w-0 flex-1 truncate", p.id === profile.id ? "font-semibold text-ui-1" : "text-ui-2")}>{p.name}</span>
                  <span className="font-ui-mono text-[11px] text-ui-4">
                    {p.width}×{p.height}
                  </span>
                </button>
                {p.id === profile.id &&
                  p.pages.map((pg) => (
                    <button
                      key={pg.id}
                      type="button"
                      className={cn(ROW, "h-7 pl-8", pg.id === page.id ? "text-ui-1" : "text-[#8a8a94]")}
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
