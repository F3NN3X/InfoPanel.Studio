// The server.test.mjs cases the native server (ips-server) does not pass yet because their routes are not ported, by
// test name. Skipped under SERVER_IMPL=native only; under Node every case runs. Each port step removes its names, and
// the list ends empty.
import { it } from "vitest";

export const NATIVE_PENDING = new Set([
  // /api/image-proxy
  "proxies images only",
  "follows image-proxy redirects only to allowed targets",
]);

/** The server under test: SERVER_IMPL, node by default. */
export const SERVER_IMPL = process.env.SERVER_IMPL || "node";

/** `it`, skipping a pending case when the native server is under test. */
export function serverIt(name, ...rest) {
  return (SERVER_IMPL === "native" && NATIVE_PENDING.has(name) ? it.skip : it)(name, ...rest);
}
