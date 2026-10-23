// The server.test.mjs cases the native server (ips-server) does not pass yet because their routes are not ported, by
// test name. Skipped under SERVER_IMPL=native only; under Node every case runs. Each port step removes its names, and
// the list ends empty.
import { it } from "vitest";

export const NATIVE_PENDING = new Set([
  // /api/image-proxy
  "proxies images only",
  "follows image-proxy redirects only to allowed targets",
  // /api/canvases
  "keeps canvases apart from the config, so twenty imports fit under its cap",
  // /events/control and /api/control
  "counts a studio's marked control stream in /api/server/stats until it closes",
  "lists a kiosk in the control state while its control stream is open",
  // /api/debug/stats
  "serves /api/debug/stats only in debug mode and logs requests",
]);

/** The server under test: SERVER_IMPL, node by default. */
export const SERVER_IMPL = process.env.SERVER_IMPL || "node";

/** `it`, skipping a pending case when the native server is under test. */
export function serverIt(name, ...rest) {
  return (SERVER_IMPL === "native" && NATIVE_PENDING.has(name) ? it.skip : it)(name, ...rest);
}
