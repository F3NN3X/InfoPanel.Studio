/**
 * Fetches font sources that send no CORS headers (Font Squirrel) for the lab
 * page: GET /font-proxy?url=<https URL on an allowed host>. Every redirect hop
 * is checked against the font hosts (font-sources.ts `get`) and the body is
 * capped. Dev server only.
 *
 * Font Squirrel throttles (an empty 202), so its catalogue is kept in
 * `fonts/fontsquirrel-list.json` (gitignored) for a week and served stale when
 * a refresh fails. With no copy at all the page gets an empty body, which it
 * reports as "throttled?" instead of an error.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { bytes, proxyAllowed } from "./src/font-sources.ts";

const CATALOGUE = "https://www.fontsquirrel.com/api/fontlist/all";
const WEEK = 7 * 24 * 3600 * 1000;

const fetchPlain = (url: string) => bytes((u, init) => fetch(u, { ...init, headers: { "User-Agent": "infopanel-import-lab" } }), url);

export function fontProxy(cacheDir: string): Plugin {
  const cache = path.join(cacheDir, "fontsquirrel-list.json");

  async function catalogue(): Promise<Uint8Array> {
    const age = await stat(cache).then((s) => Date.now() - s.mtimeMs, () => Infinity);
    if (age < WEEK) return readFile(cache);
    try {
      const body = await fetchPlain(CATALOGUE);
      JSON.parse(new TextDecoder().decode(body)); // only a whole list replaces the copy
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cache, body);
      return body;
    } catch {
      return readFile(cache).catch(() => new Uint8Array());
    }
  }

  return {
    name: "infopanel-font-proxy",
    configureServer(server) {
      server.middlewares.use("/font-proxy", async (req, res) => {
        const url = new URL(req.url ?? "", "http://lab").searchParams.get("url") ?? "";
        if (req.method !== "GET" || !proxyAllowed(url)) {
          res.statusCode = 400;
          return res.end("not an allowed font URL");
        }
        try {
          const body = url === CATALOGUE ? await catalogue() : await fetchPlain(url);
          if (body.length === 0 && url !== CATALOGUE) throw new Error(`${new URL(url).hostname} sent nothing (throttled?)`);
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
          res.end(body);
        } catch (e) {
          res.statusCode = 502;
          res.end(String((e as Error).message));
        }
      });
    },
  };
}
