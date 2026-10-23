// /api/control, /events/control (the control module). POST /api/control/alert is the alerts module's and is not compared
// until it is ported.
import { CONFIG_WRITE, CONTROL_WRITE as C, get, request, sleep, write } from "./lib.mjs";

const CONFIG = '{"version":11,"activeProfile":"auto","profiles":[{"id":"desk","pages":[{"id":"main"},{"id":"game"},{"id":"stream"}],"rotate":{"enabled":false,"seconds":10},"island":{"enabled":true}},{"id":"strip","pages":[{"id":"main"}]}]}';
const saveConfig = (api) => api.raw(`POST /api/config HTTP/1.1\r\n${CONFIG_WRITE}${api.host}Content-Length: ${CONFIG.length}\r\nConnection: close\r\n\r\n${CONFIG}`);
const post = (api, type, body, headers = C) =>
  api.raw(`POST /api/control/${type} HTTP/1.1\r\n${headers}${api.host}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);

/** A case that saves a config first, then sends each action in order, returning every answer. */
const session = (label, actions, { where } = {}) => ({
  label,
  where,
  run: async (api) => {
    const out = [await saveConfig(api)];
    for (const [type, body, headers] of actions) out.push(await post(api, type, body, headers));
    out.push(await api.raw(`GET /api/control HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`));
    return out.join("\n=====\n");
  },
});

const streamOf = (label, query, { where, sendAfter } = {}) => ({
  label,
  where,
  run: async (api) => {
    await saveConfig(api);
    const stream = api.open(`GET /events/control${query} HTTP/1.1\r\n${api.host}\r\n`);
    await sleep(150);
    const stats = [await api.raw(`GET /api/server/stats HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`)];
    if (sendAfter) for (const [type, body] of sendAfter) await post(api, type, body);
    const seen = await stream.read(200);
    stream.close();
    await sleep(150);
    stats.push(await api.raw(`GET /api/control HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`));
    stats.push(await api.raw(`GET /api/server/stats HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`));
    return [seen, ...stats].join("\n=====\n");
  },
});

export const cases = [
  get("/api/control"),
  request("POST /api/control HTTP/1.1", "{}"),
  request("HEAD /api/control HTTP/1.1"),
  ...["/api/control/", "/api/control/nope", "/api/control/page/x", "/api/control/mute", "/api/control/shown", "/api/control/tick", "/api/control/PAGE"].map((p) => get(p)),
  get("/api/control/page"),
  request("PUT /api/control/rotate HTTP/1.1", "{}"),
  request("DELETE /api/control/kiosk HTTP/1.1"),
  request("POST /api/control/page HTTP/1.1\r\nContent-Type: application/json", "{}"),
  request("POST /api/control/page HTTP/1.1\r\nContent-Type: text/plain\r\nX-Dashboard-Control: 1", "{}"),
  request("POST /api/control/page HTTP/1.1\r\nX-Dashboard-Control: 1", "{}"),
  request("POST /api/control/page HTTP/1.1\r\nOrigin: http://evil\r\nContent-Type: application/json\r\nX-Dashboard-Control: 1", "{}"),
  write("POST", "/api/control/touch", C, "", { label: "empty body" }),
  ...["[]", "null", "{", "5", '"x"', "true", "[{}]"].map((b) => write("POST", "/api/control/page", C, b)),
  // Over the 4096-byte cap Node destroys the socket and sends nothing; ips-server answers 400 and closes (tests/routes.rs).
  write("POST", "/api/control/page", C, `{"pad":"${"x".repeat(4060)}"}`),
  write("POST", "/api/control/kiosk", C, '{"action":"reload"}', { where: "lan" }),
  session("no profile", [["page", '{"page":"main"}'], ["rotate", '{"state":"on"}'], ["touch", "{}"], ["kiosk", '{"action":"dim"}'], ["kiosk", '{"action":"reload"}']]),
  session("pages and profiles", [
    ["page", '{"profile":"desk","page":"game"}'],
    ["page", '{"page":"next"}'],
    ["page", '{"page":"next"}'],
    ["page", '{"page":"prev","profile":"desk"}'],
    ["page", '{"page":"nope"}'],
    ["page", '{"profile":"nope","page":"main"}'],
    ["page", '{"profile":"strip","page":"next"}'],
    ["page", '{"page":5}'],
    ["page", '{"profile":["desk"],"page":"main"}'],
    ["page", '{"profile":"desk","page":"main","type":"profile"}'],
    ["profile", '{"profile":"strip"}'],
    ["profile", '{"profile":"strip"}'],
    ["profile", '{"profile":"auto"}'],
    ["profile", '{"profile":null}'],
    ["profile", '{"profile":"nope"}'],
    ["profile", "{}"],
    ["profile", '{"profile":7}'],
    ["touch", '{"profile":"desk"}'],
    ["touch", '{"profile":"nope"}'],
  ]),
  session("rotation", [
    ["rotate", '{"profile":"desk","state":"on"}'],
    ["rotate", '{"profile":"desk","state":"toggle"}'],
    ["rotate", '{"profile":"desk","state":"saved"}'],
    ["rotate", '{"profile":"desk"}'],
    ["rotate", '{"profile":"desk","state":"sideways"}'],
    ["rotate", '{"profile":"desk","state":null}'],
    ["rotate", '{"profile":"strip","state":"on"}'],
    ["rotate", '{"profile":"desk","state":"off"}'],
  ]),
  session("kiosk actions", [
    ["kiosk", '{"action":"dim","profile":"desk"}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"toggle"}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"on","level":0.3}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"on","level":0.3}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"on","level":0.95}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"on","level":null}'],
    ["kiosk", '{"action":"dim","profile":"desk","state":"off","level":5}'],
    ["kiosk", '{"action":"dim","state":"dark"}'],
    ["kiosk", '{"action":"dim","profile":"gone"}'],
    ["kiosk", '{"action":"island","profile":"desk"}'],
    ["kiosk", '{"action":"island","profile":"desk","state":"saved"}'],
    ["kiosk", '{"action":"island","profile":"strip","state":"on"}'],
    ["kiosk", '{"action":"island","state":"dark"}'],
    ["kiosk", '{"action":"reload"}'],
    ["kiosk", '{"action":"reload","profile":"strip"}'],
    ["kiosk", '{"action":"nope"}'],
    ["kiosk", "{}"],
    ["kiosk", '{"action":"reload","profile":"nope"}'],
  ]),
  streamOf("kiosk stream", "?profile=desk&page=game&client=studio"),
  streamOf("studio stream", "?client=studio", { sendAfter: [["page", '{"profile":"desk","page":"stream"}'], ["touch", "{}"]] }),
  streamOf("plain stream", "", { sendAfter: [["kiosk", '{"action":"dim","profile":"strip","state":"on"}']] }),
  streamOf("empty profile", "?profile=&client=studio"),
  streamOf("unknown profile kiosk", "?profile=nope&page=x"),
  streamOf("kiosk from another address", "?profile=desk", { where: "lan" }),
  streamOf("studio from another address", "?client=studio", { where: "lan" }),
  {
    label: "config save reaches the control stream",
    run: async (api) => {
      await saveConfig(api);
      const stream = api.open(`GET /events/control HTTP/1.1\r\n${api.host}\r\n`);
      await sleep(150);
      await post(api, "rotate", '{"profile":"desk","state":"on"}');
      const changed = CONFIG.replace('"enabled":false', '"enabled":true');
      await api.raw(`POST /api/config HTTP/1.1\r\n${CONFIG_WRITE}${api.host}Content-Length: ${changed.length}\r\nConnection: close\r\n\r\n${changed}`);
      const dropped = CONFIG.replace(',{"id":"strip","pages":[{"id":"main"}]}', "");
      await api.raw(`POST /api/config HTTP/1.1\r\n${CONFIG_WRITE}${api.host}Content-Length: ${dropped.length}\r\nConnection: close\r\n\r\n${dropped}`);
      const seen = await stream.read(250);
      stream.close();
      return seen;
    },
  },
  {
    label: "events/control by method",
    run: async (api) => {
      const stream = api.open(`POST /events/control HTTP/1.1\r\n${api.host}Content-Length: 0\r\n\r\n`);
      const seen = await stream.read(150);
      stream.close();
      return seen;
    },
  },
];
