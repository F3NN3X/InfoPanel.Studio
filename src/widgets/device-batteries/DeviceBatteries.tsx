// Device Batteries: the wireless devices the server polls (mice, keyboards, headsets, controllers, phones) with their
// charge. Reads the Data API keys `battery.<id>.{name,percent,charging,kind,via,low,connected,asleep,detail,…}` — the
// server's own source (ips-server devices.rs); `battery.status` is the source's line, not a device.
import type { ModuleSettings } from "@/modules/types";
import { Bar, Chip, Empty, Icon, Num, Ring, STATE, Widget, fitGrid, fmt, roomy, shell, slideX, type Box, type ShellProps } from "../kit";
import { BatteryGlyph } from "./battery-glyph";
import { batteryDevices, filterDevices, type BatteryDevice, type DevicesMode } from "./devices";
import { meta } from "./meta";

export { batteryDevices, meta };
export type { BatteryDevice };

/** The views (`meta.views`); `list` is the default. */
export type DeviceBatteriesView = "list" | "tiles" | "pills" | "single" | "lowest";

/** What a charge draws: the bar (a glyph in pills and stacks) and the number (`both`), or one of them. */
export type DeviceBatteriesShow = "both" | "percent" | "bar";

export interface DeviceBatteriesProps extends ShellProps {
  look?: ModuleSettings;
  view?: DeviceBatteriesView;
  /** How the charge is drawn on rows, pills and the one-device stack (default both); rings always draw both. */
  show?: DeviceBatteriesShow;
  /** The charging bolt on a device that is charging (default true). */
  showCharging?: boolean;
  /** Devices that are neither connected nor asleep (default false: an out-of-range device is left out). */
  showDisconnected?: boolean;
  /** The kind icon (mouse, keyboard...) before a device's name and charge (default true). */
  showIcon?: boolean;
  /** The device ids the widget draws, comma-separated ("" = every device); `devicesMode` says whether they are kept or dropped. */
  devices?: string;
  devicesMode?: DevicesMode;
  /** The device id the single view draws ("" = the lowest charge). */
  singleDevice?: string;
  /** Bar and ring colour for a charge that is not low but close to it ("" = the theme's Warning). */
  batteryWarnColor?: string;
  /** Bar and ring colour at or below the server's low threshold ("" = the theme's Critical). */
  batteryLowColor?: string;
}

/** A charge at or under this, and not low yet, wears the warning colour (the server's default low is 15). */
const WARN_AT = 30;

/** A zone under this on both sides is a 1x1 (the QA frame is 110 px, a 2x2 228). */
const SOLO_PX = 170;
/** A zone shorter than this (its content is under about 90 px) is a small body whatever its shape: a wide, short 1x1 too. */
const SMALL_H = 110;
/** A small body at least this many times wider than tall is one line; a squarer one is the stack. */
const LINE_RATIO = 1.6;
/** The small body's zone: measured, and a 1x1 or a short one. */
const isSmall = (outerW: number, outerH: number): boolean => outerW > 0 && outerH > 0 && ((outerW < SOLO_PX && outerH < SOLO_PX) || outerH < SMALL_H);

/** The glyph per device kind: the Material Symbols names the icon map knows. */
const KIND_ICON: Record<string, string> = { mouse: "mouse", keyboard: "keyboard", headset: "headset_mic", controller: "sports_esports", phone: "smartphone", other: "battery_3_bar" };
const iconOf = (kind: string): string => KIND_ICON[kind] ?? KIND_ICON.other;

