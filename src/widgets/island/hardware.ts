// What the storage and network widgets send to the Dynamic Island (`src/lib/island/sources.ts`): a
// drive filling up, an adapter connecting or dropping, the public IP changing and a big download.
// Each `derive` is pure; `prev` null is the baseline and raises nothing.
import type { DataSourceDef, SourceNotice } from "@/lib/island/sources";
import { deviceOf, thresholdsOf } from "@/modules/setting-readers";
import type { Data } from "../core/types";
import { adapterOf, fmtMB, fmtRate, get, has, num, pretty } from "../core/data";
import { boolSetting, numberSetting } from "../registry/settings-kit";

const DRIVE = "plugins.drive-info-plugin.";

/** Each volume's name and used share, by id ("c", "d"). */
export function drivesOf(d: Data): Map<string, { name: string; pct: number; free: number }> {
  const out = new Map<string, { name: string; pct: number; free: number }>();
  for (const k of Object.keys(d)) {
    const id = k.match(/^plugins\.drive-info-plugin\.([^.]+)\.name$/)?.[1];
    if (!id) continue;
    const v = (s: string) => get(d, `${DRIVE}${id}.${s}`);
    const total = num(v("total_size"));
    const pct = (num(v("used_space")) / total) * 100;
    if (Number.isFinite(pct)) out.set(id, { name: v("name") || id.toUpperCase(), pct, free: num(v("available_space")) });
  }
  return out;
}

/** A drive's warning at most this often, ms. */
export const DRIVE_COOLDOWN_MS = 6 * 3_600_000;

/** A drive crossing the widget's Warn or Critical share (its Thresholds), upwards. */
export const driveSpaceIsland: DataSourceDef = {
  from: "data",
  hint: "A drive filling past the Warn or Critical threshold",
  defaultOn: false,
  group: "Drive space",
  derive(prev, next, settings) {
    if (!prev) return {};
    // The widget's Fullness levels as it resolves them under its theme (an Off level never trips).
    const { warn = 85, crit = 95 } = thresholdsOf(settings, "full");
    const pinned = deviceOf(settings)?.toLowerCase().replace(":", "") ?? "";
    const level = (pct: number) => (pct >= crit ? 2 : pct >= warn ? 1 : 0);
    const before = drivesOf(prev);
    const notices: SourceNotice[] = [];
    for (const [id, now] of drivesOf(next)) {
      const was = before.get(id);
      if ((pinned && id !== pinned) || !was || level(now.pct) <= level(was.pct)) continue;
      notices.push({
        id: `drive:${id}`,
        severity: level(now.pct) === 2 ? "critical" : "warning",
        title: `Drive ${now.name} ${Math.round(now.pct)}% full`,
        body: `${fmtMB(now.free)} free`,
        ttl: 8000,
        cooldownMs: DRIVE_COOLDOWN_MS,
      });
    }
    return { notices };
  },
};

const NET = "plugins.network-info-plugin.";

/** Each adapter's name and whether it is up, by its GUID. */
function adaptersOf(d: Data): Map<string, { name: string; up: boolean }> {
  const out = new Map<string, { name: string; up: boolean }>();
  for (const k of Object.keys(d)) {
    const id = k.match(/^plugins\.network-info-plugin\.(\{[^}]+\})\.name$/)?.[1];
    if (id) out.set(id, { name: get(d, `${NET}${id}.name`), up: get(d, `${NET}${id}.status`) === "Up" });
  }
  return out;
}

/** An adapter connecting or dropping; optionally the public IP changing. */
export const networkAdaptersIsland: DataSourceDef = {
  from: "data",
  hint: "An adapter connecting or disconnecting",
  defaultOn: false,
  group: "Network adapters",
  options: [boolSetting("islandPublicIp", "Public IP changes", false, { hint: "A notice when the public IPv4 address changes" })],
  derive(prev, next, settings) {
    if (!prev) return {};
    const before = adaptersOf(prev);
    const notices: SourceNotice[] = [];
    for (const [id, now] of adaptersOf(next)) {
      const was = before.get(id);
      if (!was || was.up === now.up) continue;
      notices.push({ id: `link:${id}`, severity: now.up ? "info" : "warning", title: `${now.name} ${now.up ? "connected" : "disconnected"}`, ttl: now.up ? 3000 : 6000 });
    }
    const ip = get(next, `${NET}public-ip.ipv4`);
    const oldIp = get(prev, `${NET}public-ip.ipv4`);
    if (settings.islandPublicIp === true && has(ip) && has(oldIp) && ip !== oldIp) {
      notices.push({ id: "public-ip", severity: "info", title: "Public IP changed", body: ip, ttl: 5000 });
    }
    return { notices };
  },
};

/** The download rate beside the time while it is above the widget's threshold. */
export const networkThroughputIsland: DataSourceDef = {
  from: "data",
  hint: "The download rate beside the time while a big download runs",
  defaultOn: false,
  group: "Content",
  options: [numberSetting("islandMinRate", "Show above (MB/s)", 5, { min: 1, max: 500, step: 1, hint: "The download shows while it is faster than this" })],
  derive(_prev, next, settings) {
    const id = adapterOf(next, deviceOf(settings));
    if (!id) return { activity: null };
    const down = num(get(next, `libre.${id}_download_speed`));
    const min = (Number(settings.islandMinRate) || 5) * 1e6;
    return { activity: Number.isFinite(down) && down >= min ? { id: "download", title: `↓ ${fmtRate(down)}`, subtitle: pretty(id) } : null };
  },
};
