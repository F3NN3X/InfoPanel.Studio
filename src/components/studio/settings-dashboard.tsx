import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Group, Row, Segmented, SelectRow, SwitchRow } from "@/settings/parts";
import { COMMON_LOCALES, resolveGeneral } from "@/lib/general";
import type { DashboardConfig } from "@/lib/layout";
import type { DashboardGeneralKey, SettingsPatch } from "@/lib/settings-patch";
import { ResetConfigDialog } from "./reset-config-dialog";
import { launchRule } from "./screens-model";

interface SettingsDashboardProps {
  config: DashboardConfig;
  /** Save a change at once (PLAN decision 22). */
  onPatch: (patch: SettingsPatch) => void;
  onExport: () => void;
  onReset: () => void;
  /** Screens in the Studio window, at a screen. */
  onOpenScreen: (profileId: string) => void;
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
 * Settings › Dashboard (SPEC §10.1, PLAN decisions 21 and 22), in the Settings window: the defaults for the app and every
 * kiosk, saved the moment it changes. The startup screen, then the kiosk refresh (each screen's own performance is set in
 * Screens), then the clock and date, the kiosk's page dots and cursor, and the danger zone. The groups are cards of the
 * same rows as the App pages, with their hints in view.
 */
export function SettingsDashboard({ config, onPatch, onExport, onReset, onOpenScreen }: SettingsDashboardProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const g = resolveGeneral(config);
  /** Set one general setting; undefined puts it back to the default. */
  const set = (key: DashboardGeneralKey, value: string | number | boolean | undefined) => onPatch({ general: { [key]: value ?? null } });
  /** The screen the Screens button opens: the one the app opens on, else the first. */
  const screenId = launchRule(config) === "fixed" ? config.activeProfile : config.profiles[0]?.id;
  return (
    <>
      <Group navSection="startup" title="Startup screen">
        <Card>
          <SelectRow
            label="When the app opens"
            hint="Best fit picks the screen whose size is closest to the window it opens in. Choose a screen to open on it whatever the window size. Kiosks pinned to a screen by their link ignore this."
            options={startupOptions(config)}
            value={launchRule(config) === "fixed" ? config.activeProfile : "auto"}
            onChange={(v) => onPatch({ activeProfile: v === "auto" ? null : v })}
          />
        </Card>
      </Group>

      <Group navSection="performance" title="Performance">
        <Card>
          <SelectRow
            label="Refresh kiosk pages"
            hint="Reloads kiosk pages once a day to give back memory a long run holds. Settings and layouts are saved, so nothing is lost."
            options={KIOSK_REFRESH_OPTIONS}
            value={g.kioskRefresh}
            onChange={(v) => set("kioskRefresh", v === "daily" ? undefined : v)}
          />
          {screenId && (
            <Row label="Frame rate, animations and rendering" hint="Each screen sets its own">
              <Button onClick={() => onOpenScreen(screenId)}>
                Screens
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Row>
          )}
        </Card>
      </Group>

      <Group navSection="clock" title="Clock & date">
        <Card>
          <Row label="Clock" hint="For the app and the island. Locale follows the date & time locale below; a screen's own Units & format clock overrides it.">
            <Segmented
              label="Clock"
              options={CLOCKS}
              value={g.hour12 === undefined ? "auto" : g.hour12 ? "12" : "24"}
              onChange={(v) => set("clock", v === "12" || v === "24" ? v : undefined)}
            />
          </Row>
          <SwitchRow label="Show seconds" checked={g.showSeconds} onChange={(v) => set("showSeconds", v ? undefined : false)} />
          <SelectRow
            label="Date locale"
            hint="For the Clock widget: the date's order and names follow the locale, and so does the clock when it is set to Locale"
            options={localeOptions(g.locale)}
            value={g.locale}
            onChange={(v) => set("locale", v === "" ? undefined : v)}
          />
        </Card>
      </Group>

      <Group navSection="kiosk" title="Kiosk">
        <Card>
          <SwitchRow
            label="Page dots & swipe"
            hint="In the kiosk: tap a dot or swipe to switch pages; long-press the dots to pause or resume cycling"
            checked={g.kioskPageNav}
            onChange={(on) => set("kioskPageNav", on ? true : undefined)}
          />
          <SwitchRow label="Hide cursor" hint="Hides the mouse cursor on kiosk pages" checked={g.hideCursor} onChange={(on) => set("hideCursor", on ? true : undefined)} />
        </Card>
      </Group>

      <Group navSection="danger" title="Danger zone">
        <Card>
          <Row label="Reset everything" hint="You'll be offered a backup first">
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Reset everything…
            </Button>
          </Row>
        </Card>
      </Group>
      <ResetConfigDialog open={confirmReset} onOpenChange={setConfirmReset} onExport={onExport} onReset={onReset} />
    </>
  );
}
