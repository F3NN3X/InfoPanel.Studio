/**
 * The first-run setup's data checks (SPEC §4–§5, §8): eight checks of the link from InfoPanel to the screens, run one
 * after another, each to a status, a one-line result and, when it failed or warned, why and how to fix it. Pure: the
 * probes (InfoPanel on this PC, the Data API, the server) come in as functions, so the order, the skip rules and the
 * copy are tested with fakes. `runChecks` yields each check as it starts and as it ends; aborting its signal drops the
 * rest. Copy marks UI names `**bold**` and values `` `code` ``.
 */
import type { ApiSources } from "@/lib/catalog";
import { normalizeApiBase } from "@/lib/data-api";
import type { SensorMap } from "@/modules/types";

export const CHECK_IDS = ["installed", "running", "version", "switch", "reachable", "sensors", "live", "server"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** Checks 1 to 4 read InfoPanel on this PC. */
export const LOCAL_CHECKS: readonly CheckId[] = ["installed", "running", "version", "switch"];

export const CHECK_TITLES: Record<CheckId, string> = {
  installed: "InfoPanel installed",
  running: "InfoPanel running",
  version: "InfoPanel has the Data API",
  switch: "Data API turned on",
  reachable: "Data API answering",
  sensors: "Sensors found",
  live: "Readings are live",
  server: "Studio server and kiosk",
};

export type Mode = "local" | "remote";
export type CheckStatus = "waiting" | "checking" | "ok" | "warn" | "fail" | "skip";

/** InfoPanel's default Data API address, and the one the copy uses for another PC. */
export const DEFAULT_ADDRESS = "http://127.0.0.1:3921";
export const EXAMPLE_REMOTE = "http://192.168.1.40:3921";

/** Where an InfoPanel with the Data API comes from: no official release has it yet, the community test builds do. */
export const DOWNLOAD_URL = "https://github.com/F3NN3X/infopanel/releases";
export const HWINFO_URL = "https://www.hwinfo.com/download/";

/** A profile in InfoPanel's data folder (`infopanel_local`). */
export interface ProfileFile {
  guid: string;
  name: string;
  file: string;
  bytes: number;
  /** ms since the epoch; 0 when unknown. */
  modified: number;
}

/** What the desktop app reads of InfoPanel on this PC (`infopanel_local`). */
export interface LocalInfo {
  dataDir: string;
  settings: boolean;
  /** The Data API switch in settings.xml; null when settings.xml has none. */
  dataApi: { enabled: boolean; address: string; port: number } | null;
  profiles: ProfileFile[];
  process: { pid: number; exe: string | null } | null;
  /** The exe (or shortcut) Start launches; null when Studio can't find one. */
  exe: string | null;
  version: string | null;
  /** A setup session the shell opened: Studio may start and restart InfoPanel (else the steps say how). */
  setup: boolean;
}

/** Studio can start InfoPanel itself: it found the exe, and the shell opened a setup session. */
const canStart = (local: LocalInfo): boolean => local.exe !== null && local.setup;

/** A Data API's `/api/sources`, with the counts of hardware readings the plugins don't list. */
export interface SourcesAnswer extends ApiSources {
  hardware?: Record<string, number>;
}

export type SourcesProbe = { ok: true; ms: number; sources: SourcesAnswer } | { ok: false; timedOut: boolean };

/** Studio's own server, as the status bar knows it. */
export interface ServerInfo {
  state: "running" | "starting" | "stopped" | "failed" | "port_in_use";
  port: number;
  /** The kiosk on this PC, and on the network when the server listens there. */
  local: string;
  network: string | null;
  /** Who holds the port, when the server couldn't take it. */
  owner?: string | null;
}

export interface Probes {
  /** InfoPanel on this PC; null where Studio can't look (a browser). */
  local: () => Promise<LocalInfo | null>;
  sources: (base: string, signal: AbortSignal) => Promise<SourcesProbe>;
  sensors: (base: string, signal: AbortSignal) => Promise<SensorMap | null>;
  /** The program listening on a port, by name. */
  portOwner: (port: number) => Promise<string | null>;
  server: (signal: AbortSignal) => Promise<ServerInfo>;
  /** Waits; rejects when the signal aborts. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** A fix the setup can carry out, or a page it opens. */
export type ActionKind = "download" | "start" | "restart" | "show" | "address" | "default" | "hwinfo";
export interface CheckAction {
  kind: ActionKind;
  label: string;
  /** The address `address` sets. */
  address?: string;
}

export interface Chip {
  name: string;
  /** Which icon it gets (SPEC §6): hwinfo, system, network, media, or a plugin's. */
  icon: "hwinfo" | "system" | "network" | "media" | "plugin";
  count: number;
}

export interface SensorSummary {
  count: number;
  sources: { name: string; count: number }[];
  /** HWiNFO's readings, and LibreHardwareMonitor's; null when the Data API doesn't say. */
  hwinfo: number | null;
  libre: number | null;
}

export interface CheckResult {
  status: CheckStatus;
  result: string;
  why?: string;
  steps?: string[];
  tip?: string;
  details?: [string, string][];
  actions?: CheckAction[];
  /** The Help article or heading the row links to. */
  help?: { label: string; article: string; heading?: string };
  chips?: Chip[];
  sample?: string;
  /** What other steps read: InfoPanel on this PC, the sensors found, the server. */
  local?: LocalInfo | null;
  summary?: SensorSummary;
  server?: ServerInfo;
  /** The live check's last snapshot: what the Start step's top picks are drawn and matched with. */
  sensors?: SensorMap;
}

export type Results = Partial<Record<CheckId, CheckResult>>;

export interface RunInput {
  mode: Mode;
  address: string;
  /** The templates read hardware sensors (from HWiNFO or LibreHardwareMonitor): none of them is a warning. */
  hardwareNeeded: boolean;
}

/** Timeouts (SPEC §4): the Data API's answer, and the local probes (probe.rs `PROBE_TIMEOUT`). */
export const REACH_TIMEOUT_MS = 5000;
export const LOCAL_TIMEOUT_MS = 1500;
/** From this long on, the Data API check says it's still trying. */
export const STILL_TRYING_MS = 3000;

export const CHECKING: Record<CheckId, string> = {
  installed: "Looking for InfoPanel’s data folder…",
  running: "Looking for InfoPanel.exe…",
  version: "Reading InfoPanel’s settings…",
  switch: "Reading the Data API switch and address…",
  reachable: "Asking the Data API for its sources…",
  sensors: "Counting sensors per plugin…",
  live: "Watching readings for 3 s…",
  server: "Starting Studio’s server…",
};

/** The checking line, with the address check 5 is asking and, after 3 s, that it's still trying. */
export function checkingLine(id: CheckId, address: string, elapsedMs: number): string {
  if (id !== "reachable") return CHECKING[id];
  const asking = `Asking ${address.trim() || "the address"} for its sources…`;
  return elapsedMs >= STILL_TRYING_MS ? `${asking} Still trying. You can keep typing or move on.` : asking;
}

const SKIP_AFTER: Partial<Record<CheckId, string>> = {
  installed: "Skipped: InfoPanel isn’t installed",
  running: "Skipped until InfoPanel is running",
  version: "Skipped: this InfoPanel has no Data API",
  switch: "Skipped: the Data API is off",
  reachable: "Skipped: the Data API isn’t answering",
};
export const SKIP_REMOTE = "Skipped: InfoPanel runs on another PC. Studio can only look at InfoPanel on this PC.";
export const SKIP_BROWSER = "Skipped: Studio can only look at InfoPanel from its desktop app.";

const skip = (result: string): CheckResult => ({ status: "skip", result });

/** Why a check doesn't run, from the results before it (SPEC §5); null when it runs. */
export function skipReason(id: CheckId, mode: Mode, results: Results): string | null {
  if (LOCAL_CHECKS.includes(id) && mode === "remote") return SKIP_REMOTE;
  const at = CHECK_IDS.indexOf(id);
  if (at <= CHECK_IDS.indexOf("reachable")) {
    const failed = CHECK_IDS.slice(0, at).find((k) => results[k]?.status === "fail");
    if (failed) return SKIP_AFTER[failed] ?? null;
  }
  if (id === "sensors" || id === "live") {
    const reach = results.reachable?.status;
    if (reach !== "ok") return reach === "skip" ? "Skipped: needs the Data API to answer" : (SKIP_AFTER.reachable ?? null);
  }
  if (id === "live" && results.sensors?.status === "fail") return "Skipped: no sensors to watch";
  return null;
}

/** `host:port` of an address (localhost reads as 127.0.0.1), or null when it isn't one. */
export function hostPort(address: string): string | null {
  const base = normalizeApiBase(address.trim());
  if (!base) return null;
  const url = new URL(base);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  return `${host}:${port}`;
}

/** Where InfoPanel's settings say the Data API is, as this PC reaches it (all addresses: loopback). */
export function settingsAddress(api: { address: string; port: number }): string {
  const host = api.address === "0.0.0.0" || api.address === "" ? "127.0.0.1" : api.address;
  return `${host}:${api.port}`;
}

const SIDE_PROCESS = /^infopanel(\.exe)?$/i;

// ---- copy (SPEC §8) ----

export function installedResult(local: LocalInfo | null): CheckResult {
  if (local === null) return { ...skip(SKIP_BROWSER), local };
  if (!local.settings)
    return {
      status: "fail",
      result: "Not found on this PC",
      why: `Studio looks for InfoPanel’s data folder, ${local.dataDir}, with its settings.xml. It isn’t there.`,
      steps: [
        "Download InfoPanel from its download page.",
        "Run the installer, then start **InfoPanel** once so it creates its data folder.",
        "Come back here and choose **Check again**.",
      ],
      tip: "InfoPanel runs on another PC? Choose **Another PC** above.",
      actions: [{ kind: "download", label: "Open download page" }],
      help: { label: "Installing InfoPanel", article: "sensors", heading: "installing-infopanel" },
      local,
    };
  const n = local.profiles.length;
  return {
    status: "ok",
    result: "Found · data folder and settings.xml",
    details: [
      ["Data folder", local.dataDir],
      ["Settings", "settings.xml"],
      ["Profiles", n === 0 ? "None yet" : `${n} found · you can import ${n === 1 ? "it" : "them"} in Start`],
    ],
    local,
  };
}

export function runningResult(local: LocalInfo): CheckResult {
  if (local.process)
    return { status: "ok", result: "Running", details: [["Process", `InfoPanel.exe · PID ${local.process.pid}`]], local };
  return {
    status: "fail",
    result: "Installed, but not running",
    why: "InfoPanel serves the readings, so it has to be running while you use Studio and your panels.",
    steps: [
      canStart(local) ? "Start InfoPanel. Studio can start it for you: Windows asks first, since InfoPanel runs as administrator." : "Start **InfoPanel** from the Start menu.",
      "In InfoPanel, open **Settings** and turn on **Run on startup**, so readings are there every time you sign in.",
    ],
    actions: canStart(local) ? [{ kind: "start", label: "Start InfoPanel" }] : undefined,
    local,
  };
}

export function versionResult(local: LocalInfo): CheckResult {
  const named = local.version ? `InfoPanel ${local.version}` : "This InfoPanel";
  if (local.dataApi) return { status: "ok", result: local.version ? `InfoPanel ${local.version} · has the Data API` : "Has the Data API", local };
  return {
    status: "fail",
    result: `${named} is too old: its settings have no Data API`,
    why: "The Data API isn’t in an official InfoPanel release yet. It’s in the community test builds, from 1.4.0-preview.3.f3nn3x.1 on, and this InfoPanel’s settings.xml has no switch for it.",
    steps: [
      "Download the latest community test build from its releases page.",
      "Install it over this one. Your profiles and settings are kept.",
      "Start InfoPanel again, then choose **Check again**.",
    ],
    tip: "Already on a build with the Data API? Turn on **Enable Data API** in its **Settings** once: InfoPanel only writes the switch to settings.xml when a setting changes.",
    actions: [{ kind: "download", label: "Open download page" }],
    help: { label: "Updating InfoPanel", article: "sensors", heading: "updating-infopanel" },
    local,
  };
}

export function switchResult(local: LocalInfo, address: string): CheckResult {
  const api = local.dataApi;
  if (!api) return skip(SKIP_AFTER.version ?? "");
  if (!api.enabled)
    return {
      status: "fail",
      result: "Off · InfoPanel ships with it off",
      steps: [
        "In InfoPanel, open **Settings**.",
        "Under **Data API**, turn on **Enable Data API**. InfoPanel starts it at once and saves the setting.",
        `Keep **Listen IP** \`${api.address}\` and **Listen Port** \`${api.port}\`, unless another app uses that port. InfoPanel lets you change them only while the switch is off.`,
        "Choose **Check again**.",
      ],
      actions: canStart(local) ? [{ kind: "show", label: "Open InfoPanel" }] : undefined,
      local,
    };
  const found = settingsAddress(api);
  const asked = hostPort(address);
  if (asked !== null && asked !== found) {
    const samePlace = asked.split(":")[0] === found.split(":")[0];
    return {
      status: "warn",
      result: samePlace ? `On, at port ${api.port} · Studio is set to ${asked.split(":")[1]}` : `On, at ${found} · Studio is set to ${asked}`,
      why: samePlace ? "InfoPanel’s settings use a different port from the one Studio is asking." : "InfoPanel’s settings use a different address from the one Studio is asking.",
      actions: [{ kind: "address", label: `Use ${found}`, address: `http://${found}` }],
      local,
    };
  }
  return {
    status: "ok",
    result: `On · ${found}`,
    details: [
      ["Read from", "settings.xml"],
      ["Address", api.address],
      ["Port", String(api.port)],
    ],
    local,
  };
}

const REMOTE_STEPS = [
  "On that PC, check that InfoPanel is running and **Enable Data API** is on.",
  "In its **Settings**, under **Data API**, set **Listen IP** to that PC’s network address instead of `127.0.0.1`, so other PCs can connect. InfoPanel lets you change it only while **Enable Data API** is off.",
  "Allow InfoPanel through the firewall on that PC: **Windows Security** → **Firewall & network protection** → **Allow an app through firewall**, tick **InfoPanel** for **Private** networks.",
  "Use that address here, with port `3921` unless you changed it. On that PC, `ipconfig` shows the address as its IPv4 address.",
];

interface ReachInput {
  mode: Mode;
  address: string;
  probe: SourcesProbe | null;
  local: LocalInfo | null;
  /** The program on the port, when the Data API doesn't answer though the switch is on. */
  owner?: string | null;
}

export function reachableResult({ mode, address, probe, local, owner }: ReachInput): CheckResult {
  if (!address.trim())
    return mode === "remote"
      ? { status: "fail", result: "Enter the address of the PC that runs InfoPanel", why: `Use http://, the PC’s IP address and the port, for example ${EXAMPLE_REMOTE}.` }
      : { status: "fail", result: "Enter the Data API’s address", why: `Use http://host:port, for example ${DEFAULT_ADDRESS}.`, actions: [{ kind: "default", label: "Use default" }] };
  const where = hostPort(address);
  if (!where || !probe)
    return { status: "fail", result: "That isn’t an address Studio can use", why: `Use http://host:port, for example ${DEFAULT_ADDRESS}.`, actions: [{ kind: "default", label: "Use default" }] };
  if (probe.ok) {
    const plugins = probe.sources.plugins.length;
    const answered = `${mode === "remote" ? `Answered from ${where}` : "Answered"} in ${probe.ms} ms · ${plugins} ${plugins === 1 ? "plugin" : "plugins"}`;
    return { status: "ok", result: answered, details: [["Address", address.trim()], ["Request", "`GET /api/sources` · 200"]] };
  }
  if (mode === "remote")
    return {
      status: "fail",
      result: probe.timedOut ? `No answer from ${where} after 5 s` : `No answer from ${where}`,
      steps: REMOTE_STEPS,
      help: { label: "Using a Data API on another PC", article: "sensors", heading: "a-data-api-on-another-pc" },
    };
  const api = local?.dataApi;
  if (api && settingsAddress(api) !== where)
    return {
      status: "fail",
      result: `No answer at ${where}`,
      why: `InfoPanel’s settings say the Data API is at ${settingsAddress(api)}.`,
      actions: [{ kind: "address", label: `Use ${settingsAddress(api)}`, address: `http://${settingsAddress(api)}` }],
    };
  if (local && api?.enabled && local.process) {
    const port = api.port;
    const other = owner && !SIDE_PROCESS.test(owner) ? ` ${owner} is using port ${port}.` : "";
    return {
      status: "fail",
      result: "No answer, though the switch is on",
      why: `InfoPanel opens the Data API when it starts or when the switch is turned on. If it couldn’t open its port then, it doesn’t answer until it tries again.${other}`,
      steps: [
        canStart(local) ? "Restart InfoPanel. Studio can do it for you." : "Restart InfoPanel: in its tray icon’s menu choose **Exit**, then start it again.",
        `Still no answer? Another app may be using port \`${port}\`. In InfoPanel’s **Settings**, under **Data API**, turn **Enable Data API** off, pick another **Listen Port**, turn it on again, then choose **Check again**: Studio reads the new port.`,
      ],
      actions: canStart(local) ? [{ kind: "restart", label: "Restart InfoPanel" }] : undefined,
    };
  }
  return {
    status: "fail",
    result: probe.timedOut ? `No answer at ${where} after 5 s` : `No answer at ${where}`,
    why: "Studio asked the Data API for its sources and got no answer.",
    steps: ["Check that InfoPanel is running and that **Enable Data API** is on in its **Settings**.", "Choose **Check again**."],
  };
}

const HARDWARE_ICON: Record<string, Chip["icon"]> = { system: "system", network: "network", media: "media" };

/** The sensors a Data API offers: per plugin (sensor entries), and HWiNFO's and LibreHardwareMonitor's counts. */
export function summariseSources(sources: SourcesAnswer): SensorSummary {
  const list = sources.plugins.map((p) => ({ name: p.name, count: p.containers.reduce((sum, c) => sum + c.entries.filter((e) => e.type === "sensor").length, 0) }));
  const hwinfoDevices = sources.hwinfo?.reduce((sum, d) => sum + d.entries.length, 0);
  const hwinfo = typeof sources.hardware?.hwinfo === "number" ? sources.hardware.hwinfo : (hwinfoDevices ?? null);
  const libre = typeof sources.hardware?.libre === "number" ? sources.hardware.libre : null;
  const count = list.reduce((sum, p) => sum + p.count, 0) + (hwinfo ?? 0) + (libre ?? 0);
  return { count, sources: list, hwinfo, libre };
}

/** The plugin chips: HWiNFO and LibreHardwareMonitor first (HWiNFO at 0 when neither has readings), then the plugins with sensors. */
export function sensorChips(s: SensorSummary): Chip[] {
  const hardware: Chip[] = [];
  if ((s.hwinfo ?? 0) > 0 || (s.libre ?? 0) === 0) hardware.push({ name: "HWiNFO", icon: "hwinfo", count: s.hwinfo ?? 0 });
  if ((s.libre ?? 0) > 0) hardware.push({ name: "LibreHardwareMonitor", icon: "hwinfo", count: s.libre ?? 0 });
  const iconOf = (name: string): Chip["icon"] => HARDWARE_ICON[Object.keys(HARDWARE_ICON).find((k) => name.toLowerCase().includes(k)) ?? ""] ?? "plugin";
  const plugins = s.sources
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ name: p.name, icon: iconOf(p.name), count: p.count }));
  return [...hardware, ...plugins];
}

