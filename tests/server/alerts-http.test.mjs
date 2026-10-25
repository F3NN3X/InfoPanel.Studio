import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listenOnGoodPort, startServer } from "./harness.mjs";

// The alert engine through the server, (ips-server): it reads a fake Data API for the rules'
// sensors, fires and clears alerts into the control state, switches pages, keeps the history, and answers the alert action.

const control = { "Content-Type": "application/json", "X-Dashboard-Control": "1" };
const configHeaders = { "Content-Type": "application/json", "X-Dashboard-Config": "1" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, check) => {
  for (let i = 0; i < 200; i++) {
    const got = await check();
    if (got) return got;
    await wait(25);
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** A stand-in for the Data API's /events: records each request and streams every message sent. */
async function fakeDataApi() {
  const requests = [];
  const streams = new Set();
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, accept: req.headers.accept });
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": hello\n\n");
    streams.add(res);
    res.on("close", () => streams.delete(res));
  });
  const port = await listenOnGoodPort(server);
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    open: () => streams.size,
    send: (message) => streams.forEach((res) => res.write(`data: ${JSON.stringify(message)}\n\n`)),
    close: () => {
      streams.forEach((res) => res.destroy());
      server.close();
    },
  };
}

const start = (dataDir) => startServer({ HOME: path.join(dataDir, "home"), USERPROFILE: path.join(dataDir, "home"), INFOPANEL_DATA_DIR: path.join(dataDir, "infopanel"), DASHBOARD_DATA_DIR: dataDir, DASHBOARD_DIST: path.join(dataDir, "no-dist") });

const rule = (over = {}) => ({
  id: "r1", name: "GPU temp", enabled: true, severity: "critical", cooldownSeconds: 0,
  source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0 },
  outputs: { page: { page: "alerts", returnAfter: true } },
  ...over,
});
const configWith = (api, rules) => ({
  activeProfile: "auto", dataApiUrl: api.url,
  profiles: [{ id: "desk", pages: [{ id: "main" }, { id: "alerts" }] }],
  alerts: { enabled: true, rules, defaults: { seconds: 8 } },
});

