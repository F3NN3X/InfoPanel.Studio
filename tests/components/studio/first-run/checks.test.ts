import { describe, expect, it } from "vitest";
import {
  liveness,
  progressLabel,
  runChecks,
  SKIP_REMOTE,
  summariseSources,
  type CheckId,
  type CheckResult,
  type LocalInfo,
  type Probes,
  type Results,
  type RunInput,
  type ServerInfo,
  type SourcesAnswer,
  type SourcesProbe,
} from "@/components/studio/first-run/checks";
import type { SensorMap } from "@/modules/types";

const entry = (type: string) => ({ id: "e", name: "e", type, key: "k" });
const plugin = (name: string, sensors: number, other = 0) => ({
  id: name,
  name,
  containers: [{ id: "c", name: "c", entries: [...Array.from({ length: sensors }, () => entry("sensor")), ...Array.from({ length: other }, () => entry("text"))] }],
});
const SOURCES: SourcesAnswer = { plugins: [plugin("System Info", 7), plugin("Network Info", 8, 2)], hardware: { hwinfo: 562, libre: 0 } };

const LOCAL: LocalInfo = {
  dataDir: "C:\\Users\\me\\AppData\\Local\\InfoPanel",
  settings: true,
  dataApi: { enabled: true, address: "127.0.0.1", port: 3921 },
  profiles: [{ guid: "g", name: "Desk", file: "g.xml", bytes: 2048, modified: 1 }],
  process: { pid: 8412, exe: "C:\\Program Files\\InfoPanel\\InfoPanel.exe" },
  exe: "C:\\Program Files\\InfoPanel\\InfoPanel.exe",
  version: "1.4.0",
  setup: true,
};
const SERVER: ServerInfo = { state: "running", port: 3922, local: "http://127.0.0.1:3922/?kiosk=1", network: "http://192.168.1.24:3922/?kiosk=1" };

/** A moving snapshot: CPU load 18 → 23 → 21, one frozen reading. */
const snapshot = (load: number): SensorMap => ({
  "system.cpu.load": { value: load, unit: "%", name: "CPU Load" },
  "hwinfo.gpu_core_load": { value: 12, unit: "%", name: "GPU Core Load" },
});

interface Fakes {
  local?: LocalInfo | null;
  sources?: SourcesProbe | ((base: string) => SourcesProbe | Promise<SourcesProbe>);
  sensors?: SensorMap[];
  owner?: string | null;
  server?: ServerInfo;
}

function fake({ local = LOCAL, sources = { ok: true, ms: 12, sources: SOURCES }, sensors = [snapshot(18), snapshot(23), snapshot(21)], owner = null, server = SERVER }: Fakes = {}) {
  const asked: string[] = [];
  let taken = 0;
  const probes: Probes = {
    local: async () => local,
    sources: async (base) => {
      asked.push(base);
      return typeof sources === "function" ? sources(base) : sources;
    },
    sensors: async () => sensors[Math.min(taken++, sensors.length - 1)] ?? null,
    portOwner: async () => owner,
    server: async () => server,
    sleep: async () => {},
  };
  return { probes, asked };
}

const LOCAL_INPUT: RunInput = { mode: "local", address: "http://127.0.0.1:3921", hardwareNeeded: true };

async function run(probes: Probes, input: RunInput = LOCAL_INPUT, from: CheckId = "installed", prior: Results = {}, signal = new AbortController().signal) {
  const results: Results = {};
  const order: string[] = [];
  for await (const { id, result } of runChecks(input, probes, from, prior, signal)) {
    order.push(`${id}:${result.status}`);
    results[id] = result;
  }
  return { results, order };
}

const statuses = (r: Results) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as CheckResult).status]));

