/**
 * Serves InfoPanel's installed profiles to the lab, read-only, in the corpus
 * layout (/local/index.json, /local/<guid>/{Profile.xml,DisplayItems.xml,assets/<name>}).
 * Data folder: INFOPANEL_DATA_DIR, else %LOCALAPPDATA%\InfoPanel. The reading is the
 * dashboard server's own (server/infopanel-local.mjs); nothing is written.
 */
import type { Plugin } from "vite";
import { createInstalledProfiles, infopanelDataDir, isGuid } from "../../server/infopanel-local.mjs";

export function infopanelData(dir = infopanelDataDir(process.env)): Plugin {
  const installed = createInstalledProfiles(dir);

  async function index() {
    return (await installed.list()).map((p) => ({
      id: p.name || p.guid,
      base: `/local/${p.guid}`,
      file: `profiles/${p.guid}.xml`,
      bytes: p.bytes,
      entries: ["Profile.xml", "DisplayItems.xml", ...p.assets.map((a) => `assets/${a}`)],
      skipped: [],
      screenshot: null,
    }));
  }

  return {
    name: "infopanel-local-data",
    configureServer(server) {
      server.middlewares.use("/local", async (req, res, next) => {
        try {
          const parts = decodeURIComponent((req.url ?? "").split("?")[0]).split("/").filter(Boolean);
          let body: string | Uint8Array | null = null;
          if (parts.length === 1 && parts[0] === "index.json") body = JSON.stringify(await index());
          else if (parts.length >= 2 && isGuid(parts[0])) body = await installed.read(parts[0], parts.slice(1));
          if (body === null) return next();
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}
