import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import {
  ALERT_BACKDROPS,
  ALERT_SIZES,
  ALERT_STYLES,
  DISPLAY_SECONDS_MAX,
  SEVERITIES,
  type AlertBackdrop,
  type AlertSize,
  type AlertStyle,
  type AlertsConfig,
  type Severity,
} from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { ISLAND_HINT, NumField, PositionGrid } from "./alerts-fields";
import { alertsKey, patchDefaults, setQuietHours } from "./alerts-model";
import { FIELD, InlineRow, SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface AlertDefaultsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: AlertsConfig;
  setConfig: HistorySetter;
}

/**
 * Alerts & Island › Defaults: what the display rules fall back to (Default style, Position, Size, Dim the
 * page behind, Show for) and quiet hours.
 */
export function AlertDefaults({ open, onOpenChange, alerts, setConfig }: AlertDefaultsProps) {
  const d = alerts.defaults;
  const quiet = alerts.quietHours;
  const setDefaults = (field: string, patch: Partial<AlertsConfig["defaults"]>) =>
    setConfig((c) => patchDefaults(c, patch), alertsKey(`defaults.${field}`));
  const setQuiet = (patch: Partial<NonNullable<AlertsConfig["quietHours"]>>) =>
    setConfig(
      (c) => setQuietHours(c, { from: "23:00", to: "07:00", minSeverity: "critical", ...quiet, ...patch }),
      alertsKey("quiet")
    );
  const island = d.style === "island";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-y-auto rounded-14 border border-ui-strong bg-ui-raised p-5 font-ui text-ui-1 shadow-ui-modal outline-none">
          <div className="flex items-center">
            <Dialog.Title className="flex-1 text-lead font-medium">Alert defaults</Dialog.Title>
            <Dialog.Close title="Close (Esc)" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-3 transition-colors hover:text-ui-1">
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>
          <SegmentedRow
            label="Default style"
            value={d.style}
            onChange={(style) => setDefaults("style", { style: style as AlertStyle })}
            options={ALERT_STYLES.map((s) => ({ value: s, label: cap(s) }))}
          />
          {island && <p className="text-caption leading-snug text-ui-3">{ISLAND_HINT}</p>}
          {!island && (
            <InlineRow label="Position">
              <PositionGrid value={d.position} onChange={(position) => setDefaults("position", { position })} />
            </InlineRow>
          )}
          <SegmentedRow
            label="Size"
            value={d.size}
            onChange={(size) => setDefaults("size", { size: size as AlertSize })}
            options={ALERT_SIZES.map((s) => ({ value: s, label: s.toUpperCase() }))}
          />
          {!island && (
            <SegmentedRow
              label="Dim the page behind"
              value={d.backdrop}
              onChange={(backdrop) => setDefaults("backdrop", { backdrop: backdrop as AlertBackdrop })}
              options={ALERT_BACKDROPS.map((b) => ({ value: b, label: cap(b) }))}
            />
          )}
          <InlineRow label="Show for" hint="0 = stays until acknowledged">
            <NumField label="Show for (seconds)" unit="s" min={0} max={DISPLAY_SECONDS_MAX} value={d.seconds} onChange={(n) => setDefaults("seconds", { seconds: n ?? 0 })} />
          </InlineRow>
          <ToggleRow
            label="Quiet hours"
            value={quiet !== undefined}
            onChange={(on) => (on ? setQuiet({}) : setConfig((c) => setQuietHours(c, undefined), alertsKey("quiet")))}
          />
          {quiet && (
            <>
              <div className="flex items-center gap-2 text-body text-ui-2">
                <input
                  type="time"
                  aria-label="Quiet from"
                  value={quiet.from}
                  onChange={(e) => e.target.value && setQuiet({ from: e.target.value })}
                  className={cn(FIELD, "h-7.5 min-w-0 flex-1")}
                />
                to
                <input
                  type="time"
                  aria-label="Quiet until"
                  value={quiet.to}
                  onChange={(e) => e.target.value && setQuiet({ to: e.target.value })}
                  className={cn(FIELD, "h-7.5 min-w-0 flex-1")}
                />
              </div>
              <SelectRow
                label="During quiet hours still show"
                hint="Alerts below this severity are kept in history but not shown"
                value={quiet.minSeverity}
                onChange={(minSeverity) => setQuiet({ minSeverity: minSeverity as Severity })}
                options={SEVERITIES.map((s) => ({ value: s, label: `${cap(s)} and above` }))}
              />
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
