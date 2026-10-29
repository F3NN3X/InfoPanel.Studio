/**
 * The troubleshooting report (Data › Report): what a bug report needs to say why a widget shows nothing, as plain
 * text to paste into an issue. It holds versions, the Data API's state, the hardware readings and counts, and nothing
 * about the person: no addresses but loopback, no paths, user or PC names, no screen or widget names, no plugin
 * entries (they carry now playing, calendars, processes, notifications), no text values, and no network adapter
 * readings (their keys and names are the adapters' names, which people rename). HWiNFO keys name their device after the
 * reading (a drive's serial number, an adapter's connection), so the report shows them as the reading's key and a device
 * number. Pure: the caller gathers the input.
 */
import type { ApiSources } from "@/lib/catalog";
import type { DashboardConfig } from "@/lib/layout";
import { aliasSource, slugOf, withHwinfoAliases } from "@/lib/hwinfo-aliases";
import { CANVAS_ID } from "@/lib/layout";
import { readSystem, systemKeys, type RuleName } from "@/lib/system-metrics";
import type { SensorMap } from "@/modules/types";

export interface ReportInput {
  now: Date;
  /** The desktop app's `app_info`, without its folders; null in a browser. */
  app: { version: string; channel: string; buildDate: string; webview: string | null; os: string } | null;
  apiBase: string;
  /** Whether `/api/sources` answered, and how fast. */
  reach: { ok: boolean; ms?: number };
  /** InfoPanel on this PC (`infopanel_local`); null where Studio can't look. */
  infopanel: { version: string | null; running: boolean; dataApi: { enabled: boolean; port: number } | null; profiles: number } | null;
  sensors: SensorMap;
  sources: ApiSources | null;
  config: DashboardConfig | null;
}

/** The hardware sources whose readings the report lists. */
const HARDWARE = /^(libre|hwinfo|system)\./;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** "this PC, port 3921" for a loopback address; another PC's address is left out, as only its port helps. */
export function addressText(base: string): string {
  try {
    const url = new URL(base);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return LOOPBACK.has(url.hostname) || url.hostname.startsWith("127.") ? `this PC, port ${port}` : `another PC, port ${port}`;
  } catch {
    return "not a valid address";
  }
}

/** The libre key prefixes of network adapters (`libre.wifi_`), found by their download speed. */
const adapterPrefixes = (keys: string[]): string[] =>
  keys.flatMap((k) => {
    const id = /^libre\.(.+)_download_speed$/.exec(k)?.[1];
    return id === undefined ? [] : [`libre.${id}_`];
  });

/** HWiNFO's network readings (`Current DL rate`, `Total UP`): their keys carry the adapter's connection name. */
const HWINFO_NETWORK = /^(Current (DL|UP) rate|Total (DL|UP))$/i;

/** The readings the report may list: hardware sources only, without network adapters (LibreHardwareMonitor's or HWiNFO's). */
export function listedKeys(sensors: SensorMap): string[] {
  const keys = Object.keys(sensors).sort();
  const adapters = adapterPrefixes(keys);
  return keys.filter(
    (k) => HARDWARE.test(k) && !adapters.some((a) => k.startsWith(a)) && !(k.startsWith("hwinfo.") && HWINFO_NETWORK.test(sensors[k].name?.trim() ?? "")),
  );
}

/**
 * Each listed key as the report shows it: an HWiNFO key past its reading's slug (`hwinfo.drive_temperature_s_m_a_r_t___…serial…`)
 * as that slug and the device's number in key order, `hwinfo.drive_temperature (device 2)`.
 */
function shownKeys(sensors: SensorMap, keys: string[]): Map<string, string> {
  const devices = new Map<string, number>();
  let unnamed = 0;
  return new Map(
    keys.map((k) => {
      const name = sensors[k].name?.trim();
      const base = name ? `hwinfo.${slugOf(name)}` : "";
      if (!k.startsWith("hwinfo.") || k === base) return [k, k];
      // fail closed: a key the reading's slug doesn't start (no name, a renamed reading) may still carry its device
      if (!base || !k.startsWith(base)) return [k, `hwinfo.(reading ${++unnamed})`];
      const device = k.slice(base.length);
      if (!devices.has(device)) devices.set(device, devices.size + 1);
      return [k, `${base} (device ${devices.get(device)})`];
    }),
  );
}

const round = (v: number) => String(Math.round(v * 100) / 100);

/** A reading's value as the report shows it: a number with its unit, never a text value. */
function valueText(s: SensorMap[string] | undefined): string {
  if (!s) return "–";
  if (typeof s.value === "number" && Number.isFinite(s.value)) return `${round(s.value)}${s.unit ? ` ${s.unit}` : ""}`;
  return s.text !== undefined ? "(text)" : "–";
}

const KNOWN = new Set(["libre", "hwinfo", "system", "plugins"]);

/** Counts by source: `libre`, `hwinfo`, `system`, `plugins`, and the rest as `pushed` (their prefix is a tool's name). */
function sourceCounts(keys: string[]): string {
  const counts = new Map<string, number>();
  for (const k of keys) {
    const prefix = k.slice(0, Math.max(0, k.indexOf(".")));
    const source = KNOWN.has(prefix) ? prefix : "pushed";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => `${name} ${n}`).join(", ") || "none";
}

