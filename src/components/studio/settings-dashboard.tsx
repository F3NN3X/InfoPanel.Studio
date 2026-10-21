import { useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { COMMON_LOCALES, resolveGeneral, withGeneral, type GeneralSettings, type MotionChoice } from "@/lib/general";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { withScopeStyle } from "./appearance-actions";
import { dropKeys } from "./settings-model";
import { FPS_OPTIONS, MOTION_OPTIONS } from "./inspector/behaviour-model";
import { LinkRow } from "./link-row";
import { ResetConfigDialog } from "./reset-config-dialog";
import { ownPerformanceText } from "./screens-model";
import { SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";
import { SettingsGroup } from "./settings-group";
import type { NavTarget } from "./studio-nav";

interface SettingsDashboardProps {
  config: DashboardConfig;
  /** The screen being edited: the Performance note names it when it has its own. */
  screen: MonitorProfile;
  setConfig: HistorySetter;
  onExport: () => void;
  onReset: () => void;
  navigateTo: (target: NavTarget) => void;
}

const CLOCKS = [
  { value: "auto", label: "Locale" },
  { value: "24", label: "24 h" },
  { value: "12", label: "12 h" },
];

/** The locale options: System, the common locales, and a saved one not among them. */
function localeOptions(current: string): { value: string; label: string }[] {
  const known = current === "" || COMMON_LOCALES.some((l) => l.value === current);
  return [
    { value: "", label: "System" },
    ...COMMON_LOCALES.map((l) => ({ value: l.value, label: `${l.label} · ${l.value}` })),
    ...(known ? [] : [{ value: current, label: current }]),
  ];
}

/**
 * Settings › Dashboard (SPEC §10.1): what applies to every screen. Performance is the default screens inherit (a
 * screen's own is set in Screens), then the clock and date, the kiosk's page dots and cursor, and the danger zone.
 */
export function SettingsDashboard({ config, screen, setConfig, onExport, onReset, navigateTo }: SettingsDashboardProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const g = resolveGeneral(config);
  const hours = config.style?.clock === undefined ? undefined : String(config.style.clock);
  /** Set one general setting (same-key edits coalesce in undo). */
  const set = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setConfig((c) => ({ ...c, general: withGeneral(c.general, key, value) }), `general:${key}`);
  /** The clocks' 12 / 24 h: the all-screens style's themed `clock` (config v7). */
  const setHours = (value: string | undefined) =>
    setConfig(
      (c) => withScopeStyle(c, { kind: "all" }, (s) => (value === undefined ? (dropKeys(s, new Set(["clock"])) ?? {}) : { ...s, clock: value })),
      "appearance-style:all"
    );
  const own = ownPerformanceText(screen.performance);
  return (
    <>
      <SettingsGroup id="performance" title="Performance" scope="Default for all screens">
        <div data-nav-control="fps">
          <SegmentedRow
            label="Frame-rate cap"
            hint="Lower uses less CPU and GPU. The most frames a second animations redraw (gradients, meters, smooth graphs); the kiosk URL's &fps= overrides it."
            options={FPS_OPTIONS}
            value={String(g.maxFps)}
            onChange={(v) => set("maxFps", v === "60" ? undefined : Number(v))}
          />
        </div>
        <SegmentedRow
          label="Animations"
          hint="Reduced disables animations: a background video shows its poster, meters and waveforms are calm, gradients and the clock colon hold still. Follow system uses the operating system's setting."
          options={MOTION_OPTIONS}
          value={g.motion}
          onChange={(v) => set("motion", v === "system" ? undefined : (v as MotionChoice))}
        />
        {own && (
          <LinkRow
            note={`${screen.name} uses its own (${own}).`}
            link="Screens"
            onNavigate={() => navigateTo({ view: "screens", profileId: screen.id, section: "performance" })}
          />
        )}
      </SettingsGroup>

      <SettingsGroup id="clock" title="Clock & date" scope="All screens and the island">
        <SegmentedRow
          label="Clock"
          hint="Locale follows the date & time locale below. Every clock that follows the theme's Units & format reads it."
          options={CLOCKS}
          value={hours === "12" || hours === "24" ? hours : "auto"}
          onChange={(v) => setHours(v === "auto" ? undefined : v)}
        />
        <ToggleRow label="Show seconds" value={g.showSeconds} onChange={(v) => set("showSeconds", v ? undefined : false)} />
        <SelectRow
          label="Date locale"
          hint="For the Clock widget: the date's order and names follow the locale, and so does the clock when it is set to Locale."
          options={localeOptions(g.locale)}
          value={g.locale}
          onChange={(v) => set("locale", v === "" ? undefined : v)}
        />
      </SettingsGroup>

      <SettingsGroup id="kiosk" title="Kiosk" scope="All screens">
        <ToggleRow
          label="Page dots & swipe"
          hint="In the kiosk: tap a dot or swipe to switch pages; long-press the dots to pause or resume cycling"
          value={g.kioskPageNav}
          onChange={(on) => set("kioskPageNav", on ? true : undefined)}
        />
        <ToggleRow label="Hide cursor" hint="Hides the mouse cursor on kiosk pages" value={g.hideCursor} onChange={(on) => set("hideCursor", on ? true : undefined)} />
      </SettingsGroup>

      <SettingsGroup id="danger" title="Danger zone">
        <div className="flex min-h-[30px] items-center gap-2.5 text-[12.5px]">
          <span className="min-w-0 flex-1 text-ui-2">
            Reset everything
            <span className="block text-[11px] text-ui-4">You&apos;ll be offered a backup first.</span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="h-7 shrink-0 rounded-md border border-ui-strong px-2.5 text-[12px] text-ui-danger hover:bg-ui-hover"
          >
            Reset everything…
          </button>
        </div>
      </SettingsGroup>
      <ResetConfigDialog open={confirmReset} onOpenChange={setConfirmReset} onExport={onExport} onReset={onReset} />
    </>
  );
}
