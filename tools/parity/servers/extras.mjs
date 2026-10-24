// /api/integrations, /api/extras, /events/extras (the extras module: integrations, OBS, calendar). A write that grows past
// the body cap is not compared: Node destroys the socket (the client sees nothing), native answers 400 and closes.
// Link ids are random UUIDs; the agents' part of the state is the agents module's (Node reads this machine's Claude
// session files); and Node lists a failing link's error in the order the fetches finish (native: the links' order). So
// the transcripts are compared with the ids and agents replaced and the errors sorted.
import { CONFIG_WRITE, get, request, sleep, write } from "./lib.mjs";

const AGENT = "Content-Type: application/json\r\nX-Agent-Event: 1\r\n";
const uuids = (transcript) => transcript.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, "<uuid>").replace(/"agents":.*$/gm, '"agents":<agents>').replace(/"error":"([^"]*)"/g, (_m, list) => `"error":"${list.split("; ").sort().join("; ")}"`);
const put = (body, extra) => write("PUT", "/api/integrations", CONFIG_WRITE, body, { map: uuids, ...extra });
const raw = (api, text) => api.raw(`${text}\r\n${api.host}Connection: close\r\n\r\n`);
const putRaw = (api, body) => api.raw(`PUT /api/integrations HTTP/1.1\r\n${CONFIG_WRITE}${api.host}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
const state = (api) => raw(api, "GET /api/extras HTTP/1.1");

/** A case that sends each patch in order, then reads the public form and the extras state. */
const session = (label, patches, { settle = 0, where } = {}) => ({
  label,
  where,
  map: uuids,
  run: async (api) => {
    const out = [];
    for (const patch of patches) out.push(await putRaw(api, patch));
    out.push(await raw(api, "GET /api/integrations HTTP/1.1"));
    await sleep(settle);
    out.push(await state(api));
    return out.join("\n=====\n");
  },
});

export const cases = [
  get("/api/extras", { map: uuids }),
  get("/api/extras", { where: "lan", map: uuids }),
  ...["HEAD", "POST", "PUT", "DELETE", "PATCH"].map((m) => request(`${m} /api/extras HTTP/1.1`)),
  get("/api/extras/"),
  get("/api/extras?x=1", { map: uuids }),
  get("/api/integrations"),
  get("/api/integrations", { where: "lan" }),
  get("/api/integrations/"),
  ...["HEAD", "POST", "DELETE", "PATCH"].map((m) => request(`${m} /api/integrations HTTP/1.1`)),
  // The write guards, in order: remote edit, the config write headers, the body.
  write("PUT", "/api/integrations", CONFIG_WRITE, "{}", { where: "lan" }),
  request("PUT /api/integrations HTTP/1.1\r\nContent-Type: application/json", "{}"),
  request("PUT /api/integrations HTTP/1.1\r\nContent-Type: text/plain\r\nX-Dashboard-Config: 1", "{}"),
  request("PUT /api/integrations HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Config: 0", "{}"),
  request("PUT /api/integrations HTTP/1.1\r\nContent-Type: application/json; charset=utf-8\r\nX-Dashboard-Config: 1", "{}"),
  ...["{", "nope", "5", "[]", "null", '"x"', "true"].map((body) => put(body)),
  ...[
    '{"obs":null}', '{"obs":[]}', '{"obs":"x"}', '{"obs":{"host":"ws://x/y"}}', '{"obs":{"host":"a b"}}', '{"obs":{"host":"[::1"}}', '{"calendar":null}', '{"calendar":{}}', '{"calendar":{"links":{}}}',
    '{"calendar":{"links":[1]}}', '{"calendar":{"links":[null]}}', '{"calendar":{"links":[{}]}}', '{"calendar":{"links":[{"url":"file:///c:/x.ics"}]}}', '{"calendar":{"links":[{"url":5}]}}',
    `{"calendar":{"links":[${Array(11).fill('{"url":"https://a.example/a"}').join(",")}]}}`,
  ].map((body) => put(body)),
  // Nothing was saved by the refusals; an empty body and an empty patch are fine.
  get("/api/integrations"),
  write("PUT", "/api/integrations", CONFIG_WRITE, "", { map: uuids }),
  put("{}"),
  put('{"unknown":1}'),
  session("obs settings: host, port forms and a password", ['{"obs":{"host":"127.0.0.1","port":"1","password":"hunter2"}}', '{"obs":{"port":4456}}', '{"obs":{"port":"abc"}}', '{"obs":{"port":true}}', '{"obs":{"port":null}}', '{"obs":{"password":5}}', '{"obs":{"host":"[::1]"}}', '{"obs":{"host":7}}', '{"obs":{"host":"127.0.0.1","port":1}}'], { settle: 150 }),
  session("password: 512 characters kept, cleared with an empty one", [`{"obs":{"password":"${"p".repeat(600)}"}}`, '{"obs":{"password":""}}']),
  session("calendar links: add, keep by id, replace the list", ['{"calendar":{"links":[{"url":"webcal://calendar.example.com/private/abc/basic.ics","label":"  Work  "},{"url":"HTTPS://Other.Example:8443/x y.ics"}]}}', '{"calendar":{"links":[{"label":"x"}]}}', '{"calendar":{"links":[]}}'], { settle: 100 }),
  // A link to this machine is refused at fetch time, and the error never carries the URL.
  session("calendar link to this machine is not fetched", ['{"calendar":{"links":[{"url":"http://127.0.0.1:9/secret-token.ics","label":"Local"},{"url":"http://localhost:9/secret-token.ics"},{"url":"http://[::1]:9/secret-token.ics"},{"url":"http://169.254.169.254/latest"}]}}'], { settle: 400 }),
  session("calendar links cleared", ['{"calendar":{"links":[]}}'], { settle: 150 }),
  {
    label: "/events/extras: the state now, then each change",
    map: uuids,
    run: async (api) => {
      const stream = api.open(`GET /events/extras HTTP/1.1\r\n${api.host}\r\n`);
      await sleep(150);
      await putRaw(api, '{"obs":{"host":"127.0.0.1","port":1}}');
      await sleep(250);
      await putRaw(api, '{"obs":{"host":""}}');
      await sleep(250);
      const seen = await stream.read(10);
      stream.close();
      await sleep(100);
      return [seen, await raw(api, "GET /api/server/stats HTTP/1.1")].join("\n=====\n");
    },
  },
  get("/api/integrations"),
  // The agent hooks' posts: the guards and the body checks (a payload that names no session is ignored by both).
  ...["event?agent=claude", "event", "statusline"].flatMap((route) => {
    const agent = (headers, body, extra) => write("POST", `/api/agents/${route}`, headers, body, extra);
    return [
      agent(AGENT, "{}"),
      agent(AGENT, "null"),
      agent(AGENT, "{"),
      agent(AGENT, ""),
      agent(AGENT, "{}", { where: "lan" }),
      agent("Content-Type: application/json\r\n", "{}"),
      agent("Content-Type: text/plain\r\nX-Agent-Event: 1\r\n", "{}"),
      agent("Content-Type: application/json\r\nX-Agent-Event: 0\r\n", "{}"),
    ];
  }),
  ...["GET", "PUT", "DELETE", "HEAD"].map((m) => request(`${m} /api/agents/event HTTP/1.1`)),
  request("GET /api/agents/statusline HTTP/1.1"),
  get("/api/agents/event/"),
  get("/api/agents/other"),
];
