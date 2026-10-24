// /api/alerts/history and POST /api/control/alert (the alerts module). The sessions run the engine against a fake Data API
// of their own (one per server, on a free port), so each server reads the same scripted readings. Alert ids and times
// differ by design (they come from the clock), so the transcripts are compared with them replaced; the answers' order,
// text, flags and the control state around them are compared exactly.
import http from "node:http";
import { CONFIG_WRITE, CONTROL_WRITE as C, get, request, sleep, write } from "./lib.mjs";

const scrub = (transcript) =>
  transcript
    .replace(/"id":"[0-9a-z]+-\d+"/g, '"id":"<id>"')
    .replace(/"(startedAt|endedAt|acknowledgedAt|mutedUntil|reload|since)":\d+/g, '"$1":<ms>');

const raw = (api, text) => api.raw(`${text}\r\n${api.host}Connection: close\r\n\r\n`);
const post = (api, type, body, headers = C) => api.raw(`POST /api/control/${type} HTTP/1.1\r\n${headers}${api.host}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
const saveConfig = (api, config) => {
  const body = JSON.stringify(config);
  return api.raw(`POST /api/config HTTP/1.1\r\n${CONFIG_WRITE}${api.host}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
};
const state = (api) => raw(api, "GET /api/control HTTP/1.1");
const history = (api) => raw(api, "GET /api/alerts/history HTTP/1.1");
const alertId = (transcript) => /"alerts":\[\{"id":"([^"]+)"/.exec(transcript)?.[1];