/** How many readings came from how many sources ("1408 sensors from 16 sources"). */
export function sensorsLine(s: SensorSummary): string {
  const sources = s.sources.filter((p) => p.count > 0).length + ((s.hwinfo ?? 0) > 0 ? 1 : 0) + ((s.libre ?? 0) > 0 ? 1 : 0);
  return `${s.count} ${s.count === 1 ? "sensor" : "sensors"} from ${sources} ${sources === 1 ? "source" : "sources"}`;
}

export function sensorsResult(s: SensorSummary, hardwareNeeded: boolean): CheckResult {
  const chips = sensorChips(s);
  if (s.count === 0)
    return {
      status: "fail",
      result: "The Data API answered, but has no sensors",
      chips,
      steps: [
        "In InfoPanel, open **Plugins** and check that the plugins are enabled.",
        "Start **HWiNFO** with **Shared Memory Support** on, in HWiNFO’s **Settings**.",
        "Restart InfoPanel, then choose **Check again**.",
      ],
      actions: [{ kind: "hwinfo", label: "Get HWiNFO" }],
      summary: s,
    };
  if (hardwareNeeded && (s.hwinfo ?? 0) === 0 && (s.libre ?? 0) === 0)
    return {
      status: "warn",
      result: "HWiNFO: no sensors · the other plugins are fine",
      chips,
      why: "Temperatures, fans, clocks and power come from HWiNFO. Templates that use them show placeholders for those readings.",
      steps: [
        "Start **HWiNFO**.",
        "In HWiNFO’s **Settings**, turn on **Show sensors on startup** and **Shared Memory Support**, then choose **OK**.",
        "Keep HWiNFO running while you use Studio and your panels.",
        "Choose **Check again**.",
      ],
      actions: [{ kind: "hwinfo", label: "Get HWiNFO" }],
      summary: s,
    };
  return { status: "ok", result: sensorsLine(s), chips, summary: s };
}

