import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { PopoverParts } from "@/components/ui/popover";
import { Cast, Maximize, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider-field";
import { Toggle } from "@/components/ui/toggle";
import { islandEffective, type ControlKiosk, type ControlState } from "@/lib/control";
import { isTauri } from "@/lib/desktop";
import type { MonitorProfile } from "@/lib/layout";
import { DIM_MAX, DIM_STEP, liveActions, rotationNote } from "./live-model";

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
  /** Where the trigger sits: a phone's top bar, or a row of the sidebar's footer. */
  place?: "bar" | "sidebar" | "rail";
  /** Wraps the trigger (the sidebar's rail tooltip), given the trigger and its name. */
  tip?: (trigger: ReactElement<Record<string, unknown>>, label: string) => ReactElement;
}

const TRIGGER = {
  bar: "h-7 gap-1.5 whitespace-nowrap rounded-8 max-sm:w-7 max-sm:justify-center max-sm:px-0 border border-ui-live/45 bg-ui-live/12 px-2.5 text-body font-medium text-ui-ok-text hover:bg-ui-live/20",
  sidebar: "h-9 w-full gap-2.5 rounded-ui-md px-3 text-body text-ui-3 hover:bg-ui-raised hover:text-ui-1",
  rail: "h-9 w-9 justify-center rounded-ui-md text-ui-3 hover:bg-ui-raised hover:text-ui-1",
} as const;

/** One kiosk: its screen · page, and the address it connects from. */
function KioskRow({ kiosk, profiles }: { kiosk: ControlKiosk; profiles: MonitorProfile[] }) {
  const profile = profiles.find((p) => p.id === kiosk.profile);
  const page = profile?.pages.find((p) => p.id === kiosk.page) ?? profile?.pages[0];
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Cast className="h-4 w-4 shrink-0 text-ui-ok-text" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-body text-ui-1">
        {profile?.name ?? "Unknown screen"}
        {page && <span className="text-ui-3"> · {page.name}</span>}
      </span>
      {kiosk.address && <span className="shrink-0 font-ui-mono text-micro text-ui-4">{kiosk.address}</span>}
    </li>
  );
}

/** A control: its label (and value), the control, and an optional note under it. */
function Control({ label, value, children, note }: { label: string; value?: ReactNode; children?: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-ui-subtle py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-body text-ui-1">{label}</span>
        {value && <span className="font-ui-mono text-micro text-ui-3">{value}</span>}
        {children && <span className="flex shrink-0 items-center">{children}</span>}
      </div>
      {note && <p className="text-micro leading-snug text-ui-4">{note}</p>}
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
      <Slider
        label="Dim screens"
        max={DIM_MAX}
        step={DIM_STEP}
        value={local}
        disabled={disabled}
        onChange={(next) => {
          setLocal(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onSet(next), 150);
        }}
        className="w-37.5"
      />
    </Control>
  );
}

/** Most pages the page choice shows as one segment each; more than this it is a dropdown. */
export const PAGE_SEGMENTS_MAX = 7;

/**
 * The title bar's "Live · N" button and its popover (SPEC §3.3): the kiosks connected, and the runtime controls
 * for the edited screen's kiosks over the control API. Not modal, and nothing in it is saved to the dashboard.
 */
export function LiveControl({ open, onOpenChange, profiles, screen, control, kiosks, onOpenKioskView, place = "bar", tip }: LiveControlProps) {
  const entry = control?.profiles[screen.id];
  const offline = control === null;
  const canRotate = screen.pages.length >= 2;
  const savedRotation = screen.rotate?.enabled === true;
  const rotating = (entry?.rotating ?? savedRotation) && canRotate;
  const shownPage = entry?.page ?? screen.pages[0]?.id;
  const savedIsland = screen.island?.enabled === true;
  const name = `Live control, ${kiosks.length} ${kiosks.length === 1 ? "kiosk" : "kiosks"}`;
  const trigger = (
    <PopoverParts.Trigger title={tip ? undefined : "Live control"} aria-label={name} className={cn("flex items-center transition-colors", place !== "bar" && FOCUS_RING, TRIGGER[place])}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", place === "bar" || kiosks.length > 0 ? "bg-ui-live" : "border border-ui-hint")} />
      {place !== "rail" && <span className="max-sm:sr-only">Live · {kiosks.length}</span>}
    </PopoverParts.Trigger>
  );
  return (
    <PopoverParts.Root open={open} onOpenChange={onOpenChange}>
      {tip ? tip(trigger, name) : trigger}
      <PopoverParts.Content
        side={place === "bar" ? "bottom" : "right"} align="end" sideOffset={place === "bar" ? 6 : 25}
        className="w-85 p-3 text-body"
        data-help-article="kiosk"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PopoverParts.Title className="text-body font-medium text-ui-1">Live control</PopoverParts.Title>
            <p className="mt-0.5 text-micro leading-snug text-ui-3">
              Acts on the kiosks right now. None of it is part of your design, so saving doesn't change it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenKioskView();
            }}
            title={isTauri() ? undefined : "Opens the kiosk in a separate window"}
            className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-8 border border-ui-strong px-2 text-caption font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1"
          >
            <Maximize className="h-3.5 w-3.5" strokeWidth={1.75} /> Open kiosk view
          </button>
        </div>
        {kiosks.length === 0 ? (
          <p className="mt-3 text-caption text-ui-4">No kiosks are connected</p>
        ) : (
          <ul className="mt-2 divide-y divide-ui-subtle border-t border-ui-subtle">
            {kiosks.map((k) => (
              <KioskRow key={k.id} kiosk={k} profiles={profiles} />
            ))}
          </ul>
        )}
        <div className="mt-2">
          {offline && <p className="border-t border-ui-subtle pt-2.5 text-micro text-ui-warn">Not connected to the server: nothing here can reach a kiosk</p>}
          <div className="flex flex-col gap-1.5 border-t border-ui-subtle py-2.5">
            <span className="text-body text-ui-1">Show on {screen.name} kiosks</span>
            {screen.pages.length > PAGE_SEGMENTS_MAX ? (
              <Select
                label={`Show on ${screen.name} kiosks`}
                value={shownPage ?? null}
                options={screen.pages.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(page) => void liveActions.showPage(screen.id, page)}
              />
            ) : (
              <Segmented
                label={`Show on ${screen.name} kiosks`}
                value={shownPage ?? ""}
                options={screen.pages.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(page) => void liveActions.showPage(screen.id, page)}
              />
            )}
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
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-8 border border-ui-strong text-body font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} /> Reload all kiosks
            </button>
          </div>
        </div>
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}
