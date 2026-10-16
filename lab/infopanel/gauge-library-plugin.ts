/**
 * Stores the lab's gauge library (L7) in `lab/infopanel/gauges/` (gitignored):
 * `library.json` (the entries) and `frames/<sha256>` (each frame file once).
 *
 *   GET    /gauges/index.json        the entries
 *   GET    /gauges/frames/<sha256>   a frame
 *   POST   /gauges/missing           of a JSON list of hashes, the ones not stored
 *   PUT    /gauges/frames/<sha256>   store a frame; the body must hash to the name
 *   PUT    /gauges/entries/<id>      add or replace an entry (checked by parseEntry)
 *   DELETE /gauges/entries/<id>      remove an entry and the frames nothing else uses
 *
 * Dev server only: the lab is never built or served elsewhere.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { body, hashStore, RASTER, send, TooLarge } from "./hash-store.ts";
import { HASH, ID, parseEntry, type LibraryEntry } from "./src/gauges/library.ts";

const MAX_FRAME = 20 * 1024 * 1024;
const MAX_ENTRY = 1024 * 1024;

export function gaugeLibrary(dir: string): Plugin {
  const frames = path.join(dir, "frames");
  const index = path.join(dir, "library.json");
  // Frames are raster images only: nothing a browser would run if it opened the URL.
  const store = hashStore(frames, RASTER, MAX_FRAME);

  const load = async (): Promise<LibraryEntry[]> => {
    try {
      const list: unknown = JSON.parse(await readFile(index, "utf8"));
      return Array.isArray(list) ? list.flatMap((e) => parseEntry(e) ?? []) : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  };
  const save = async (list: LibraryEntry[]) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${index}.tmp`;
    await writeFile(tmp, JSON.stringify(list, null, 1) + "\n");
    await rename(tmp, index);
  };

  return {
    name: "infopanel-gauge-library",
    configureServer(server) {
      server.middlewares.use("/gauges", async (req, res, next) => {
        try {
          const parts = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
          const method = req.method ?? "GET";

          if (parts.length === 1 && parts[0] === "index.json" && method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            return res.end(JSON.stringify(await load()));
          }

          if (parts.length === 1 && parts[0] === "missing" && method === "POST") return await store.missing(req, res);
          if (parts.length === 2 && parts[0] === "frames" && HASH.test(parts[1])) return await store.file(req, res, parts[1]);

          if (parts.length === 2 && parts[0] === "entries" && ID.test(parts[1])) {
            const list = await load();
            if (method === "PUT") {
              let raw: unknown;
              try {
                raw = JSON.parse((await body(req, MAX_ENTRY)).toString("utf8"));
              } catch (e) {
                if (e instanceof TooLarge) throw e;
                return send(res, 400, "not JSON");
              }
              const entry = parseEntry(raw);
              if (!entry || entry.id !== parts[1]) return send(res, 400, "not a library entry");
              for (const f of entry.frames ?? []) if (!(await store.has(f.hash))) return send(res, 400, `frame ${f.name} is not stored`);
              await save([...list.filter((e) => e.id !== entry.id), entry]);
              return send(res, 204, "");
            }
            if (method === "DELETE") {
              const rest = list.filter((e) => e.id !== parts[1]);
              await save(rest);
              // Frames no remaining entry uses.
              const used = new Set(rest.flatMap((e) => (e.frames ?? []).map((f) => f.hash)));
              for (const name of await readdir(frames).catch(() => [] as string[])) {
                if (HASH.test(name) && !used.has(name)) await rm(path.join(frames, name), { force: true });
              }
              return send(res, 204, "");
            }
          }
          next();
        } catch (e) {
          if (e instanceof TooLarge) return send(res, 413, e.message);
          send(res, 500, String(e));
        }
      });
    },
  };
}
