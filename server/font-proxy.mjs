// Fetches font sources that send no CORS headers (Font Squirrel) for the
// studio's Library › Fonts › Get a font, and for the import lab:
//   GET /api/font-proxy?url=<https URL on www.fontsquirrel.com>
// Only that host is proxied; every redirect hop must stay on a known font
// host over HTTPS, and the body is capped. The answer is opaque bytes,
// sandboxed, never rendered here.
//
// Font Squirrel throttles (an empty 202), so its catalogue is kept in
// `cacheDir/fontsquirrel-list.json` for a week and served stale when a
// refresh fails. With no copy at all the page gets an empty body, which it
// reports as "throttled?" instead of an error.
//
// The host lists match src/lib/infopanel/font-sources.ts (HOSTS, PROXIED).
// Node built-ins only. The pure helpers are exported for the tests.

import fs from "node:fs/promises";
import path from "node:path";

export const CATALOGUE = "https://www.fontsquirrel.com/api/fontlist/all";
const PROXIED = new Set(["www.fontsquirrel.com"]);
const FONT_HOSTS = new Set(["api.fontsource.org", "cdn.jsdelivr.net", "fonts.google.com", "fonts.gstatic.com", "www.fontsquirrel.com"]);
export const MAX_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const WEEK = 7 * 24 * 3600 * 1000;

/* ---------------- pure helpers ---------------- */

/** May the server fetch this for a page? */
export function proxyAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PROXIED.has(u.hostname);
  } catch {
    return false;
  }
}

/** Whether a redirect target stays on a font host over HTTPS. */
export function hopAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && FONT_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/* ---------------- fetching ---------------- */

/** The body of `url`, following checked redirects by hand, at most MAX_BYTES. */
export async function fetchBytes(url, fetchImpl = fetch) {
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!hopAllowed(url)) throw new Error(`refusing to fetch ${url}`);
    const r = await fetchImpl(url, { redirect: "manual", headers: { "User-Agent": "infopanel-studio" } });
    const location = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (location) {
      url = new URL(location, url).href;
      continue;
    }
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    if (!r.body) return new Uint8Array();
    const chunks = [];
    let size = 0;
    for await (const chunk of r.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error(`${url}: over ${MAX_BYTES} bytes`);
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error(`${url}: too many redirects`);
}

/** The route. `send(res, status, body, type)` is the server's response helper. */
export function createFontProxy({ cacheDir, send, fetchImpl = fetch }) {
  const cache = path.join(cacheDir, "fontsquirrel-list.json");

  async function catalogue() {
    const age = await fs.stat(cache).then((s) => Date.now() - s.mtimeMs, () => Infinity);
    if (age < WEEK) return fs.readFile(cache);
    try {
      const body = await fetchBytes(CATALOGUE, fetchImpl);
      JSON.parse(new TextDecoder().decode(body)); // only a whole list replaces the copy
      await fs.mkdir(cacheDir, { recursive: true });
      // Atomic: a crash mid-write must not leave a cut list that a week of reads then serves.
      const tmp = `${cache}.tmp`;
      await fs.writeFile(tmp, body);
      await fs.rename(tmp, cache);
      return body;
    } catch {
      return fs.readFile(cache).catch(() => new Uint8Array());
    }
  }

  return async function handleFontProxy(req, res, query) {
    if (req.method !== "GET") return send(res, 405);
    const url = query.get("url") ?? "";
    if (!proxyAllowed(url)) return send(res, 400, "not an allowed font URL");
    try {
      const body = url === CATALOGUE ? await catalogue() : await fetchBytes(url, fetchImpl);
      if (body.length === 0 && url !== CATALOGUE) throw new Error(`${new URL(url).hostname} sent nothing (throttled?)`);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      });
      res.end(body);
    } catch (e) {
      send(res, 502, String(e?.message ?? e));
    }
  };
}
