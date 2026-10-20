import { SlidersHorizontal } from "lucide-react";
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
import { PanelSection } from "./panel-section";
import { FIELD, InlineRow, SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The collapsed "Global defaults" section: the display rules fall back to, and quiet hours. */
export function AlertDefaults({ alerts, setConfig }: { alerts: AlertsConfig; setConfig: HistorySetter }) {
  const d = alerts.defaults;
  const quiet = alerts.quietHours;
  const setDefaults = (field: string, patch: Partial<AlertsConfig["defaults"]>) =>
    setConfig((c) => patchDefaults(c, patch), alertsKey(`defaults.${field}`));
  const setQuiet = (patch: Partial<NonNullable<AlertsConfig["quietHours"]>>) =>
    setConfig(
      (c) => setQuietHours(c, { from: "23:00", to: "07:00", minSeverity: "critical", ...quiet, ...patch }),
      alertsKey("quiet")
    );

  return (
    <PanelSection id="alerts-defaults" title="Global defaults" icon={SlidersHorizontal} defaultOpen={false}>
      <SegmentedRow
        label="Default style"
        value={d.style}
        onChange={(style) => setDefaults("style", { style: style as AlertStyle })}
        options={ALERT_STYLES.map((s) => ({ value: s, label: cap(s) }))}
      />
      {d.style === "island" && <p className="text-[11px] leading-snug text-ui-5">{ISLAND_HINT}</p>}
      {d.style !== "island" && (
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
      {d.style !== "island" && (
        <SegmentedRow
          label="Backdrop"
          value={d.backdrop}
          onChange={(backdrop) => setDefaults("backdrop", { backdrop: backdrop as AlertBackdrop })}
          options={ALERT_BACKDROPS.map((b) => ({ value: b, label: cap(b) }))}
        />
      )}
      <InlineRow label="Seconds" hint="0 = stays until acknowledged.">
        <NumField
          label="Default seconds"
          min={0}
          max={DISPLAY_SECONDS_MAX}
          value={d.seconds}
          onChange={(n) => setDefaults("seconds", { seconds: n ?? 0 })}
        />
      </InlineRow>
      <ToggleRow
        label="Quiet hours"
        value={quiet !== undefined}
        onChange={(on) => (on ? setQuiet({}) : setConfig((c) => setQuietHours(c, undefined), alertsKey("quiet")))}
      />
      {quiet && (
        <>
          <div className="flex items-center gap-2 text-[12.5px] text-ui-2">
            <input
              type="time"
              aria-label="Quiet from"
              value={quiet.from}
              onChange={(e) => e.target.value && setQuiet({ from: e.target.value })}
              className={cn(FIELD, "h-[30px] min-w-0 flex-1")}
            />
            to
            <input
              type="time"
              aria-label="Quiet until"
              value={quiet.to}
              onChange={(e) => e.target.value && setQuiet({ to: e.target.value })}
              className={cn(FIELD, "h-[30px] min-w-0 flex-1")}
            />
          </div>
          <SelectRow
            label="Still show"
            hint="Alerts below this severity are kept in history but not shown."
            value={quiet.minSeverity}
            onChange={(minSeverity) => setQuiet({ minSeverity: minSeverity as Severity })}
            options={SEVERITIES.map((s) => ({ value: s, label: `${cap(s)} and above` }))}
          />
        </>
      )}
    </PanelSection>
  );
}
