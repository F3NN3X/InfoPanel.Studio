// Device Batteries: the wireless devices the server polls (mice, keyboards, headsets, controllers, phones) with their
// charge. Reads the Data API keys `battery.<id>.{name,percent,charging,kind,via,low,connected,asleep,detail,…}` — the
// server's own source (ips-server devices.rs); `battery.status` is the source's line, not a device.
import type { ModuleSettings } from "@/modules/types";
import { containers } from "../entries";
import { Bar, Chip, Empty, Icon, Num, Ring, STATE, Widget, clamp, fitGrid, fmt, num, roomy, shell, slideX, type Box, type ShellProps } from "../kit";
import { meta, P } from "./meta";

export { meta };

/** The views (`meta.views`); `list` is the default. */
export type DeviceBatteriesView = "list" | "tiles" | "single" | "lowest";

export interface DeviceBatteriesProps extends ShellProps {
  look?: ModuleSettings;
  view?: DeviceBatteriesView;
  /** The charging bolt on a device that is charging (default true). */
  showCharging?: boolean;
  /** Devices that are neither connected nor asleep (default false: an out-of-range device is left out). */
  showDisconnected?: boolean;
  /** The device id the single view draws ("" = the lowest charge). */
  singleDevice?: string;
  /** Bar and ring colour for a charge that is not low but close to it ("" = the theme's Warning). */
  batteryWarnColor?: string;
  /** Bar and ring colour at or below the server's low threshold ("" = the theme's Critical). */
  batteryLowColor?: string;
}

/** One polled device, as its `battery.<id>.*` keys describe it. */
export interface BatteryDevice {
  /** The server's stable id (the key's middle segment, a hash of the device key). */
  id: string;
  name: string;
  /** 0-100; undefined = the device has never reported a level (the percent key is absent). */
  percent?: number;
  charging: boolean;
  /** mouse, keyboard, headset, controller, phone, other. */
  kind: string;
  via?: string;
  /** The server's low-threshold flag (`.low` is "yes"/"no"). */
  low: boolean;
  connected: boolean;
  asleep: boolean;
  detail?: string;
}

/** A charge at or under this, and not low yet, wears the warning colour (the server's default low is 15). */
const WARN_AT = 30;

/** The glyph per device kind: the Material Symbols names the icon map knows. */
const KIND_ICON: Record<string, string> = { mouse: "mouse", keyboard: "keyboard", headset: "headset_mic", controller: "sports_esports", phone: "smartphone", other: "battery_3_bar" };
const iconOf = (kind: string): string => KIND_ICON[kind] ?? KIND_ICON.other;

/**
 * Every device in the data, grouped by the id in its keys (`containers`). A field the server left out is absent (`percent`
 * on a device that never reported); a text field counts when it has text, so an empty name falls back to the id.
 */
export function batteryDevices(d: ShellProps["data"]): BatteryDevice[] {
  const out: BatteryDevice[] = [];
  for (const [id, items] of containers(d, P)) {
    // `battery.status` is the source's own line: containers() reads it as an id with no fields.
    if (!id || id === "status") continue;
    const field = (name: string): string | undefined => {
      const hit = items.find((i) => i.key.slice(i.key.lastIndexOf(".") + 1) === name);
      return hit && hit.text !== "" ? hit.text : undefined;
    };
    const yes = (name: string): boolean => /^yes$/i.test(field(name) ?? "");
    const pct = num(field("percent"));
    out.push({
      id,
      name: field("name") ?? id,
      percent: Number.isFinite(pct) ? clamp(pct) : undefined,
      charging: yes("charging"),
      kind: (field("kind") ?? "other").toLowerCase(),
      via: field("via"),
      low: yes("low"),
      // A data set that never said (an older source) is taken as connected, not hidden.
      connected: field("connected") === undefined ? true : yes("connected"),
      asleep: yes("asleep"),
      detail: field("detail"),
    });
  }
  return out;
}

