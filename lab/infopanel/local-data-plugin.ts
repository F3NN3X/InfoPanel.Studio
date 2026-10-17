/**
 * Serves InfoPanel's installed profiles to the lab, read-only, in the corpus
 * layout (/local/index.json, /local/<guid>/{Profile.xml,DisplayItems.xml,assets/<name>}).
 * Data folder: INFOPANEL_DATA_DIR, else %LOCALAPPDATA%\InfoPanel. Reads only
 * profiles.xml, profiles/<guid>.xml and assets/<guid>/<name>; nothing is written.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { isAssetName, isGuid, profilesFromXml } from "../../src/lib/infopanel/local-data.ts";

export function infopanelData(dir = process.env.INFOPANEL_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? "", "InfoPanel")): Plugin {
  const profiles = async () => profilesFromXml(await readFile(path.join(dir, "profiles.xml"), "utf8"));

  async function index() {
    return Promise.all(
      (await profiles()).map(async (p) => {
        const items = path.join(dir, "profiles", `${p.guid}.xml`);
        const assets = await readdir(path.join(dir, "assets", p.guid)).catch(() => [] as string[]);
        return {
          id: p.name || p.guid,
          base: `/local/${p.guid}`,
          file: `profiles/${p.guid}.xml`,
          bytes: (await stat(items).catch(() => null))?.size ?? 0,
          entries: ["Profile.xml", "DisplayItems.xml", ...assets.filter(isAssetName).map((a) => `assets/${a}`)],
          skipped: [],
          screenshot: null,
        };
      }),
    );
  }

  return {
    name: "infopanel-local-data",
    configureServer(server) {
      server.middlewares.use("/local", async (req, res, next) => {
        try {
          const parts = decodeURIComponent((req.url ?? "").split("?")[0]).split("/").filter(Boolean);
          let body: string | Buffer | null = null;
          if (parts.length === 1 && parts[0] === "index.json") body = JSON.stringify(await index());
          else if (parts.length >= 2 && isGuid(parts[0])) {
            const [guid, name, asset] = parts;
            if (parts.length === 2 && name === "Profile.xml") body = (await profiles()).find((p) => p.guid === guid)?.xml ?? null;
            else if (parts.length === 2 && name === "DisplayItems.xml") body = await readFile(path.join(dir, "profiles", `${guid}.xml`));
            else if (parts.length === 3 && name === "assets" && isAssetName(asset)) body = await readFile(path.join(dir, "assets", guid, asset));
          }
          if (body === null) return next();
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return next();
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}
