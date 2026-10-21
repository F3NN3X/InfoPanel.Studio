import { Popover } from "@base-ui/react/popover";
import { Cast, Maximize } from "lucide-react";
import type { ControlKiosk } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";

interface LiveControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: MonitorProfile[];
  /** The kiosks connected now (`kiosksOf(control)`). */
  kiosks: readonly ControlKiosk[];
  /** Show the kiosk in this window (PLAN decision 6; it replaces the top bar's Kiosk view button). */
  onOpenKioskView: () => void;
}

/** One kiosk: its screen · page, and the address it connects from. */
function KioskRow({ kiosk, profiles }: { kiosk: ControlKiosk; profiles: MonitorProfile[] }) {
  const profile = profiles.find((p) => p.id === kiosk.profile);
  const page = profile?.pages.find((p) => p.id === kiosk.page) ?? profile?.pages[0];
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Cast className="h-4 w-4 shrink-0 text-[oklch(0.88_0.10_150)]" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ui-1">
        {profile?.name ?? "Unknown screen"}
        {page && <span className="text-ui-3"> · {page.name}</span>}
      </span>
      {kiosk.address && <span className="shrink-0 font-ui-mono text-[11px] text-ui-4">{kiosk.address}</span>}
    </li>
  );
}

/**
 * The title bar's "Live · N" button and its popover (SPEC §3.3): a skeleton until Phase 6 wires the
 * controls (show on, rotation, dim, mute, island, reload) to the control API. Not modal.
 */
export function LiveControl({ open, onOpenChange, profiles, kiosks, onOpenKioskView }: LiveControlProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        title="Live control"
        className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[oklch(0.78_0.15_150/0.45)] bg-[oklch(0.78_0.15_150/0.12)] px-2.5 text-[12.5px] font-medium text-[oklch(0.88_0.10_150)] transition-colors hover:bg-[oklch(0.78_0.15_150/0.2)]"
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[oklch(0.78_0.15_150)]" />
        Live · {kiosks.length}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[80]">
          <Popover.Popup className="w-[340px] rounded-[10px] border border-[oklch(0.78_0.15_150/0.45)] bg-ui-raised p-3 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Popover.Title className="text-[13px] font-semibold text-ui-1">Live control</Popover.Title>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ui-3">
                  Acts on kiosks right now. Nothing here is saved to your dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenKioskView();
                }}
                className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong px-2 text-[12px] font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1"
              >
                <Maximize className="h-3.5 w-3.5" strokeWidth={1.75} /> Open kiosk view
              </button>
            </div>
            {kiosks.length === 0 ? (
              <p className="mt-3 text-[12px] text-ui-4">No kiosks are connected.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ui-subtle border-t border-ui-subtle">
                {kiosks.map((k) => (
                  <KioskRow key={k.id} kiosk={k} profiles={profiles} />
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