export default function DeviceBatteries(p: DeviceBatteriesProps) {
  const all = batteryDevices(p.data);
  const view: DeviceBatteriesView = p.view ?? "list";
  const showCharging = p.showCharging ?? true;
  // An asleep device keeps its row (with its last charge) even though it answers "not connected".
  const ordered = p.showDisconnected ? [...all] : all.filter((d) => d.connected || d.asleep);
  // The lowest charge first; a device with no level goes last.
  const ranked = [...ordered].sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.name.localeCompare(b.name));
  const lowest = ranked[0];
  // The single view's device is drawn even when it is out of range: it was picked by hand ("Not connected" says the rest).
  const target = all.find((d) => d.id === p.singleDevice) ?? lowest;
  const count = ordered.length;
  const countLabel = `${count} device${count === 1 ? "" : "s"}`;
  /** The crit / warn / accent colour of a device's charge, the theme's roles unless the widget sets its own. */
  const colour = (d: BatteryDevice): string =>
    d.low ? p.batteryLowColor || STATE.crit : d.percent !== undefined && d.percent <= WARN_AT ? p.batteryWarnColor || STATE.warn : "var(--w-accent)";
  const toneOf = (d: BatteryDevice): "crit" | "warn" | "ok" => (d.low ? "crit" : d.percent !== undefined && d.percent <= WARN_AT ? "warn" : "ok");
  /** The ring's own colour, only when the widget set one: otherwise the tone's role. */
  const inkOf = (d: BatteryDevice): string | undefined => (d.low ? p.batteryLowColor || undefined : d.percent !== undefined && d.percent <= WARN_AT ? p.batteryWarnColor || undefined : undefined);
  const pctText = (d: BatteryDevice): string => (d.percent !== undefined ? `${fmt(d.percent, 0)}%` : "—");
  /** What the device is doing besides holding a charge, for its title line. */
  const doing = (d: BatteryDevice): string => [d.charging ? "Charging" : undefined, d.asleep ? "Asleep" : undefined, d.charging || d.asleep ? undefined : d.via].filter(Boolean).join(" · ");
  const sub = (d: BatteryDevice): string | undefined => (d.charging ? "Charging" : d.asleep ? "Asleep with its last charge" : !d.connected ? "Not connected" : (d.detail ?? d.via));

  // A row (list and lowest): the device, its charge and a bar in the charge's colour.
  const row = (d: BatteryDevice, big = false) => (
    <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name}${doing(d) ? ` — ${doing(d)}` : ""}`} className={`min-w-0 ${d.asleep ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-baseline gap-2">
        <Icon name={iconOf(d.kind)} className="shrink-0 text-sm text-[color:var(--w-muted)]" />
        <span data-part="name" className={`truncate text-sm font-semibold ${d.asleep ? "text-[color:var(--w-faint)]" : "text-[color:var(--w-fg)]"}`}>
          {d.name}
        </span>
        {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
        <Num className={`ml-auto shrink-0 ${big ? "text-[22px]" : "text-base"}`} style={{ color: colour(d) }}>
          {pctText(d)}
        </Num>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-[color:var(--w-track)] ${big ? "h-1.5" : "h-[5px]"}`}>
        {d.percent !== undefined && <div className="h-full w-full rounded-full" style={{ ...slideX(Math.round(d.percent)), background: colour(d) }} />}
      </div>
    </div>
  );
  // A rail row: icon and charge only; 72 px of card has no room for the name.
  const miniRow = (d: BatteryDevice) => (
    <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name} ${pctText(d)}`} className={`flex min-w-0 items-center gap-1 ${d.asleep ? "opacity-60" : ""}`}>
      <Icon name={iconOf(d.kind)} className="shrink-0 text-[11px] text-[color:var(--w-muted)]" />
      <Num className="ml-auto shrink-0 text-[11px] leading-none" style={{ color: colour(d) }}>
        {pctText(d)}
      </Num>
      {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-[9px] text-[color:var(--w-accent)]" />}
    </div>
  );
  // A ring with the charge in its centre: the tiles, the single view and the rail's ring.
  const ring = (d: BatteryDevice, size: number) => (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <Ring value={d.percent ?? 0} t={toneOf(d)} color={inkOf(d)} className="h-full">
        <Num className="font-semibold leading-none" style={{ fontSize: `${Math.max(16, Math.round(size * 0.26))}px`, color: colour(d) }}>
          {d.percent !== undefined ? fmt(d.percent, 0) : "–"}
          {d.percent !== undefined && <span className="ml-[0.12em] text-[0.5em] text-[color:var(--w-muted)]">%</span>}
        </Num>
      </Ring>
    </div>
  );

  const compact = (box: Box) => {
    if (!lowest) return { label: "Batteries", value: all.length ? "All out of range" : "No devices", kind: "text" as const, icon: "battery_full" };
    if (view === "single" && target) {
      return { label: target.name, value: target.percent ?? "—", unit: target.percent !== undefined ? "%" : undefined, pct: target.percent, t: toneOf(target), kind: target.percent !== undefined ? ("ring" as const) : ("text" as const), sub: sub(target), icon: iconOf(target.kind) };
    }
    if (view === "tiles" || view === "lowest") {
      return {
        label: lowest.name,
        value: lowest.percent ?? "—",
        unit: lowest.percent !== undefined ? "%" : undefined,
        pct: lowest.percent,
        t: toneOf(lowest),
        kind: lowest.percent !== undefined ? ("ring" as const) : ("text" as const),
        sub: box.shape === "tile" && box.w < 160 ? undefined : countLabel,
        icon: iconOf(lowest.kind),
      };
    }
    return { label: "Batteries", value: count, unit: count === 1 ? "device" : "devices", sub: `${lowest.name} ${pctText(lowest)}`, pct: lowest.percent, t: toneOf(lowest), kind: "bar" as const, icon: "battery_full" };
  };

  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Batteries"}
      icon="battery_full"
      right={(view === "list" || view === "tiles") && count > 0 ? <Chip>{countLabel}</Chip> : undefined}
      compact={compact}
      studio={
        view === "single" && target
          ? { label: target.name, value: target.percent ?? "—", unit: "%", pct: target.percent, t: toneOf(target), sub: sub(target), icon: iconOf(target.kind), rows: ordered.map((d) => ({ n: d.name, v: pctText(d), pct: d.percent, dot: d.charging })) }
          : { label: "Batteries", value: count, unit: count === 1 ? "device" : "devices", pct: lowest?.percent, t: lowest ? toneOf(lowest) : undefined, sub: lowest ? `Lowest ${lowest.name} ${pctText(lowest)}` : undefined, icon: "battery_full", rows: ordered.map((d) => ({ n: d.name, v: pctText(d), pct: d.percent, dot: d.charging })) }
      }
    >
      {({ size, w, h, outerW }) => {
        if (!all.length) return <Empty icon="battery_1_bar" label="No device batteries" hint="Turn on Device batteries in Connections" />;
        if (!ordered.length && !(view === "single" && target)) return <Empty icon="battery_1_bar" label="Every device is out of range" hint="Show disconnected devices in Options to keep their last charge" />;
        // The page rail's slot: about 72 x 76, no header and no room for a label.
        const narrow = size === "xs" || (w > 0 && w < 180);
        if (narrow) {
          if (view === "list") return <div className="flex h-full flex-col justify-center gap-1 overflow-hidden">{ordered.slice(0, 3).map((d) => miniRow(d))}</div>;
          const one = (view === "single" ? target : lowest) ?? ordered[0];
          const side = Math.max(44, Math.min(w > 0 ? w : 64, h > 0 ? h : 64, 120));
          return <div className="flex h-full min-w-0 items-center justify-center">{ring(one, side)}</div>;
        }
        if (view === "tiles") {
          const measured = w > 0 && h > 0;
          const grid = measured ? fitGrid(ordered.length, w, h, { aspect: 0.8, gap: 8 }) : { cols: Math.min(ordered.length, 3), rows: Math.ceil(ordered.length / 3), cell: 96 };
          const tiles = ordered.slice(0, Math.max(1, grid.cols * grid.rows));
          return (
            <div className="grid h-full min-h-0 content-center justify-center gap-2 overflow-hidden" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, ${Math.max(48, grid.cell)}px))` }}>
              {tiles.map((d) => (
                <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name}${doing(d) ? ` — ${doing(d)}` : ""}`} className={`flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 ${d.asleep ? "opacity-60" : ""}`}>
                  {ring(d, Math.max(48, Math.min(grid.cell, 110)))}
                  <span className="flex w-full min-w-0 items-center justify-center gap-1 text-micro">
                    <Icon name={iconOf(d.kind)} className="shrink-0 text-[11px] text-[color:var(--w-muted)]" />
                    <span className="truncate text-[color:var(--w-muted)]">{d.name}</span>
                    {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-[10px] text-[color:var(--w-accent)]" />}
                  </span>
                </div>
              ))}
            </div>
          );
        }
        if (view === "single" && target) {
          const tall = h >= w * 0.72;
          const side = Math.max(56, Math.min(w > 0 ? w * 0.46 : 96, h > 0 ? h * 0.5 : 96, 140));
          return (
            <div className={`flex h-full min-w-0 items-center gap-4 ${tall ? "flex-col justify-center gap-2" : ""}`}>
              {ring(target, side)}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name={iconOf(target.kind)} className="shrink-0 text-sm text-[color:var(--w-muted)]" />
                  <span data-part="name" className="truncate text-base font-semibold text-[color:var(--w-fg)]">
                    {target.name}
                  </span>
                  {showCharging && target.charging && <Icon name="bolt" className="shrink-0 text-sm text-[color:var(--w-accent)]" />}
                </div>
                <span className="truncate text-xs text-[color:var(--w-muted)]">{sub(target) ?? "—"}</span>
                <Bar value={target.percent ?? 0} t={toneOf(target)} color={inkOf(target)} className="mt-0.5 h-1.5 max-w-[220px]" track="bg-[color:var(--w-track)]" />
                {target.low && target.percent !== undefined && (
                  <span className="text-micro font-medium" style={{ color: colour(target) }}>
                    Low — charge it
                  </span>
                )}
              </div>
            </div>
          );
        }
        // list and lowest: rows under a one-line summary, stacked when tall, beside it when wide.
        const tall = h >= w * 0.72;
        const big = tall && roomy(outerW, h);
        const perRow = big ? 58 : tall ? 48 : 40;
        const columns = !tall && outerW >= 360 ? 2 : 1;
        const room = h > 0 ? Math.max(1, Math.floor((h - (tall ? 34 : 0)) / perRow)) * columns : ordered.length;
        // lowest ranks by charge; list keeps the source's order.
        const shown = (view === "lowest" ? ranked : ordered).slice(0, Math.min(8, room));
        const head = (
          <div className={`flex min-w-0 ${tall ? "items-center gap-2" : "flex-col gap-1"}`}>
            <div className="flex min-w-0 items-center gap-2">
              <Icon name={iconOf(lowest.kind)} className="shrink-0 text-base text-[color:var(--w-muted)]" />
              <span data-part="name" className="truncate text-sm font-semibold text-[color:var(--w-fg)]">
                {lowest.name}
              </span>
              <Num className="ml-auto shrink-0 text-sm" style={{ color: colour(lowest) }}>
                {pctText(lowest)}
              </Num>
            </div>
            <span className="shrink-0 text-xs text-[color:var(--w-muted)]">{count > 1 ? `Lowest of ${countLabel}` : countLabel}</span>
          </div>
        );
        return tall ? (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {head}
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 overflow-hidden">{shown.map((d, i) => row(d, view === "lowest" ? i === 0 && big : big))}</div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center gap-5">
            <div className="flex w-[34%] min-w-[140px] shrink-0 flex-col gap-1.5">{head}</div>
            <div className={`grid min-w-0 flex-1 auto-rows-min gap-x-4 gap-y-2 overflow-hidden ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>{shown.map((d, i) => row(d, view === "lowest" && i === 0))}</div>
          </div>
        );
      }}
    </Widget>
  );
}
