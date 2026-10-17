/**
 * Fetches font sources that send no CORS headers (Font Squirrel) for the lab
 * page: GET /font-proxy?url=<https URL on an allowed host>. The fetching, its
 * host checks, size cap and catalogue cache are the dashboard server's own
 * (server/font-proxy.mjs); the catalogue copy lives in `fonts/` (gitignored).
 * Dev server only.
 */
import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createFontProxy } from "../../server/font-proxy.mjs";

const send = (res: ServerResponse, status: number, body = "", type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
};

export function fontProxy(cacheDir: string): Plugin {
  const handle = createFontProxy({ cacheDir, send });
  return {
    name: "infopanel-font-proxy",
    configureServer(server) {
      server.middlewares.use("/font-proxy", (req, res) => {
        void handle(req, res, new URL(req.url ?? "", "http://lab").searchParams);
      });
    },
  };
}