export default function DeviceBatteries(p: DeviceBatteriesProps) {
  const every = batteryDevices(p.data);
  const all = filterDevices(every, p.devices, p.devicesMode);
  const view: DeviceBatteriesView = p.view ?? "list";
  const showCharging = p.showCharging ?? true;
  const showIcon = p.showIcon ?? true;
  const show = p.show ?? "both";
  const showBar = show !== "percent";
  const showNum = show !== "bar";
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
    <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name}${doing(d) ? ` — ${doing(d)}` : ""}${showNum ? "" : ` ${pctText(d)}`}`} className={`min-w-0 ${d.asleep ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-baseline gap-2">
        {showIcon && <Icon name={iconOf(d.kind)} className="shrink-0 text-sm text-[color:var(--w-muted)]" />}
        <span data-part="name" className={`truncate text-sm font-semibold ${d.asleep ? "text-[color:var(--w-faint)]" : "text-[color:var(--w-fg)]"}`}>
          {d.name}
        </span>
        {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
        {showNum && (
          <Num className={`ml-auto shrink-0 ${big ? "text-stat" : "text-base"}`} style={{ color: colour(d) }}>
            {pctText(d)}
          </Num>
        )}
      </div>
      {showBar && (
        <div className={`mt-1 overflow-hidden rounded-full bg-[color:var(--w-track)] ${big ? "h-1.5" : "h-1.25"}`}>
          {d.percent !== undefined && <div className="h-full w-full rounded-full" style={{ ...slideX(Math.round(d.percent)), background: colour(d) }} />}
        </div>
      )}
    </div>
  );
  // A rail row: icon, charge and a thin bar under them; 72 px of card has no room for the name.
  const miniRow = (d: BatteryDevice) => (
    <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name} ${pctText(d)}`} className={`min-w-0 ${d.asleep ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-center gap-1">
        {showIcon && <Icon name={iconOf(d.kind)} className="shrink-0 text-[11px] text-[color:var(--w-muted)]" />}
        {showNum && (
          <Num className="ml-auto shrink-0 text-[11px] leading-none" style={{ color: colour(d) }}>
            {pctText(d)}
          </Num>
        )}
        {showCharging && d.charging && <Icon name="bolt" className={`shrink-0 text-[9px] text-[color:var(--w-accent)] ${showNum ? "" : "ml-auto"}`} />}
      </div>
      {showBar && (
        <div className="mt-0.5 h-0.75 overflow-hidden rounded-full bg-[color:var(--w-track)]">
          {d.percent !== undefined && <div data-part="charge-bar" className="h-full w-full rounded-full" style={{ ...slideX(Math.round(d.percent)), background: colour(d) }} />}
        </div>
      )}
    </div>
  );
  // Every device as the kind icon and the glyph, no charge: the rail's list with the charge hidden. One column up to five
  // devices, two past that; the parts take the biggest size that fits both ways (the glyph is 1.44 x its size wide).
  const glyphGrid = (list: BatteryDevice[], w: number, h: number) => {
    const cols = list.length > 5 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const gap = 3;
    const bolt = showCharging && list.some((d) => d.charging) ? 0.6 : 0;
    const perRow = (showIcon ? 1 : 0) + 1.44 + bolt;
    // A row is as tall as the icon (1 x size), or the glyph alone (0.66 x size).
    const byH = (h - (rows - 1) * gap) / rows / (showIcon ? 1 : 0.66);
    const byW = (w / cols - gap * (cols - 1) - (showIcon ? 3 : 0)) / perRow;
    const s = Math.max(8, Math.min(18, Math.floor(Math.min(byH, byW))));
    return (
      <div className="grid h-full content-center justify-center gap-x-2 overflow-hidden" style={{ gridTemplateColumns: `repeat(${cols}, auto)`, rowGap: gap }}>
        {list.map((d) => (
          <div key={d.id} data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name} ${pctText(d)}${doing(d) ? ` — ${doing(d)}` : ""}`} className={`flex min-w-0 items-center gap-0.75 leading-none ${d.asleep ? "opacity-60" : ""}`}>
            {showIcon && (
              <span className="flex shrink-0 text-[color:var(--w-muted)]" style={{ fontSize: s }}>
                <Icon name={iconOf(d.kind)} />
              </span>
            )}
            <BatteryGlyph percent={d.percent} colour={colour(d)} size={s} />
            {showCharging && d.charging && (
              <span className="flex shrink-0 text-[color:var(--w-accent)]" style={{ fontSize: Math.round(s * 0.6) }}>
                <Icon name="bolt" />
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };
  // A pill: the kind icon, the battery glyph, the bolt and the charge in a chip; one per device, wrapping.
  const pill = (d: BatteryDevice) => (
    <span
      key={d.id}
      data-device={d.id}
      data-asleep={d.asleep ? "" : undefined}
      data-charging={d.charging ? "" : undefined}
      title={`${d.name} ${pctText(d)}${doing(d) ? ` — ${doing(d)}` : ""}`}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[color:color-mix(in_oklab,var(--w-muted)_28%,transparent)] bg-[color:var(--w-track)] px-2.5 py-1 ${d.asleep ? "opacity-60" : ""}`}
    >
      {showIcon && <Icon name={iconOf(d.kind)} className="shrink-0 text-sm text-[color:var(--w-muted)]" />}
      {showBar && <BatteryGlyph percent={d.percent} colour={colour(d)} />}
      {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
      {showNum && (
        <Num className="shrink-0 text-xs leading-none" style={{ color: colour(d) }}>
          {pctText(d)}
        </Num>
      )}
    </span>
  );
  // One device stacked and centred: the kind icon over the glyph and the charge. The rail's 72 x 76 slot and a 1x1 zone.
  // `side` (a 1x1 zone) sizes the parts from the body's short side; the rail's slot is a fixed 72 x 76.
  const stack = (d: BatteryDevice, side?: number) => (
    <div data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name} ${pctText(d)}${doing(d) ? ` — ${doing(d)}` : ""}`} className={`flex h-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden ${d.asleep ? "opacity-60" : ""}`}>
      {showIcon && (
        <span className="flex shrink-0 leading-none text-[color:var(--w-muted)]" style={{ fontSize: side ? Math.max(12, Math.round(side * 0.28)) : 18 }}>
          <Icon name={iconOf(d.kind)} />
        </span>
      )}
      {showBar && (
        <span className="flex shrink-0 items-center gap-0.5">
          <BatteryGlyph percent={d.percent} colour={colour(d)} size={side ? Math.max(12, Math.round(side * 0.3)) : 21} />
          {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
        </span>
      )}
      {showNum && (
        <Num className="shrink-0 leading-none" style={{ color: colour(d), fontSize: side ? Math.max(10, Math.round(side * 0.2)) : 13 }}>
          {pctText(d)}
        </Num>
      )}
      {!showBar && showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
    </div>
  );
  // One device on one line, centred: the kind icon, the glyph (the bolt after it) and the charge. Sized from the short side.
  const line = (d: BatteryDevice, side: number) => (
    <div data-device={d.id} data-asleep={d.asleep ? "" : undefined} data-charging={d.charging ? "" : undefined} title={`${d.name} ${pctText(d)}${doing(d) ? ` — ${doing(d)}` : ""}`} className={`flex h-full min-w-0 items-center justify-center gap-2 overflow-hidden ${d.asleep ? "opacity-60" : ""}`}>
      {showIcon && (
        <span className="flex shrink-0 leading-none text-[color:var(--w-muted)]" style={{ fontSize: Math.max(12, Math.round(side * 0.42)) }}>
          <Icon name={iconOf(d.kind)} />
        </span>
      )}
      {showBar && (
        <span className="flex shrink-0 items-center gap-0.5">
          <BatteryGlyph percent={d.percent} colour={colour(d)} size={Math.max(12, Math.round(side * 0.5))} />
          {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
        </span>
      )}
      {showNum && (
        <Num className="shrink-0 leading-none" style={{ color: colour(d), fontSize: Math.max(11, Math.round(side * 0.38)) }}>
          {pctText(d)}
        </Num>
      )}
      {!showBar && showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-xs text-[color:var(--w-accent)]" />}
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
    // A small zone (a 1x1, or any zone under 110 px tall) draws the one device as its body, not the summary card.
    if (lowest && isSmall(box.w, box.h) && p.compactView !== "on") return undefined;
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
      {({ size, w, h, outerW, outerH }) => {
        if (!all.length) return every.length ? <Empty icon="battery_1_bar" label="No device matches" hint="Change the devices ticked in Options" /> : <Empty icon="battery_1_bar" label="No device batteries" hint="Turn on Device batteries in Connections" />;
        if (!ordered.length && !(view === "single" && target)) return <Empty icon="battery_1_bar" label="Every device is out of range" hint="Show disconnected devices in Options to keep their last charge" />;
        // The page rail's slot: about 72 x 76, no header and no room for a label. Width decides once measured: xs is also a
        // short, wide card (4x2), which has the room for names.
        const narrow = w > 0 ? w < 180 : size === "xs";
        // A small zone: the one device, on a line when wide for its height, else stacked (the rail's own compact = full keeps its narrow branches).
        if (isSmall(outerW, outerH) && p.compactView !== "on" && p.compactView !== "off") {
          const one = (view === "single" ? target : lowest) ?? ordered[0];
          const side = Math.min(w, h) || 64;
          return w >= h * LINE_RATIO ? line(one, side) : stack(one, side);
        }
        if (narrow) {
          if ((view === "list" || view === "pills") && !showNum && showBar) return glyphGrid(ordered, w > 0 ? w : 64, h > 0 ? h : 64);
          if (view === "list" || view === "pills") return <div className="flex h-full flex-col justify-center gap-1 overflow-hidden">{ordered.slice(0, 3).map((d) => miniRow(d))}</div>;
          const one = (view === "single" ? target : lowest) ?? ordered[0];
          if (view === "single") return stack(one);
          const side = Math.max(44, Math.min(w > 0 ? w : 64, h > 0 ? h : 64, 120));
          return <div className="flex h-full min-w-0 items-center justify-center">{ring(one, side)}</div>;
        }
        if (view === "pills") return <div className="flex h-full min-h-0 flex-wrap content-center items-center justify-center gap-1.5 overflow-hidden">{ordered.map((d) => pill(d))}</div>;
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
                    {showIcon && <Icon name={iconOf(d.kind)} className="shrink-0 text-[11px] text-[color:var(--w-muted)]" />}
                    <span className="truncate text-[color:var(--w-muted)]">{d.name}</span>
                    {showCharging && d.charging && <Icon name="bolt" className="shrink-0 text-nano text-[color:var(--w-accent)]" />}
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
                  {showIcon && <Icon name={iconOf(target.kind)} className="shrink-0 text-sm text-[color:var(--w-muted)]" />}
                  <span data-part="name" className="truncate text-base font-semibold text-[color:var(--w-fg)]">
                    {target.name}
                  </span>
                  {showCharging && target.charging && <Icon name="bolt" className="shrink-0 text-sm text-[color:var(--w-accent)]" />}
                </div>
                <span className="truncate text-xs text-[color:var(--w-muted)]">{sub(target) ?? "—"}</span>
                {showBar && <Bar value={target.percent ?? 0} t={toneOf(target)} color={inkOf(target)} className="mt-0.5 h-1.5 max-w-55" track="bg-[color:var(--w-track)]" />}
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
              {showIcon && <Icon name={iconOf(lowest.kind)} className="shrink-0 text-base text-[color:var(--w-muted)]" />}
              <span data-part="name" className="truncate text-sm font-semibold text-[color:var(--w-fg)]">
                {lowest.name}
              </span>
              {showNum && (
                <Num className="ml-auto shrink-0 text-sm" style={{ color: colour(lowest) }}>
                  {pctText(lowest)}
                </Num>
              )}
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
            {/* under 360 px the summary (the lowest row again) would leave the rows a letter of their names */}
            {outerW >= 360 && <div className="flex w-[34%] min-w-35 shrink-0 flex-col gap-1.5">{head}</div>}
            <div className={`grid min-w-0 flex-1 auto-rows-min gap-x-4 gap-y-2 overflow-hidden ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>{shown.map((d, i) => row(d, view === "lowest" && i === 0))}</div>
          </div>
        );
      }}
    </Widget>
  );
}