/** Each plugin by id with its container, entry and reading counts. */
function pluginLines(sources: ApiSources | null, keys: string[]): string[] {
  return (sources?.plugins ?? []).map((p) => {
    const entries = p.containers.reduce((n, c) => n + c.entries.length, 0);
    const readings = keys.filter((k) => k.startsWith(`plugins.${p.id}.`)).length;
    return `- ${p.id}: ${p.containers.length} containers, ${entries} entries, ${readings} readings`;
  });
}

/** Screens, pages and the widget kinds in use, counted. */
function screenLines(config: DashboardConfig | null): string[] {
  if (!config) return ["Not loaded."];
  const pages = config.profiles.flatMap((p) => p.pages);
  const kinds = new Map<string, number>();
  for (const z of pages.flatMap((p) => p.placements)) kinds.set(z.module, (kinds.get(z.module) ?? 0) + 1);
  const widgets = [...kinds].filter(([k]) => k !== CANVAS_ID).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [
    `${config.profiles.length} screens, ${pages.length} pages, config version ${config.version}`,
    `InfoPanel canvases: ${kinds.get(CANVAS_ID) ?? 0}`,
    `Widgets: ${widgets.map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
  ];
}

const fixed = (v: number | undefined, unit: string) => (v === undefined ? "–" : `${round(v)} ${unit}`);

/** What each reading role resolved to, and the values the widgets show from them. */
function roleLines(raw: SensorMap): string[] {
  // as the widgets read them: HWiNFO's readings stand in where LibreHardwareMonitor has none
  const sensors = withHwinfoAliases(raw);
  const keys = systemKeys(sensors);
  const r = readSystem(sensors);
  const roles = (Object.entries(keys) as [RuleName, string | undefined][]).filter(([, k]) => k);
  return [
    `CPU: ${r.cpu.name ?? "not found"} · load ${fixed(r.cpu.load, "%")}, temp ${fixed(r.cpu.temp, "°C")}, power ${fixed(r.cpu.power, "W")}, clock ${fixed(r.cpu.clock, "MHz")}, ${r.cpu.cores.length} threads`,
    `GPU: ${r.gpu.name ?? "not found"} · load ${fixed(r.gpu.load, "%")}, temp ${fixed(r.gpu.temp, "°C")}, power ${fixed(r.gpu.power, "W")}, clock ${fixed(r.gpu.clock, "MHz")}`,
    `RAM: ${fixed(r.ram.load, "%")} of ${fixed(r.ram.total, "GB")} · drives ${r.disks.length}`,
    "",
    "Roles (the key each one reads):",
    ...(roles.length ? roles.map(([name, k]) => `- ${name}: ${k} = ${valueText(sensors[k!])}${aliasSource(sensors, k!) !== k ? " (from HWiNFO)" : ""}`) : ["- none found"]),
  ];
}

/** The report as text. */
export function troubleshootingReport(input: ReportInput): string {
  const { app, infopanel, sensors } = input;
  const all = Object.keys(sensors);
  const listed = listedKeys(sensors);
  const shown = shownKeys(sensors, listed);
  const adapters = adapterPrefixes(all).length;
  const lines = [
    "# InfoPanel Studio troubleshooting report",
    "",
    `Made ${input.now.toISOString().slice(0, 16).replace("T", " ")} UTC. Versions, the Data API's state, hardware readings and counts only: no names, addresses, paths, plugin entries or text values.`,
    "",
    "## App",
    app ? `InfoPanel Studio ${app.version} (${app.channel} channel, built ${app.buildDate}), desktop app` : "InfoPanel Studio in a browser",
    ...(app ? [`OS: ${app.os}`, `WebView2: ${app.webview ?? "unknown"}`] : []),
    "",
    "## InfoPanel on this PC",
    ...(infopanel
      ? [
          `Version: ${infopanel.version ?? "not found"}${infopanel.running ? ", running" : ", not running"}`,
          `Data API switch: ${infopanel.dataApi ? `${infopanel.dataApi.enabled ? "on" : "off"}, port ${infopanel.dataApi.port}` : "not in its settings"}`,
          `Profiles: ${infopanel.profiles}`,
        ]
      : ["Not read (a browser, or another PC)."]),
    "",
    "## Data API",
    `Address: ${addressText(input.apiBase)}`,
    `Answering: ${input.reach.ok ? `yes${input.reach.ms !== undefined ? `, ${input.reach.ms} ms` : ""}` : "no"}`,
    `Readings: ${all.length} (${sourceCounts(all)})`,
    `HWiNFO devices: ${input.sources?.hwinfo?.length ?? 0}`,
    `Network adapters: ${adapters}${adapters ? " (their readings are left out: they carry the adapters' names)" : ""}`,
    "Plugins:",
    ...(pluginLines(input.sources, all).length ? pluginLines(input.sources, all) : ["- none"]),
    "",
    "## What the widgets read",
    ...roleLines(sensors),
    "",
    "## Screens",
    ...screenLines(input.config),
    "",
    `## Hardware readings (${listed.length})`,
    ...listed.map((k) => `${shown.get(k)} | ${sensors[k].name ?? ""} | ${valueText(sensors[k])}`),
    "",
  ];
  return lines.join("\n");
}