/** A stand-in for the Data API's /events: records each request and streams every message sent. */
async function fakeDataApi() {
  const requests = [];
  const streams = new Set();
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url} accept=${req.headers.accept}`);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": hello\n\n");
    streams.add(res);
    res.on("close", () => streams.delete(res));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    open: () => streams.size,
    send: (message) => streams.forEach((res) => res.write(`data: ${JSON.stringify(message)}\n\n`)),
    close: () => {
      streams.forEach((res) => res.destroy());
      server.close();
    },
  };
}

const page = (id) => ({ id, name: id, placements: [] });
const rule = (over, source = {}) => ({ id: "r1", name: "GPU temp", enabled: true, severity: "critical", cooldownSeconds: 0, source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0, ...source }, outputs: {}, ...over });
const config = (api, rules, extra = {}) => ({
  version: 11, activeProfile: "auto", dataApiUrl: api ? api.url : "http://127.0.0.1:9",
  profiles: [{ id: "desk", pages: [page("main"), page("alerts"), page("game")] }, { id: "wall", pages: [page("w1")] }],
  alerts: { enabled: true, rules, defaults: { seconds: 8 }, ...extra },
});
const reading = (value, key = "gpu.temp") => ({ sensors: { [key]: { value, unit: "°C" } }, removed: [] });
const notification = (id) => ({ sensors: { "plugins.InfoPanel.Notifications.windows.latest": { text: JSON.stringify({ id, app: "Discord", title: "Hi", body: "there" }) } } });

/** A case that runs a script against a fresh fake Data API, then leaves the server with a config of no alert streams. */
const session = (label, script) => ({
  label,
  map: scrub,
  run: async (api) => {
    const fake = await fakeDataApi();
    const out = [];
    try {
      await script(api, fake, out);
    } finally {
      // The same last config on both servers, and the streams closed.
      out.push(await saveConfig(api, config(null, [])));
      fake.close();
    }
    return out.join("\n=====\n");
  },
});

const settle = () => sleep(250);

export const cases = [
  // The history route.
  get("/api/alerts/history"),
  get("/api/alerts/history", { where: "lan" }),
  get("/api/alerts/history?x=1"),
  get("/api/alerts/history/"),
  get("/api/alerts/history/x"),
  ...["HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].map((m) => request(`${m} /api/alerts/history HTTP/1.1`)),
  // The alert action: the guards, then the body, then the engine.
  get("/api/control/alert"),
  request("HEAD /api/control/alert HTTP/1.1"),
  request("PUT /api/control/alert HTTP/1.1"),
  write("POST", "/api/control/alert", "", "{}"),
  write("POST", "/api/control/alert", "Content-Type: application/json\r\n", "{}"),
  write("POST", "/api/control/alert", "X-Dashboard-Control: 1\r\n", "{}"),
  write("POST", "/api/control/alert", "Content-Type: text/plain\r\nX-Dashboard-Control: 1\r\n", "{}"),
  write("POST", "/api/control/alert", "Content-Type: application/json\r\nX-Dashboard-Control: 0\r\n", "{}"),
  write("POST", "/api/control/alert", "Content-Type: application/json; charset=utf-8\r\nX-Dashboard-Control: 1\r\n", '{"action":"mute","minutes":0}'),
  ...["{", "nope", "5", "[]", "null", '"x"', "true", ""].map((body) => write("POST", "/api/control/alert", C, body)),
  ...[
    "{}", '{"action":"boom"}', '{"action":5}', '{"action":"test"}', '{"action":"test","ruleId":"nope"}', '{"action":"test","ruleId":5}', '{"action":"ack"}', '{"action":"ack","id":"nope"}', '{"action":"ack","id":5}',
    '{"action":"dismiss","id":null}', '{"action":"mute"}', '{"action":"mute","minutes":"x"}', '{"action":"mute","minutes":-1}', '{"action":"mute","minutes":1441}', '{"action":"mute","minutes":1.5}', '{"action":"mute","minutes":null}',
    '{"action":"mute","minutes":"10"}', '{"action":"mute","minutes":true}', '{"action":"mute","minutes":10,"extra":1}', '{"action":"mute","minutes":0}', '{"action":"mute","minutes":1440}', '{"action":"mute","minutes":0}',
  ].map((body) => write("POST", "/api/control/alert", C, body, { map: scrub })),
  // The page the history and control state are in after those.
  get("/api/control", { map: scrub }),
  get("/api/alerts/history"),

  session("a sensor rule fires, switches the page, is acknowledged and clears", async (api, fake, out) => {
    const r = rule({ outputs: { page: { page: "alerts", returnAfter: true }, highlight: { zones: ["z1"] } }, profiles: ["desk"] });
    out.push(await saveConfig(api, config(fake, [r])));
    await sleep(400);
    out.push(fake.requests.sort().join("\n"), String(fake.open()));
    fake.send(reading(70));
    await settle();
    fake.send(reading(90));
    await settle();
    const now = await state(api);
    out.push(now, await history(api));
    const id = alertId(now);
    out.push(await post(api, "alert", JSON.stringify({ action: "ack", id })));
    fake.send(reading(60));
    await settle();
    out.push(await state(api), await history(api));
  }),
  session("changes, missing and several conditions", async (api, fake, out) => {
    const rules = [
      rule({ id: "c", name: "Load changed", severity: "info" }, { key: "cpu.load", op: "changes", value: undefined }),
      rule({ id: "m", name: "Fan gone", severity: "warning" }, { key: "fan.rpm", op: "missing", value: undefined, forSeconds: 0 }),
      rule({ id: "x", name: "Both" }, { key: undefined, op: undefined, value: undefined, conditions: [{ key: "gpu.temp", op: ">", value: 80 }, { key: "gpu.power", op: "<", value: 5 }] }),
    ];
    out.push(await saveConfig(api, config(fake, rules)));
    await sleep(400);
    out.push(fake.requests.sort().join("\n"));
    fake.send({ sensors: { "cpu.load": { value: 1 }, "fan.rpm": { value: 900 }, "gpu.temp": { value: 40 }, "gpu.power": { value: 50 } } });
    await settle();
    fake.send({ sensors: { "cpu.load": { value: 2 }, "gpu.temp": { value: 90 } }, removed: ["fan.rpm"] });
    await settle();
    out.push(await state(api), await history(api));
  }),
  session("a notification fires after the first one is the baseline; filters", async (api, fake, out) => {
    const rules = [
      { id: "n1", name: "Notify", enabled: true, severity: "info", source: { kind: "notification" }, cooldownSeconds: 0, outputs: { display: { seconds: 5 } } },
      { id: "n2", name: "Only slack", enabled: true, severity: "info", source: { kind: "notification", apps: ["slack"] }, cooldownSeconds: 0, outputs: {} },
    ];
    out.push(await saveConfig(api, config(fake, rules)));
    await sleep(400);
    fake.send(notification("1"));
    await settle();
    out.push(await state(api));
    fake.send(notification("2"));
    await settle();
    out.push(await state(api), await history(api));
  }),
  session("test, dismiss and mute", async (api, fake, out) => {
    out.push(await saveConfig(api, config(fake, [rule({ outputs: { page: { page: "game" } } }), rule({ id: "r2", enabled: false }, { key: "cpu.temp" })])));
    await sleep(300);
    const tested = await post(api, "alert", '{"action":"test","ruleId":"r1"}');
    out.push(tested, await post(api, "alert", '{"action":"test","ruleId":"r2"}'), await state(api));
    out.push(await post(api, "alert", JSON.stringify({ action: "dismiss", id: alertId(tested.slice(tested.indexOf("\r\n\r\n"))) })));
    out.push(await post(api, "alert", '{"action":"mute","minutes":10}'));
    fake.send(reading(95));
    await settle();
    out.push(await state(api), await post(api, "alert", '{"action":"mute","minutes":0}'), await history(api));
  }),
  session("the config follows: rules removed clear the alert, keys change the streams", async (api, fake, out) => {
    out.push(await saveConfig(api, config(fake, [rule()])));
    await sleep(300);
    fake.send(reading(90));
    await settle();
    out.push(await state(api));
    out.push(await saveConfig(api, config(fake, [rule({ id: "r2" }, { key: "cpu.load" })])));
    await settle();
    out.push(await state(api), fake.requests.sort().join("\n"), String(fake.open()));
    out.push(await saveConfig(api, config(fake, [rule({ id: "r2" }, { key: "cpu.load" })], { enabled: false })));
    await settle();
    out.push(await state(api), String(fake.open()), await history(api));
  }),
  session("quiet hours around the clock: the whole day is quiet below critical", async (api, fake, out) => {
    const rules = [rule({ id: "c", severity: "critical" }), rule({ id: "w", severity: "warning" }, { key: "gpu.power" }), rule({ id: "i", severity: "info", outputs: { page: { page: "game" } } }, { key: "cpu.load" })];
    out.push(await saveConfig(api, config(fake, rules, { quietHours: { from: "00:00", to: "23:59", minSeverity: "critical" } })));
    await sleep(300);
    fake.send({ sensors: { "gpu.temp": { value: 99 }, "gpu.power": { value: 99 }, "cpu.load": { value: 99 } } });
    await settle();
    out.push(await state(api), await history(api));
  }),
];
