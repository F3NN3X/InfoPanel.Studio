// /api/config, /api/config/settings, /api/studio-prefs, /events/config (step 1).
import { CONFIG_WRITE as W, get, request, sleep, write } from "./lib.mjs";

const reads = [
  "/api/config",
  "/api/config/",
  "/api/config/settings",
  "/api/config/settings?since=0x10",
  "/api/config/settings?since=+5",
  "/api/config/settings?since=1e3",
  "/api/config/settings?since=%20",
  "/api/studio-prefs",
];

const writes = [
  ["POST", "/api/config", "{}"],
  ["PATCH", "/api/config/settings", '{"general":{"maxFps":15}}'],
  ["POST", "/api/config", '{ "version": 3, "z": 1.0,\n "profiles": [ {"id":"d"} ] }'],
  ["PATCH", "/api/config/settings", '{"style":{"clock":"12"},"profiles":{"d":{"performance":{"maxFps":5}}}}'],
  ["PATCH", "/api/config/settings", '{"general":{"locale":"nb-NO","maxFps":1}}'],
  ["PATCH", "/api/config/settings", "nope"],
  ["POST", "/api/config", '{"version":2}'],
  ["POST", "/api/config", '{"version":3,"profiles":[{"canvasRef":"cnv_00000000000000000000000000000000"}]}'],
  ["POST", "/api/config", "[]"],
  ["PUT", "/api/studio-prefs", '{"studio.previewData":"live"}'],
  ["PUT", "/api/studio-prefs", ""],
  ["PUT", "/api/studio-prefs", "[1]"],
  ["PUT", "/api/config/settings", "{}"],
  ["GET", "/api/config", ""],
  ["GET", "/api/config/settings?since=0", ""],
];

const bare = (head, body = "{}") => request(head, body);

export const cases = [
  ...reads.map((p) => get(p)),
  get("/api/studio-prefs", { where: "lan" }),
  ...writes.map(([m, p, b]) => write(m, p, W, b)),
  write("POST", "/api/config", `${W}X-Settings-Rev: \r\n`, '{"version":3, "general":{"maxFps":60}}'),
  write("POST", "/api/config", `${W}X-Settings-Rev: 0\r\n`, '{"version":3, "profiles":[{"id":"d","x":1e21}], "general":{"maxFps":60}}'),
  bare("POST /api/config HTTP/1.1\r\nContent-Type: text/plain\r\nX-Dashboard-Config: 1"),
  bare("POST /api/config HTTP/1.1\r\nContent-Type: application/json\r\nX-Dashboard-Config: 1\r\nX-Dashboard-Config: 1"),
  bare("POST /api/config HTTP/1.1\r\nContent-Type: application/json\r\nContent-Type: text/plain\r\nX-Dashboard-Config: 1"),
  bare("POST /api/config HTTP/1.1\r\nOrigin: http://evil"),
  bare(`POST /api/config HTTP/1.1\r\nOrigin: http://localhost:5173\r\n${W.trimEnd()}`),
  write("POST", "/api/config", W, "{}", { where: "lan" }),
  write("PATCH", "/api/config/settings", W, "{}", { where: "lan" }),
  {
    label: "events/config",
    run: async (api) => {
      const stream = api.open(`GET /events/config HTTP/1.1\r\n${api.host}\r\n`);
      await sleep(150);
      await api.raw(`POST /api/config HTTP/1.1\r\n${W}${api.host}Content-Length: 13\r\nConnection: close\r\n\r\n{"version":3}`);
      const seen = await stream.read(200);
      stream.close();
      return seen;
    },
  },
];