describe("runChecks", () => {
  it("runs every check in order, each from checking to its result", async () => {
    const { results, order } = await run(fake().probes);
    expect(order).toEqual([
      "installed:checking", "installed:ok", "running:checking", "running:ok", "version:checking", "version:ok", "switch:checking", "switch:ok",
      "reachable:checking", "reachable:ok", "sensors:checking", "sensors:ok", "live:checking", "live:ok", "server:checking", "server:ok",
    ]);
    expect(results.reachable?.result).toBe("Answered in 12 ms · 2 plugins");
    expect(results.version?.result).toBe("Has the Data API");
    expect(results.installed?.details?.[2]).toEqual(["Profiles", "1 found · you can import it in Start"]);
  });

  it("skips 3 and 4 until InfoPanel runs, then 5 to 7, and still checks the server", async () => {
    const { results } = await run(fake({ local: { ...LOCAL, process: null } }).probes);
    expect(statuses(results)).toMatchObject({ installed: "ok", running: "fail", version: "skip", switch: "skip", reachable: "skip", sensors: "skip", live: "skip", server: "ok" });
    expect(results.version?.result).toBe("Skipped until InfoPanel is running");
    expect(results.reachable?.result).toBe("Skipped until InfoPanel is running");
    expect(results.sensors?.result).toBe("Skipped: needs the Data API to answer");
    expect(results.running?.actions?.[0]).toMatchObject({ kind: "start", label: "Start InfoPanel" });
  });

  it("offers Start only in a setup session, and says how otherwise", async () => {
    const { results } = await run(fake({ local: { ...LOCAL, process: null, setup: false } }).probes);
    expect(results.running?.actions).toBeUndefined();
    expect(results.running?.steps?.[0]).toBe("Start **InfoPanel** from the Start menu.");
  });

  it("fails installed without settings.xml and skips the rest of InfoPanel's checks", async () => {
    const { results } = await run(fake({ local: { ...LOCAL, settings: false, dataApi: null, process: null } }).probes);
    expect(results.installed).toMatchObject({ status: "fail", result: "Not found on this PC" });
    expect(results.running?.result).toBe("Skipped: InfoPanel isn’t installed");
    expect(results.installed?.help?.heading).toBe("installing-infopanel");
  });

  it("in Another PC mode skips 1 to 4 and asks the typed address", async () => {
    const { probes, asked } = fake({ local: null });
    const { results } = await run(probes, { mode: "remote", address: "http://192.168.1.40:3921", hardwareNeeded: true });
    for (const id of ["installed", "running", "version", "switch"] as const) expect(results[id]).toMatchObject({ status: "skip", result: SKIP_REMOTE });
    expect(asked).toEqual(["http://192.168.1.40:3921"]);
    expect(results.reachable?.result).toBe("Answered from 192.168.1.40:3921 in 12 ms · 2 plugins");
  });

  it("says why another PC doesn't answer, with InfoPanel's own names", async () => {
    const { results } = await run(fake({ sources: { ok: false, timedOut: true } }).probes, { mode: "remote", address: "http://192.168.1.40:3921", hardwareNeeded: true });
    expect(results.reachable?.result).toBe("No answer from 192.168.1.40:3921 after 5 s");
    expect(results.reachable?.steps?.[1]).toContain("**Listen IP**");
  });

  it("warns on a port mismatch, and Use sets InfoPanel's address so 4 and 5 pass", async () => {
    const local = { ...LOCAL, dataApi: { enabled: true, address: "127.0.0.1", port: 3930 } };
    const sources = (base: string): SourcesProbe => (base.endsWith(":3930") ? { ok: true, ms: 9, sources: SOURCES } : { ok: false, timedOut: false });
    const first = await run(fake({ local, sources }).probes);
    expect(first.results.switch).toMatchObject({ status: "warn", result: "On, at port 3930 · Studio is set to 3921" });
    const use = first.results.switch?.actions?.[0];
    expect(use).toMatchObject({ kind: "address", label: "Use 127.0.0.1:3930", address: "http://127.0.0.1:3930" });
    // A warning doesn't skip check 5, which then says where InfoPanel's settings put it.
    expect(first.results.reachable).toMatchObject({ status: "fail", result: "No answer at 127.0.0.1:3921" });
    const again = await run(fake({ local, sources }).probes, { ...LOCAL_INPUT, address: use?.address ?? "" }, "switch", first.results);
    expect(statuses(again.results)).toMatchObject({ switch: "ok", reachable: "ok" });
  });

  it("fails version when settings.xml has no Data API switch, and 4 says so", async () => {
    const { results } = await run(fake({ local: { ...LOCAL, dataApi: null } }).probes);
    expect(results.version).toMatchObject({ status: "fail", result: "This InfoPanel doesn’t have the Data API yet" });
    expect(results.version?.steps?.[0]).toBe("Install a version of InfoPanel that has the Data API, over this one. Your profiles and settings are kept.");
    expect(results.switch?.result).toBe("Skipped: this InfoPanel has no Data API");
  });

  it("fails a switch that's off with InfoPanel's own setting names", async () => {
    const { results } = await run(fake({ local: { ...LOCAL, dataApi: { enabled: false, address: "127.0.0.1", port: 3921 } } }).probes);
    expect(results.switch?.result).toBe("Off · InfoPanel ships with it off");
    expect(results.switch?.steps?.join(" ")).toContain("**Enable Data API**");
    expect(results.reachable?.result).toBe("Skipped: the Data API is off");
  });

  it("asks for a restart when the switch is on, InfoPanel runs and nothing answers, naming another app on the port", async () => {
    const { results } = await run(fake({ sources: { ok: false, timedOut: false }, owner: "nginx.exe" }).probes);
    expect(results.reachable).toMatchObject({ status: "fail", result: "No answer, though the switch is on" });
    expect(results.reachable?.actions?.[0]).toMatchObject({ kind: "restart", label: "Restart InfoPanel" });
    expect(results.reachable?.why).toContain("nginx.exe is using port 3921.");
    const own = await run(fake({ sources: { ok: false, timedOut: false }, owner: "InfoPanel.exe" }).probes);
    expect(own.results.reachable?.why).not.toContain("is using port");
  });

  it("fails sensors when there are none and skips live; warns when HWiNFO has none but plugins do", async () => {
    const none = await run(fake({ sources: { ok: true, ms: 5, sources: { plugins: [plugin("System Info", 0)], hardware: { hwinfo: 0, libre: 0 } } } }).probes);
    expect(none.results.sensors).toMatchObject({ status: "fail", result: "The Data API answered, but has no sensors" });
    expect(none.results.live?.result).toBe("Skipped: no sensors to watch");
    const noHw = await run(fake({ sources: { ok: true, ms: 5, sources: { ...SOURCES, hardware: { hwinfo: 0, libre: 0 } } } }).probes);
    expect(noHw.results.sensors).toMatchObject({ status: "warn", result: "HWiNFO: no sensors · the other plugins are fine" });
    expect(noHw.results.sensors?.chips?.[0]).toEqual({ name: "HWiNFO", icon: "hwinfo", count: 0 });
    expect(noHw.results.sensors?.steps?.[0]).toBe("HWiNFO must be running with InfoPanel. Follow InfoPanel’s own HWiNFO setup instructions.");
    expect(noHw.results.live?.status).toBe("ok");
  });

  it("warns that readings are frozen when nothing moves in 5 s", async () => {
    const { results } = await run(fake({ sensors: [snapshot(18)] }).probes);
    expect(results.live).toMatchObject({ status: "warn", result: "Frozen · no reading changed in 5 s", sample: "CPU load 18 % → 18 % → 18 %" });
  });

  it("drops what a cancelled run would have said", async () => {
    const controller = new AbortController();
    const { probes } = fake();
    const slow: Probes = { ...probes, sources: (base, signal) => { controller.abort(); return probes.sources(base, signal); } };
    const { results } = await run(slow, LOCAL_INPUT, "installed", {}, controller.signal);
    expect(results.reachable?.status).toBe("checking");
    expect(results.sensors).toBeUndefined();
    expect(results.server).toBeUndefined();
  });

  it("reruns from a row with the results before it, and reads an invalid address as one", async () => {
    const first = await run(fake({ sources: { ok: false, timedOut: false } }).probes);
    const again = await run(fake().probes, LOCAL_INPUT, "reachable", first.results);
    expect(Object.keys(again.results)).toEqual(["reachable", "sensors", "live", "server"]);
    expect(again.results.reachable?.status).toBe("ok");
    const bad = await run(fake().probes, { ...LOCAL_INPUT, address: "not an address" }, "reachable", first.results);
    expect(bad.results.reachable).toMatchObject({ status: "fail", result: "That isn’t an address Studio can use" });
  });

  it("skips InfoPanel's checks where Studio can't look (a browser), and still asks the Data API", async () => {
    const { results } = await run(fake({ local: null }).probes);
    expect(results.installed?.status).toBe("skip");
    expect(results.reachable?.status).toBe("ok");
  });

  it("reports a server that couldn't take its port", async () => {
    const { results } = await run(fake({ server: { ...SERVER, state: "port_in_use", owner: "node.exe" } }).probes);
    expect(results.server).toMatchObject({ status: "fail", result: "Port 3922 is in use by node.exe" });
  });
});

