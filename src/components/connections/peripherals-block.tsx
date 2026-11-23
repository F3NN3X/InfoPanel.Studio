import { useCallback, useEffect, useState } from "react";
import { Gamepad2, Headphones, Keyboard, Mouse, Smartphone, Usb, Zap, type LucideIcon } from "lucide-react";
import { FIELD, InlineRow, ToggleRow } from "@/components/studio/setting-rows";
import { helpPageUrl } from "@/help/links";
import { openHelp } from "@/lib/desktop";
import type { IntegrationsPatch, PeripheralsSettings } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { ConnectionStatus, type StatusTone } from "./connection-status";
import { BUTTON } from "./obs-block";

export const BATTERY_URL = "/api/devices/battery";

/** How often the server may look, in seconds, with the words the select shows. */
export const INTERVALS: readonly { value: number; label: string }[] = [
  { value: 30, label: "30 s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
];

/** What 0 (unset) means here, matching the server's defaults. */
export const INTERVAL_DEFAULT = 60;
export const LOW_DEFAULT = 15;
export const LOW_MIN = 5;
export const LOW_MAX = 50;

/** One polled device, as `GET /api/devices/battery` lists it (hidden ones included). */
export interface BatteryDevice {
  id: string;
  /** The device's own key: what `hidden` and `names` hold. */
  key: string;
  name: string;
  /** Which driver or app read it ("Logitech", "Phone Link"). */
  via: string;
  /** mouse, keyboard, headset, controller, phone or other. */
  kind: string;
  /** The last level reported; null when the device never gave one. */
  percent: number | null;
  charging: boolean;
  asleep: boolean;
  connected: boolean;
  detail: string;
  hidden: boolean;
  /** The server has a saved name for it (the name itself is in the section's `names`). */
  renamed: boolean;
  /** When it was last seen, in seconds since the epoch. */
  updated: number;
  graceSec: number;
}

/** The device source's state: the poll's bookkeeping and every device it has seen. */
export interface BatteryState {
  /** The source runs at all (an environment override can hold it off). */
  enabled: boolean;
  /** "full" on Windows, "none" elsewhere. */
  platform: string;
  intervalSec: number;
  lowPercent: number;
  /** The last poll, in seconds since the epoch; null before the first. */
  lastPoll: number | null;
  error: string | null;
  devices: BatteryDevice[];
}

const EMPTY_BATTERY: BatteryState = { enabled: false, platform: "none", intervalSec: INTERVAL_DEFAULT, lowPercent: LOW_DEFAULT, lastPoll: null, error: null, devices: [] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Tolerant read of the route's answer: a malformed device is dropped, never thrown on. */
export function parseBattery(raw: unknown): BatteryState {
  if (!isObject(raw)) return EMPTY_BATTERY;
  const devices = (Array.isArray(raw.devices) ? raw.devices : []).filter(isObject).flatMap((d): BatteryDevice[] => {
    const key = text(d.key) || text(d.id);
    if (!key) return [];
    const percent = typeof d.percent === "number" && Number.isFinite(d.percent) ? Math.min(100, Math.max(0, Math.round(d.percent))) : null;
    const seen = typeof d.updated === "number" && Number.isFinite(d.updated) ? Math.max(0, Math.round(d.updated)) : 0;
    return [
      {
        id: text(d.id) || key,
        key,
        name: text(d.name) || key,
        via: text(d.via),
        kind: text(d.kind) || "other",
        percent,
        charging: d.charging === true,
        asleep: d.asleep === true,
        connected: d.connected !== false,
        detail: text(d.detail),
        hidden: d.hidden === true,
        renamed: d.renamed === true,
        updated: seen,
        graceSec: typeof d.graceSec === "number" && Number.isFinite(d.graceSec) ? Math.max(0, Math.round(d.graceSec)) : 0,
      },
    ];
  });
  return {
    enabled: raw.enabled === true,
    platform: text(raw.platform) || "none",
    intervalSec: typeof raw.intervalSec === "number" && raw.intervalSec > 0 ? raw.intervalSec : INTERVAL_DEFAULT,
    lowPercent: typeof raw.lowPercent === "number" && raw.lowPercent > 0 ? raw.lowPercent : LOW_DEFAULT,
    lastPoll: typeof raw.lastPoll === "number" && Number.isFinite(raw.lastPoll) ? raw.lastPoll : null,
    error: text(raw.error) || null,
    devices,
  };
}

/** The state on the server now; "" when the route refuses or doesn't answer. */
async function fetchBattery(): Promise<BatteryState> {
  const res = await fetch(BATTERY_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`device batteries load failed: ${res.status}`);
  return parseBattery(await res.json());
}

/** Each kind's icon in the row; `other` and anything new take the generic device. */
const KIND_ICON: Record<string, LucideIcon> = { mouse: Mouse, keyboard: Keyboard, headset: Headphones, controller: Gamepad2, phone: Smartphone, other: Usb };

/** The row's dot, in the tones connection-status uses (ok, idle, warn); the word beside it says which. */
const ROW_DOT: Record<StatusTone, string> = { ok: "bg-s-green", idle: "bg-s-faint", warn: "bg-s-dim" };

/** The status line's tone and words: off, the poll failed, or how many devices there are. */
function headline(enabled: boolean, battery: BatteryState | null, unreachable: boolean): { tone: StatusTone; text: string } {
  if (!enabled) return { tone: "idle", text: "Off" };
  if (unreachable) return { tone: "warn", text: "No answer" };
  if (!battery) return { tone: "idle", text: "Reading" };
  if (battery.error) return { tone: "warn", text: "Polling failed" };
  if (battery.devices.length === 0) return { tone: "idle", text: "On · no devices" };
  return { tone: "ok", text: `On · ${battery.devices.length} ${battery.devices.length === 1 ? "device" : "devices"}` };
}

/** The clock time of a poll, in the reader's own format. */
const clock = (seconds: number): string => new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A device's name, edited in place: kept when the field is left or Enter is pressed. */
function NameField({ device, value, onChange }: { device: BatteryDevice; value: string; onChange: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const name = draft.trim().slice(0, 40);
    if (name === value) return;
    onChange(name);
  };
  return (
    <input
      aria-label={`Name of ${device.name}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(FIELD, "h-6.5 min-w-0 flex-1")}
    />
  );
}

/** A device's level: the bar and the number, grey while it sleeps (or before it ever reported). */
function Percent({ device, low }: { device: BatteryDevice; low: number }) {
  const level = device.percent;
  const fill = level === null || device.asleep ? "bg-s-dim" : level <= low ? "bg-s-red" : "bg-s-green";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span aria-hidden="true" className="h-1 w-14 overflow-hidden rounded-full bg-s-divider">
        <span className={cn("block h-full rounded-full", fill)} style={{ width: `${level ?? 0}%` }} />
      </span>
      <span className={cn("w-8 text-right text-micro tabular-nums", device.asleep ? "text-ui-4" : "text-ui-2")}>{level === null ? "—" : `${level}%`}</span>
    </span>
  );
}

export interface PeripheralsBlockProps {
  stored: PeripheralsSettings;
  onSave: (patch: IntegrationsPatch) => Promise<boolean>;
}

/**
 * The device batteries: the switch that lets the dashboard server poll the wireless peripherals, how often and the low
 * mark, and every device it has found (rename, hide). The section saves with its own button; the readings come from
 * `GET /api/devices/battery`, read again after a save and on demand.
 */
export function PeripheralsBlock({ stored, onSave }: PeripheralsBlockProps) {
  const [enabled, setEnabled] = useState(stored.enabled);
  const [intervalSec, setIntervalSec] = useState(stored.intervalSec);
  const [low, setLow] = useState(String(stored.lowPercent || LOW_DEFAULT));
  const [hidden, setHidden] = useState<string[]>(stored.hidden);
  const [names, setNames] = useState<Record<string, string>>(stored.names);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The parent hands back the saved section: show what the server kept, not what was typed.
  useEffect(() => {
    setEnabled(stored.enabled);
    setIntervalSec(stored.intervalSec);
    setLow(String(stored.lowPercent || LOW_DEFAULT));
    setHidden(stored.hidden);
    setNames(stored.names);
  }, [stored]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setBattery(await fetchBattery());
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const intervalValue = INTERVALS.some((o) => o.value === intervalSec) ? intervalSec : INTERVAL_DEFAULT;
  const lowValue = Number(low);
  const lowKept = Number.isFinite(lowValue) && lowValue > 0 ? Math.min(LOW_MAX, Math.max(LOW_MIN, Math.round(lowValue))) : LOW_DEFAULT;
  const storedInterval = INTERVALS.some((o) => o.value === stored.intervalSec) ? stored.intervalSec : INTERVAL_DEFAULT;
  const storedLow = stored.lowPercent > 0 ? Math.min(LOW_MAX, Math.max(LOW_MIN, stored.lowPercent)) : LOW_DEFAULT;
  const dirty =
    enabled !== stored.enabled || intervalValue !== storedInterval || lowKept !== storedLow || JSON.stringify(hidden) !== JSON.stringify(stored.hidden) || JSON.stringify(names) !== JSON.stringify(stored.names);
  const status = headline(enabled, battery, unreachable);
  const lastPoll = battery?.lastPoll ? clock(battery.lastPoll) : null;
  const rename = (device: BatteryDevice, name: string) =>
    setNames((prev) => {
      const next = { ...prev };
      if (!name || name === device.name) delete next[device.key];
      else next[device.key] = name;
      return next;
    });
  const show = (device: BatteryDevice, visible: boolean) => setHidden((prev) => (visible ? prev.filter((k) => k !== device.key) : [...new Set([...prev, device.key])]));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-caption font-semibold text-ui-1">
        Peripherals
        <ConnectionStatus tone={status.tone}>{status.text}</ConnectionStatus>
      </div>
      <ToggleRow
        label="Poll device batteries"
        hint="The dashboard server reads the battery of wireless mice, keyboards, headsets, controllers and phones every few minutes"
        value={enabled}
        onChange={setEnabled}
      />
      <InlineRow label="Poll every" hint="How often the devices are asked. A level a device hasn't reported yet keeps its last reading.">
        <select aria-label="Poll every" value={intervalValue} onChange={(e) => setIntervalSec(Number(e.target.value))} className="h-7 rounded-md border border-ui-strong bg-ui-hover px-1.5 text-caption text-ui-1">
          {INTERVALS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      <InlineRow label="Low battery at" hint="The level the widgets draw as low. Devices at or below it are marked in the readings.">
        <span className="flex shrink-0 items-center gap-1">
          <input
            aria-label="Low battery at"
            type="number"
            min={LOW_MIN}
            max={LOW_MAX}
            value={low}
            onChange={(e) => setLow(e.target.value)}
            onBlur={() => setLow(String(lowKept))}
            className={cn(FIELD, "h-6.5 w-14.5 px-1.5 text-right tabular-nums")}
          />
          <span className="text-micro text-ui-4">%</span>
        </span>
      </InlineRow>
      {enabled && (
        <div role="list" aria-label="Detected devices" className="divide-y divide-s-card-line">
          {battery?.devices.map((d) => {
            const Icon = KIND_ICON[d.kind] ?? Usb;
            const name = names[d.key] ?? d.name;
            const isHidden = hidden.includes(d.key);
            const tone: StatusTone = d.asleep ? "idle" : d.connected ? "ok" : "warn";
            const words = d.asleep ? "Asleep" : d.connected ? "Connected" : "Not connected";
            return (
              <div key={d.key} role="listitem" className={cn("flex flex-wrap items-center gap-2 py-1.5", (isHidden || d.asleep) && "opacity-60")}>
                <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", ROW_DOT[tone])} />
                <Icon className="h-4 w-4 shrink-0 text-ui-3" aria-hidden="true" />
                <NameField device={d} value={name} onChange={(next) => rename(d, next)} />
                <Percent device={d} low={battery.lowPercent} />
                {d.charging && <Zap role="img" aria-label="Charging" className="h-3.5 w-3.5 shrink-0 text-s-amber" />}
                <button type="button" className={BUTTON} aria-label={`${isHidden ? "Show" : "Hide"} ${name}`} onClick={() => show(d, isHidden)}>
                  {isHidden ? "Show" : "Hide"}
                </button>
                <span className="flex w-full items-center gap-1.5 pl-4 text-micro text-ui-4">
                  {d.via && <span className="min-w-0 truncate">{d.via}</span>}
                  {d.via && <span aria-hidden="true">·</span>}
                  <span className="shrink-0">{words}</span>
                  {isHidden && <span className="rounded-full bg-s-card-line px-2 py-0.5 text-micro text-s-muted">Hidden</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {enabled && battery && battery.devices.length === 0 && (
        <p className="m-0 text-micro leading-snug text-ui-4">
          No supported devices found.{" "}
          {battery.platform === "none" ? (
            "Batteries are read on Windows only."
          ) : (
            <>
              They appear once they connect; see the{" "}
              <a
                href={helpPageUrl({ article: "connections", heading: "peripherals" })}
                className="text-ui-2 underline"
                onClick={(e) => {
                  e.preventDefault();
                  void openHelp({ article: "connections", heading: "peripherals" }).catch(() => {});
                }}
              >
                supported devices
              </a>
              .
            </>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={cn(BUTTON, dirty && "border-transparent bg-s-accent font-semibold text-s-win hover:brightness-110")}
          disabled={!dirty}
          onClick={async () => {
            const patch: IntegrationsPatch = { peripherals: { enabled, intervalSec: intervalValue, lowPercent: lowKept, hidden, names } };
            if (await onSave(patch)) await refresh();
          }}
        >
          Save peripherals
        </button>
        <button type="button" className={BUTTON} disabled={refreshing} onClick={() => void refresh()}>
          Refresh now
        </button>
      </div>
      <p role="status" className="m-0 text-micro text-ui-4">
        {!enabled ? "Polling is off." : refreshing && !battery ? "Reading devices…" : lastPoll ? `Last poll ${lastPoll}` : "Not polled yet"}
        {battery?.error && <span className="text-s-red"> · {battery.error}</span>}
        {unreachable && <span className="text-s-red"> · The dashboard server didn't answer</span>}
      </p>
    </div>
  );
}
