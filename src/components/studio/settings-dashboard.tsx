import { useState } from "react";
import { COMMON_LOCALES, resolveGeneral } from "@/lib/general";
import type { DashboardConfig } from "@/lib/layout";
import type { DashboardGeneralKey, SettingsPatch } from "@/lib/settings-patch";
import { ResetConfigDialog } from "./reset-config-dialog";
import { launchRule } from "./screens-model";
import { SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";
import { SettingsGroup } from "./settings-group";

interface SettingsDashboardProps {
  config: DashboardConfig;
  /** Save a change at once (PLAN decision 22). */
  onPatch: (patch: SettingsPatch) => void;
  onExport: () => void;
  onReset: () => void;
  /** Screens in the Studio window, at a screen. */
  onOpenScreen: (profileId: string) => void;
}

const LINK_BUTTON = "rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

const KIOSK_REFRESH_OPTIONS = [
  { value: "daily", label: "Daily at 04:00" },
  { value: "off", label: "Off" },
];

const CLOCKS = [
  { value: "auto", label: "Locale" },
  { value: "24", label: "24 h" },
  { value: "12", label: "12 h" },
];

/** "When the app opens": Best fit, then each screen by name. */
function startupOptions(config: DashboardConfig): { value: string; label: string }[] {
  return [{ value: "auto", label: "Best fit for the window" }, ...config.profiles.map((p) => ({ value: p.id, label: `Always ${p.name}` }))];
}

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
 * Settings › Dashboard (SPEC §10.1, PLAN decisions 21 and 22), in the Settings window: what applies to the whole app,
 * saved the moment it changes. The startup screen, then the kiosk refresh (each screen's own performance is set in
 * Screens), then the clock and date, the kiosk's page dots and cursor, and the danger zone.
 */
export function SettingsDashboard({ config, onPatch, onExport, onReset, onOpenScreen }: SettingsDashboardProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const g = resolveGeneral(config);
  /** Set one general setting; undefined puts it back to the default. */
  const set = (key: DashboardGeneralKey, value: string | number | boolean | undefined) => onPatch({ general: { [key]: value ?? null } });
  /** The screen "Screens ↗" opens: the one the app opens on, else the first. */
  const screenId = launchRule(config) === "fixed" ? config.activeProfile : config.profiles[0]?.id;
  return (
    <>
      <SettingsGroup id="startup" title="Startup screen" scope="Default for the app">
        <SelectRow
          label="When the app opens"
          hint="Best fit picks the screen whose size is closest to the window it opens in. Choose a screen to open on it whatever the window size. Kiosks pinned to a screen by their link ignore this."
          options={startupOptions(config)}
          value={launchRule(config) === "fixed" ? config.activeProfile : "auto"}
          onChange={(v) => onPatch({ activeProfile: v === "auto" ? null : v })}
        />
      </SettingsGroup>

      <SettingsGroup id="performance" title="Performance" scope="Default for the app">
        <SelectRow
          label="Refresh kiosk pages"
          hint="Reloads kiosk pages once a day to give back memory a long run holds. Settings and layouts are saved, so nothing is lost."
          options={KIOSK_REFRESH_OPTIONS}
          value={g.kioskRefresh}
          onChange={(v) => set("kioskRefresh", v === "daily" ? undefined : v)}
        />
        <p className="flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-ui-3">
          <span>Frame-rate cap, animations and rendering are each screen&apos;s own.</span>
          {screenId && (
            <button type="button" className={LINK_BUTTON} onClick={() => onOpenScreen(screenId)}>
              Screens ↗
            </button>
          )}
        </p>
      </SettingsGroup>

      <SettingsGroup id="clock" title="Clock & date" scope="Default for the app and the island">
        <SegmentedRow
          label="Clock"
          hint="Locale follows the date & time locale below. A screen's own Units & format clock overrides it."
          options={CLOCKS}
          value={g.hour12 === undefined ? "auto" : g.hour12 ? "12" : "24"}
          onChange={(v) => set("clock", v === "12" || v === "24" ? v : undefined)}
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

      <SettingsGroup id="kiosk" title="Kiosk" scope="Default for the app">
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