// ---- liveness ----

const VOLATILE = /load|usage|util|temp|power|clock|fan|rpm|speed|rate|fps|current|volt/i;
/** How many readings the live check watches. */
export const SAMPLED = 40;

const numeric = (map: SensorMap, key: string): number | null => {
  const v = map[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** The readings the live check watches: numeric ones, the kinds that move first, up to 40. */
export function sampledKeys(first: SensorMap): string[] {
  const keys = Object.keys(first).filter((k) => numeric(first, k) !== null).sort();
  return [...keys.filter((k) => VOLATILE.test(k)), ...keys.filter((k) => !VOLATILE.test(k))].slice(0, SAMPLED);
}

const isCpuLoad = (key: string, map: SensorMap) => /cpu/i.test(key) && /load|usage|util/i.test(key) && (map[key]?.unit ?? "").trim() === "%";

/** How many of the watched readings changed across the samples, and a CPU load reading's values to show. */
export function liveness(samples: readonly SensorMap[]): { changed: number; total: number; sample: string } {
  if (samples.length === 0) return { changed: 0, total: 0, sample: "" };
  const keys = sampledKeys(samples[0]);
  const moved = (key: string) => samples.some((s) => numeric(s, key) !== numeric(samples[0], key));
  const changed = keys.filter(moved).length;
  const cpu = Object.keys(samples[0]).filter((k) => isCpuLoad(k, samples[0]) && numeric(samples[0], k) !== null);
  const shown = cpu.find(moved) ?? cpu[0];
  const sample = shown ? `CPU load ${samples.slice(0, 3).map((s) => `${Math.round(numeric(s, shown) ?? 0)} %`).join(" → ")}` : "";
  return { changed, total: keys.length, sample };
}

export function liveResult(samples: readonly SensorMap[]): CheckResult {
  const { changed, total, sample } = liveness(samples);
  if (changed > 0) return { status: "ok", result: `${changed} of ${total} sampled readings changed in 3 s`, sample: sample || undefined };
  return {
    status: "warn",
    result: total === 0 ? "No readings came back in 5 s" : "Frozen · no reading changed in 5 s",
    sample: sample || undefined,
    why: "The Data API answers, but with the same values each time. Usually HWiNFO has stopped updating.",
    steps: [
      "In HWiNFO’s sensor window, check that the readings move. If they don’t, close HWiNFO and start it again.",
      "If that doesn’t help, restart InfoPanel, then choose **Check again**.",
    ],
  };
}

export function serverResult(server: ServerInfo): CheckResult {
  if (server.state === "running")
    return {
      status: "ok",
      result: server.network ? `Serving on port ${server.port} · reachable on your network` : `Serving on port ${server.port} · on this PC only`,
      details: [
        ["Local", server.local],
        ["Network", server.network ?? "Off: Settings → Server → Who can connect → Local network"],
      ],
      server,
    };
  if (server.state === "port_in_use")
    return {
      status: "fail",
      result: `Port ${server.port} is in use by ${server.owner ?? "another app"}`,
      steps: [`Close ${server.owner ?? "that app"}, or change Studio’s port in **Settings** → **Server**.`, "Choose **Check again**."],
      server,
    };
  if (server.state === "starting") return { status: "warn", result: "Studio’s server is still starting", server };
  return {
    status: "fail",
    result: "Studio’s server isn’t running",
    steps: ["Open **Settings** → **Server** and choose **Start server**.", "Choose **Check again**."],
    server,
  };
}

// ---- the run ----

export interface CheckEvent {
  id: CheckId;
  result: CheckResult;
}

/** A promise that gives up after `ms` with `fallback`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T, sleep: Probes["sleep"], signal: AbortSignal): Promise<T> {
  const late = () => fallback;
  return Promise.race([promise.catch(late), sleep(ms, signal).then(late, late)]);
}

/**
 * Runs the checks from `from` to the end, one after another, yielding each as it starts (`checking`) and with its
 * result. `prior` holds the results before `from`, which the skip rules read. Stops quietly when `signal` aborts.
 */
export async function* runChecks(input: RunInput, probes: Probes, from: CheckId, prior: Results, signal: AbortSignal): AsyncGenerator<CheckEvent> {
  const results: Results = {};
  for (const id of CHECK_IDS.slice(0, CHECK_IDS.indexOf(from))) results[id] = prior[id];
  // Checks 1 to 4 and check 5's copy read InfoPanel on this PC: read once per run.
  let local: LocalInfo | null | undefined;
  const readLocal = async () => {
    if (local === undefined) local = await within(probes.local(), LOCAL_TIMEOUT_MS, null, probes.sleep, signal);
    return local;
  };
  const base = normalizeApiBase(input.address.trim());
  for (const id of CHECK_IDS.slice(CHECK_IDS.indexOf(from))) {
    if (signal.aborted) return;
    const reason = skipReason(id, input.mode, results);
    if (reason) {
      results[id] = skip(reason);
      yield { id, result: results[id] };
      continue;
    }
    yield { id, result: { status: "checking", result: checkingLine(id, input.address, 0) } };
    let result: CheckResult;
    try {
      result = await run(id);
    } catch (err) {
      if (signal.aborted) return;
      result = { status: "fail", result: "Studio couldn’t run this check", why: err instanceof Error ? err.message : String(err) };
    }
    if (signal.aborted) return;
    results[id] = result;
    yield { id, result };
  }

  async function run(id: CheckId): Promise<CheckResult> {
    switch (id) {
      case "installed":
        return installedResult(await readLocal());
      case "running":
      case "version":
      case "switch": {
        const found = await readLocal();
        if (found === null) return skip(SKIP_BROWSER);
        return id === "running" ? runningResult(found) : id === "version" ? versionResult(found) : switchResult(found, input.address);
      }
      case "reachable": {
        const found = input.mode === "local" ? await readLocal() : null;
        const probe = base ? await probes.sources(base, signal) : null;
        const api = found?.dataApi;
        const owner =
          probe && !probe.ok && input.mode === "local" && api?.enabled && found?.process ? await within(probes.portOwner(api.port), LOCAL_TIMEOUT_MS, null, probes.sleep, signal) : null;
        const result = reachableResult({ mode: input.mode, address: input.address, probe, local: found, owner });
        return probe?.ok ? { ...result, summary: summariseSources(probe.sources) } : result;
      }
      case "sensors": {
        const summary = results.reachable?.summary;
        return summary ? sensorsResult(summary, input.hardwareNeeded) : skip(SKIP_AFTER.reachable ?? "");
      }
      case "live": {
        const samples: SensorMap[] = [];
        const take = async () => {
          const s = base ? await probes.sensors(base, signal) : null;
          if (s) samples.push(s);
        };
        await take();
        for (let i = 0; i < 2; i++) {
          await probes.sleep(1500, signal);
          await take();
        }
        // Nothing moved in 3 s: one more look at 5 s before calling it frozen.
        if (liveness(samples).changed === 0) {
          await probes.sleep(2000, signal);
          await take();
        }
        return { ...liveResult(samples), sensors: samples.at(-1) };
      }
      case "server":
        return serverResult(await probes.server(signal));
    }
  }
}

/** The checks' tallies for the progress label, the rail and the footer. */
export function tally(results: Results): { done: number; running: boolean; fails: number; warns: number; api: boolean } {
  const statuses = CHECK_IDS.map((id) => results[id]?.status ?? "waiting");
  const settled = statuses.filter((s) => s !== "waiting" && s !== "checking");
  return {
    done: settled.length,
    running: settled.length < CHECK_IDS.length,
    fails: statuses.filter((s) => s === "fail").length,
    warns: statuses.filter((s) => s === "warn").length,
    api: results.reachable?.status === "ok",
  };
}

/** The progress label beside Check again (SPEC §6). */
export function progressLabel(results: Results): string {
  const t = tally(results);
  if (t.running) return `Checking ${Math.min(t.done + 1, CHECK_IDS.length)} of ${CHECK_IDS.length}…`;
  if (t.fails > 0) return `${t.fails} failed · carry on without live data, or fix and check again`;
  if (t.warns > 0) return `${t.warns} ${t.warns === 1 ? "warning" : "warnings"}`;
  return "All checks passed";
}