describe("summaries", () => {
  it("counts sensors per plugin plus HWiNFO's and LibreHardwareMonitor's", () => {
    expect(summariseSources(SOURCES)).toEqual({ count: 577, sources: [{ name: "System Info", count: 7 }, { name: "Network Info", count: 8 }], hwinfo: 562, libre: 0 });
    expect(summariseSources({ plugins: [] }).hwinfo).toBeNull();
  });

  it("counts what changed among the sampled readings, with a CPU load sample", () => {
    expect(liveness([snapshot(18), snapshot(23), snapshot(21)])).toEqual({ changed: 1, total: 2, sample: "CPU load 18 % → 23 % → 21 %" });
    expect(liveness([])).toEqual({ changed: 0, total: 0, sample: "" });
  });

  it("labels the progress", () => {
    expect(progressLabel({})).toBe("Checking 1 of 8…");
    const done = Object.fromEntries(["installed", "running", "version", "switch", "reachable", "sensors", "live", "server"].map((k) => [k, { status: "ok", result: "" }])) as Results;
    expect(progressLabel(done)).toBe("All checks passed");
    expect(progressLabel({ ...done, live: { status: "warn", result: "" } })).toBe("1 warning");
    expect(progressLabel({ ...done, reachable: { status: "fail", result: "" } })).toBe("1 failed · carry on without live data, or fix and check again");
  });
});
