import { useState } from "react";
import { COMMON_LOCALES, resolveGeneral, type MotionChoice } from "@/lib/general";
import type { DashboardConfig } from "@/lib/layout";
import type { DashboardGeneralKey, SettingsPatch } from "@/lib/settings-patch";
import { FPS_OPTIONS, MOTION_OPTIONS } from "./inspector/behaviour-model";
import { ResetConfigDialog } from "./reset-config-dialog";
import { performanceWithout, screensOverriding } from "./screens-model";
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

const OVERRIDE_BUTTON = "rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** The screens that set their own value of a default above (PLAN decision 25): each with Reset, and a jump to its Screens page. */
function Overrides({ config, field, onPatch, onOpenScreen }: { config: DashboardConfig; field: "maxFps" | "motion" } & Pick<SettingsDashboardProps, "onPatch" | "onOpenScreen">) {
  const screens = screensOverriding(config.profiles, field);
  if (screens.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[11.5px] text-ui-3">
      {screens.map((screen) => (
        <li key={screen.id} className="flex flex-wrap items-center gap-x-2.5">
          <span>
            {screen.name} uses {screen.text}
          </span>
          <button
            type="button"
            className={OVERRIDE_BUTTON}
            onClick={() => onPatch({ profiles: { [screen.id]: { performance: performanceWithout(config.profiles.find((p) => p.id === screen.id)?.performance, field) } } })}
          >
            Reset
          </button>
          <button type="button" className={OVERRIDE_BUTTON} onClick={() => onOpenScreen(screen.id)}>
            Screens ↗
          </button>
        </li>
      ))}
    </ul>
  );
}

const KIOSK_REFRESH_OPTIONS = [
  { value: "daily", label: "Daily at 04:00" },
  { value: "off", label: "Off" },
];

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
 * Settings › Dashboard (SPEC §10.1, PLAN decisions 21 and 22), in the Settings window: what applies to every screen,
 * saved the moment it changes. Performance is the default screens inherit (a screen's own is set in Screens), then
 * the clock and date, the kiosk's page dots and cursor, and the danger zone.
 */
export function SettingsDashboard({ config, onPatch, onExport, onReset, onOpenScreen }: SettingsDashboardProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const g = resolveGeneral(config);
  const hours = config.style?.clock === undefined ? undefined : String(config.style.clock);
  /** Set one general setting; undefined puts it back to the default. */
  const set = (key: DashboardGeneralKey, value: string | number | boolean | undefined) => onPatch({ general: { [key]: value ?? null } });
  /** The clocks' 12 / 24 h: the all-screens style's themed `clock` (config v7). */
  const setHours = (value: "12" | "24" | undefined) => onPatch({ style: { clock: value ?? null } });
  return (
    <>
      <SettingsGroup id="performance" title="Performance" scope="Default for all screens">
        <div data-nav-control="fps">
          <SegmentedRow
            label="Frame-rate cap"
            hint="Lower uses less CPU and GPU. The most frames a second animations redraw (gradients, meters, smooth graphs); the kiosk URL's &fps= overrides it. Below 60 fps transitions are off and graphs step at the data rate."
            options={FPS_OPTIONS}
            value={String(g.maxFps)}
            onChange={(v) => set("maxFps", v === "60" ? undefined : Number(v))}
          />
        </div>
        <Overrides config={config} field="maxFps" onPatch={onPatch} onOpenScreen={onOpenScreen} />
        <SegmentedRow
          label="Animations"
          hint="Reduced disables animations: a background video shows its poster, meters and waveforms are calm, gradients and the clock colon hold still. Follow system uses the operating system's setting."
          options={MOTION_OPTIONS}
          value={g.motion}
          onChange={(v) => set("motion", v === "system" ? undefined : (v as MotionChoice))}
        />
        <Overrides config={config} field="motion" onPatch={onPatch} onOpenScreen={onOpenScreen} />
        <SelectRow
          label="Refresh kiosk pages"
          hint="Reloads kiosk pages once a day to give back memory a long run holds. Settings and layouts are saved, so nothing is lost."
          options={KIOSK_REFRESH_OPTIONS}
          value={g.kioskRefresh}
          onChange={(v) => set("kioskRefresh", v === "daily" ? undefined : v)}
        />
        <ToggleRow
          label="Ring glides"
          hint="Rings ease to each new reading. Off: they step, which lets the page rest between readings."
          value={g.ringGlide}
          onChange={(on) => set("ringGlide", on ? true : undefined)}
        />
        <ToggleRow
          label="Limit blur"
          hint="Caps widget blur at 12 px. Large blurs cost far more to draw; on a solid background blur is skipped anyway."
          value={g.blurLimit}
          onChange={(on) => set("blurLimit", on ? undefined : false)}
        />
        <ToggleRow
          label="Blur inside widgets"
          hint="Small badges and cards inside a widget blur what's behind them. Off: they keep their tint."
          value={g.innerBlur}
          onChange={(on) => set("innerBlur", on ? true : undefined)}
        />
        <ToggleRow
          label="Live graph glow"
          hint="A graph's glow is a filter redrawn with the line. Off: a static glow drawn under the line."
          value={g.liveGlow}
          onChange={(on) => set("liveGlow", on ? true : undefined)}
        />
      </SettingsGroup>

      <SettingsGroup id="clock" title="Clock & date" scope="All screens and the island">
        <SegmentedRow
          label="Clock"
          hint="Locale follows the date & time locale below. Every clock that follows the theme's Units & format reads it."
          options={CLOCKS}
          value={hours === "12" || hours === "24" ? hours : "auto"}
          onChange={(v) => setHours(v === "12" || v === "24" ? v : undefined)}
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
