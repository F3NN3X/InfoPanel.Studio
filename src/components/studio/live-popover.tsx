import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Cast, Maximize, RefreshCw } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { islandEffective, type ControlKiosk, type ControlState } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { DIM_MAX, DIM_STEP, isMuted, liveActions, rotationNote } from "./live-model";

interface LiveControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: MonitorProfile[];
  /** The screen being edited: the controls act on its kiosks. */
  screen: MonitorProfile;
  /** The runtime state (null while the server is unreachable). */
  control: ControlState | null;
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

/** A control: its label (and value), the control, and an optional note under it. */
function Control({ label, value, children, note }: { label: string; value?: ReactNode; children?: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-ui-subtle py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12.5px] text-ui-1">{label}</span>
        {value && <span className="font-ui-mono text-[11.5px] text-ui-3">{value}</span>}
        {children && <span className="flex shrink-0 items-center">{children}</span>}
      </div>
      {note && <p className="text-[11.5px] leading-snug text-ui-4">{note}</p>}
    </div>
  );
}

/** The dim slider: it follows the server's level, and sends the one you stop on rather than every step. */
function DimSlider({ level, disabled, onSet }: { level: number; disabled: boolean; onSet: (level: number) => void }) {
  const [local, setLocal] = useState(level);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(level), [level]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <Control label="Dim screens" value={local === 0 ? "Off" : `${Math.round(local * 100)}%`}>
      <input
        type="range"
        aria-label="Dim screens"
        min={0}
        max={DIM_MAX}
        step={DIM_STEP}
        value={local}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.currentTarget.value);
          setLocal(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onSet(next), 150);
        }}
        className="h-4 w-[150px] cursor-pointer accent-[var(--ui-accent)] disabled:opacity-40"
      />
    </Control>
  );
}

/**
 * The title bar's "Live · N" button and its popover (SPEC §3.3): the kiosks connected, and the runtime controls
 * for the edited screen's kiosks over the control API. Not modal, and nothing in it is saved to the dashboard.
 */
export function LiveControl({ open, onOpenChange, profiles, screen, control, kiosks, onOpenKioskView }: LiveControlProps) {
  const entry = control?.profiles[screen.id];
  const offline = control === null;
  const canRotate = screen.pages.length >= 2;
  const savedRotation = screen.rotate?.enabled === true;
  const rotating = (entry?.rotating ?? savedRotation) && canRotate;
  const shownPage = entry?.page ?? screen.pages[0]?.id;
  const savedIsland = screen.island?.enabled === true;
  const muted = isMuted(control, Date.now());
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
            <div className="mt-2">
              {offline && <p className="border-t border-ui-subtle pt-2.5 text-[11.5px] text-ui-warning">Not connected to the server: nothing here can reach a kiosk.</p>}
              <div className="flex flex-col gap-1.5 border-t border-ui-subtle py-2.5">
                <span className="text-[12.5px] text-ui-1">Show on {screen.name} kiosks</span>
                <Segmented
                  label={`Show on ${screen.name} kiosks`}
                  value={shownPage ?? ""}
                  options={screen.pages.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(page) => void liveActions.showPage(screen.id, page)}
                />
              </div>
              <Control
                label="Rotation"
                note={
                  canRotate
                    ? rotationNote({ rotating, override: entry?.override ?? null, savedEnabled: savedRotation, seconds: screen.rotate?.seconds ?? 0 })
                    : `${screen.name} has one page: there is nothing to rotate.`
                }
              >
                <Toggle label="Rotation" checked={rotating} disabled={offline || !canRotate} onChange={(next) => void liveActions.setRotation(screen.id, next, savedRotation)} />
              </Control>
              <DimSlider level={entry?.dim ?? 0} disabled={offline} onSet={(level) => void liveActions.setDim(screen.id, level)} />
              <Control label="Mute alerts for 1 h" note={muted && control?.mutedUntil ? `Muted until ${new Date(control.mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : undefined}>
                <Toggle label="Mute alerts for 1 h" checked={muted} disabled={offline} onChange={(next) => void liveActions.mute(next)} />
              </Control>
              <Control label="Dynamic Island">
                <Toggle
                  label="Dynamic Island"
                  checked={islandEffective(control, screen)}
                  disabled={offline}
                  onChange={(next) => void liveActions.setIsland(screen.id, next, savedIsland)}
                />
              </Control>
              <div className="border-t border-ui-subtle pt-2.5">
                <button
                  type="button"
                  disabled={offline}
                  onClick={() => void liveActions.reload()}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong text-[12.5px] font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} /> Reload all kiosks
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
