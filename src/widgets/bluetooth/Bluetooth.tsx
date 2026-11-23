import type { ModuleSettings } from "@/modules/types";
import { chromeOf } from "@/modules/standard-settings";
import { containers } from "../entries";
import { Widget, shell, has, num, clamp, Chip, Empty, Icon, Metric, roomy, Num, STATE, slideX, type ShellProps } from "../kit";
import { meta, P } from "./meta";

export { meta };



export interface BluetoothProps extends ShellProps {
  look?: ModuleSettings;
  /** The Bluetooth status line (default true). */
  showStatus?: boolean;
  /** The paired-device rows (default true). */
  showDevices?: boolean;
  /** Each device's battery bar and percentage (default true). */
  showBattery?: boolean;
  /** Bar colour for 21-50 % ("" = amber). */
  batteryMidColor?: string;
  /** Bar colour for 20 % and below ("" = red). */
  batteryLowColor?: string;
}

interface Device {
  key: string;
  name: string;
  status?: string;
  /** 0-100; undefined = no battery reporting. */
  battery?: number;
}

/** The entry of a device container by its display name (as the plugin names it), else by the last segment of its key. */
const field = (items: { key: string; text: string }[], names: Record<string, string> | undefined, name: string, re: RegExp): string | undefined => {
  const hit = items.find((i) => names?.[i.key] === name) ?? items.find((i) => re.test(i.key.slice(i.key.lastIndexOf(".") + 1)));
  return hit && has(hit.text) ? hit.text : undefined;
};

export default function Bluetooth(p: BluetoothProps) {
  const groups = [...containers(p.data, P).values()];
  const isStatus = (items: { key: string }[]) => items.some((i) => i.key.endsWith(".bt_status"));
  const status = groups
    .filter(isStatus)
    .map((items) => items.find((i) => i.key.endsWith(".bt_status"))?.text)
    .find(has);
  const devices: Device[] = groups
    .filter((items) => items.length > 0 && !isStatus(items))
    .map((items, i) => {
      const b = num(field(items, p.names, "Battery Level", /battery/i));
      return { key: items[0].key, name: field(items, p.names, "Name", /(^|[-_])name$/i) ?? `Device ${i + 1}`, status: field(items, p.names, "Status", /status$/i), battery: Number.isFinite(b) && b > 0 ? clamp(b) : undefined };
    });
  const showStatus = p.showStatus ?? true;
  const showDevices = p.showDevices ?? true;
  const showBattery = p.showBattery ?? true;
  const count = devices.length;
  // the header chip carries the count only when the header is drawn (not with the title off)
  const headerShown = p.showHeader !== false && (p.look ? chromeOf(p.look).showTitle !== false : true);
  const countLabel = `${count} device${count === 1 ? "" : "s"}`;
  const color = (pct: number) => (pct > 50 ? "var(--w-accent)" : pct > 20 ? p.batteryMidColor || STATE.warn : p.batteryLowColor || STATE.crit);
  const row = (d: Device, small?: boolean, big?: boolean) => (
    <div key={d.key} className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate font-semibold text-[color:var(--w-fg)] ${small ? "text-xs" : "text-sm"}`} title={d.name}>
          {d.name}
        </span>
        {d.status && !/^connected$/i.test(d.status) && <span className="truncate text-micro text-[color:var(--w-faint)]">{d.status}</span>}
        {showBattery && (
          <Num className={`ml-auto shrink-0 ${big ? "text-stat" : small ? "text-sm" : "text-base"}`}>{d.battery !== undefined ? `${Math.round(d.battery)}%` : "—"}</Num>
        )}
      </div>
      {showBattery && (
        <div className={`mt-1 overflow-hidden rounded-full bg-[color:var(--w-track)] ${big ? "h-1.5" : "h-1.25"}`} style={{ width: "100%", maxWidth: small ? 80 : undefined }}>
          {d.battery !== undefined && <div className="h-full w-full rounded-full transition-transform duration-300" style={{ ...slideX(Math.round(d.battery)), background: color(d.battery) }} />}
        </div>
      )}
    </div>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Bluetooth"}
      icon="bluetooth"
      right={count > 0 ? <Chip>{countLabel}</Chip> : undefined}
      compact={(box) =>
        // a 2x1 tile drops the sub line, which would lose the device count: lay the status and count out instead
        box.shape === "tile" && box.w >= 200 ? undefined : { label: "Bluetooth", value: status ?? "—", sub: countLabel, kind: "text", icon: "bluetooth" }
      }
      studio={{
        label: "Bluetooth",
        value: count,
        unit: count === 1 ? "device" : "devices",
        sub: status,
        rows: devices.map((d) => ({ n: d.name, v: d.battery !== undefined ? `${Math.round(d.battery)}%` : (d.status ?? "—"), pct: d.battery })),
      }}
    >
      {({ size, w, h, outerW, outerH }) => {
        if (!status && devices.length === 0) return <Empty icon="bluetooth" label="No Bluetooth data" />;
        if (size === "xs") return <Metric label="Bluetooth" value={status ?? "—"} scale="sm" sub={countLabel} className="h-full justify-center" />;
        const tall = h >= w * 0.72;
        const big = tall && roomy(outerW, outerH);
        const perRow = big ? (showBattery ? 56 : 36) : showBattery ? (tall ? 46 : 38) : 28;
        // before the first measurement (h = 0) up to 6 devices render
        const shown = showDevices ? devices.slice(0, h > 0 ? Math.min(6, Math.max(1, Math.floor((h - 36) / perRow))) : 6) : [];
        // the wide layout's head column is narrow: the count sits under the status so the status is never cut
        const head = (
          <div className={`flex shrink-0 ${tall ? "items-center gap-2" : "flex-col gap-1"}`}>
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="bluetooth" className="text-base text-[color:var(--w-muted)]" />
              {showStatus && status && <span className="truncate text-sm font-semibold text-[color:var(--w-fg)]">{status}</span>}
            </div>
            {/* the header chip already says it */}
            {!(count > 0 && headerShown) && <span className={`shrink-0 text-xs text-[color:var(--w-muted)] ${tall ? "ml-auto" : ""}`}>{countLabel}</span>}
          </div>
        );
        return tall ? (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {head}
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 overflow-hidden">{shown.map((d) => row(d, false, big))}</div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center gap-5">
            <div className="flex w-[30%] min-w-35 shrink-0 flex-col gap-1.5">{head}</div>
            <div className="grid min-w-0 flex-1 auto-rows-min grid-cols-1 gap-y-2 overflow-hidden">{shown.map((d) => row(d, true))}</div>
          </div>
        );
      }}
    </Widget>
  );
}
