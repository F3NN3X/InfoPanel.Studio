// /api/debug/stats and the debug request log. The numbers differ by design (the native server has no V8: see
// src-tauri/crates/ips-server/src/debug.rs), so a 200 is compared by its keys and channels, not its values.
import { get, request, sleep } from "./lib.mjs";

/** The shape of a debug stats answer: its top-level keys and the SSE channels, not the runtime's own numbers. */
const shape = (transcript) => {
  const [head, body = ""] = transcript.split("\n\n");
  try {
    const stats = JSON.parse(body.replace('"uptimeSeconds":U', '"uptimeSeconds":0'));
    return `${head}\n${Object.keys(stats).join(",")} sseClients=${JSON.stringify(stats.sseClients)} p99=${typeof stats.eventLoopDelayMs?.p99} rss=${stats.memory?.rss > 0}`;
  } catch {
    return transcript;
  }
};

export const cases = [
  // Not in debug mode: 404 for every method, before anything else.
  ...["GET", "POST", "PUT", "HEAD", "DELETE"].map((m) => request(`${m} /api/debug/stats HTTP/1.1`)),
  get("/api/debug/stats", { where: "lan" }),
  ...["POST", "PUT", "HEAD", "DELETE"].map((m) => request(`${m} /api/debug/stats HTTP/1.1`, null, { where: "debug" })),
  get("/api/debug/stats", { where: "debug", map: shape }),
  get("/api/debug/stats/", { where: "debug" }),
  {
    label: "debug stats count the channels ever opened",
    where: "debug",
    map: shape,
    run: async (api) => {
      const config = api.open(`GET /events/config HTTP/1.1\r\n${api.host}\r\n`);
      const control = api.open(`GET /events/control?client=studio HTTP/1.1\r\n${api.host}\r\n`);
      await sleep(150);
      config.close();
      control.close();
      await sleep(150);
      return api.raw(`GET /api/debug/stats HTTP/1.1\r\n${api.host}Connection: close\r\n\r\n`);
    },
  },
  // The debug mode's own URL rules are the same as the normal mode's.
  get("/api/health", { where: "debug" }),
  get("/api/server/stats", { where: "debug" }),
];
