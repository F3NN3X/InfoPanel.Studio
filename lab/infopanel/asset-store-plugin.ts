/**
 * The lab's stand-in for the app's asset store (PLAN.md decision 5): image
 * assets uploaded by hash to `lab/infopanel/asset-store/` (gitignored), served
 * at a root-relative URL with the file's extension, which the app's image
 * widget accepts. Native image widgets use it for files edited, added or
 * reopened in the lab, as the app will for imported ones.
 *
 *   POST /lab-assets/missing          of a JSON list of hashes, the ones not stored
 *   PUT  /lab-assets/<sha256>         store an image; the body must hash to the name
 *   GET  /lab-assets/<sha256>.<ext>   serve it (the extension is for the widget only)
 *
 * Dev server only.
 */
import type { Plugin } from "vite";
import { HASH, hashStore, RASTER, send, TooLarge } from "./hash-store.ts";

export function assetStore(dir: string): Plugin {
  const store = hashStore(dir, RASTER, 50 * 1024 * 1024);
  return {
    name: "infopanel-lab-assets",
    configureServer(server) {
      server.middlewares.use("/lab-assets", async (req, res, next) => {
        try {
          const parts = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
          if (parts.length !== 1) return next();
          if (parts[0] === "missing" && req.method === "POST") return await store.missing(req, res);
          const hash = parts[0].replace(/\.[a-z]{2,4}$/, "");
          if (HASH.test(hash)) return await store.file(req, res, hash);
          next();
        } catch (e) {
          if (e instanceof TooLarge) return send(res, 413, e.message);
          send(res, 500, String(e));
        }
      });
    },
  };
}