describe("alerts through the server", () => {
  let dir, api, server;
  afterEach(async () => {
    await server?.stop();
    api?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function setup(rules) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ips-alerts-"));
    api = await fakeDataApi();
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(configWith(api, rules)));
    server = await start(dir);
    return server.base;
  }
  const post = (base, body) => fetch(`${base}/api/control/alert`, { method: "POST", headers: control, body });
  const state = async (base) => (await fetch(`${base}/api/control`)).json();

  it("reads the Data API for the rules' sensors, fires on a reading, switches the page and clears", async () => {
    const base = await setup([rule()]);
    await until("the subscription", () => api.requests.length > 0 && api.open() > 0);
    expect(api.requests).toEqual([{ url: "/events?prefix=gpu.&interval=1000", accept: "text/event-stream" }]);

    api.send({ sensors: { "gpu.temp": { value: 90, unit: "°C" } }, removed: [] });
    const fired = await until("the alert", async () => (await state(base)).alerts[0]);
    expect(fired).toMatchObject({ ruleId: "r1", text: "90°C", severity: "critical", acknowledged: false });
    expect((await state(base)).profiles.desk.page).toBe("alerts");
    const history = await (await fetch(`${base}/api/alerts/history`)).json();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: fired.id, text: "90°C" });
    expect(history[0].endedAt).toBeUndefined();

    const acked = await post(base, JSON.stringify({ action: "ack", id: fired.id }));
    expect(acked.status).toBe(200);
    expect(await acked.json()).toMatchObject({ alerts: [{ id: fired.id, acknowledged: true }], mutedUntil: null });
    api.send({ sensors: { "gpu.temp": { value: 60 } } });
    await until("the clear", async () => (await state(base)).alerts.length === 0);
    expect((await state(base)).profiles.desk.page).toBe("main");
    const ended = await (await fetch(`${base}/api/alerts/history`)).json();
    expect(typeof ended[0].endedAt).toBe("number");
    expect(typeof ended[0].acknowledgedAt).toBe("number");

    // alerts.json follows the history within a couple of seconds, compact.
    const file = path.join(dir, "alerts.json");
    await until("alerts.json", () => fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("endedAt"));
    const text = fs.readFileSync(file, "utf8");
    expect(text.startsWith('{"history":[{"id":"')).toBe(true);
    expect(text).not.toContain("\n");
  });

  it("answers the alert action's refusals, tests, dismiss and mute", async () => {
    const base = await setup([rule()]);
    expect((await fetch(`${base}/api/alerts/history`)).status).toBe(200);
    expect((await fetch(`${base}/api/alerts/history`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/api/control/alert`)).status).toBe(405);
    expect((await fetch(`${base}/api/control/alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    for (const body of ["{", "5", "[]", "null"]) {
      const res = await post(base, body);
      expect([res.status, await res.text()]).toEqual([400, "expected a JSON object"]);
    }
    const errors = [
      ["{}", "unknown action"], ['{"action":"test","ruleId":"nope"}', "unknown rule"], ['{"action":"ack","id":"nope"}', "unknown alert"],
      ['{"action":"mute"}', "bad mute minutes"], ['{"action":"mute","minutes":1441}', "bad mute minutes"],
    ];
    for (const [body, error] of errors) {
      const res = await post(base, body);
      expect([res.status, await res.text()]).toEqual([400, error]);
    }
    const test = await (await post(base, '{"action":"test","ruleId":"r1"}')).json();
    expect(test.alerts[0]).toMatchObject({ test: true, text: "" });
    expect((await state(base)).alerts).toHaveLength(1);
    const gone = await (await post(base, JSON.stringify({ action: "dismiss", id: test.alerts[0].id }))).json();
    expect(gone).toEqual({ alerts: [], mutedUntil: null });
    const muted = await (await post(base, '{"action":"mute","minutes":10}')).json();
    expect(muted.mutedUntil).toBeGreaterThan(Date.now());
    expect((await state(base)).mutedUntil).toBe(muted.mutedUntil);
    expect(await (await post(base, '{"action":"mute","minutes":0}')).json()).toEqual({ alerts: [], mutedUntil: null });
  });

  it("follows the saved config: new keys open a stream, unchanged keys keep it, alerts off closes them", async () => {
    const base = await setup([rule()]);
    await until("the first stream", () => api.open() === 1);
    const save = (config) => fetch(`${base}/api/config`, { method: "POST", headers: configHeaders, body: JSON.stringify(config) });
    expect((await save(configWith(api, [rule()]))).status).toBe(200);
    const more = configWith(api, [rule(), rule({ id: "r2", source: { kind: "sensor", key: "cpu.load", op: ">", value: 1 } })]);
    expect((await save(more)).status).toBe(200);
    await until("the second stream", () => api.open() === 2);
    expect(api.requests.map((r) => r.url).sort()).toEqual(["/events?prefix=cpu.&interval=1000", "/events?prefix=gpu.&interval=1000"]);
    expect((await save({ ...more, alerts: { ...more.alerts, enabled: false } })).status).toBe(200);
    await until("the streams to close", () => api.open() === 0);
  });
});

describe("alerts.json across restarts", () => {
  let dir, server;
  afterEach(async () => {
    await server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads a history file, closing open entries, and keeps writing it compact", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ips-alerts-rt-"));
    fs.writeFileSync(path.join(dir, "alerts.json"), JSON.stringify({ history: [{ id: "a-1", ruleId: "r", name: "N", severity: "info", text: "t", startedAt: 5 }, { id: "a-2", endedAt: 9, extra: [1, { z: 2 }] }, { nope: 1 }] }));
    server = await start(dir);
    const history = await (await fetch(`${server.base}/api/alerts/history`)).json();
    expect(history.map((h) => h.id)).toEqual(["a-1", "a-2"]);
    expect(history[0].endedAt).toBeGreaterThan(5);
    expect(history[1]).toEqual({ id: "a-2", endedAt: 9, extra: [1, { z: 2 }] });
    const file = path.join(dir, "alerts.json");
    await until("alerts.json rewritten", () => !fs.readFileSync(file, "utf8").includes("nope"));
    expect(JSON.parse(fs.readFileSync(file, "utf8")).history).toEqual(history);
  });
});
