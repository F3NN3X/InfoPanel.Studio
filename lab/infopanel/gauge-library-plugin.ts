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
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { MIME, sniff, type AssetType } from "./src/assets/assets.ts";
import { HASH, ID, parseEntry, type LibraryEntry } from "./src/gauges/library.ts";

/** Frames are raster images only: nothing a browser would run if it opened the URL. */
const FRAME_TYPES: ReadonlySet<AssetType> = new Set(["png", "jpeg", "gif", "webp", "bmp", "ico"]);

const MAX_FRAME = 20 * 1024 * 1024;
const MAX_ENTRY = 1024 * 1024;

class TooLarge extends Error {}

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new TooLarge(`over ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function gaugeLibrary(dir: string): Plugin {
  const frames = path.join(dir, "frames");
  const index = path.join(dir, "library.json");

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
  const hasFrame = (hash: string) => stat(path.join(frames, hash)).then(() => true, () => false);

  return {
    name: "infopanel-gauge-library",
    configureServer(server) {
      server.middlewares.use("/gauges", async (req, res, next) => {
        const send = (status: number, text: string) => {
          res.statusCode = status;
          res.end(text);
        };
        try {
          const parts = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
          const method = req.method ?? "GET";

          if (parts.length === 1 && parts[0] === "index.json" && method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            return res.end(JSON.stringify(await load()));
          }

          if (parts.length === 1 && parts[0] === "missing" && method === "POST") {
            let list: unknown;
            try {
              list = JSON.parse((await body(req, MAX_ENTRY)).toString("utf8"));
            } catch (e) {
              if (e instanceof TooLarge) throw e;
              return send(400, "not JSON");
            }
            if (!Array.isArray(list) || !list.every((h) => typeof h === "string" && HASH.test(h))) return send(400, "not a list of hashes");
            const missing: string[] = [];
            for (const h of new Set(list as string[])) if (!(await hasFrame(h))) missing.push(h);
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify(missing));
          }

          if (parts.length === 2 && parts[0] === "frames" && HASH.test(parts[1])) {
            const file = path.join(frames, parts[1]);
            if (method === "GET") {
              if (!(await hasFrame(parts[1]))) return send(404, "not stored");
              const data = await readFile(file);
              const { type } = sniff(new Uint8Array(data));
              if (!FRAME_TYPES.has(type)) return send(415, "not an image frame");
              res.setHeader("Content-Type", MIME[type]);
              res.setHeader("X-Content-Type-Options", "nosniff");
              res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
              res.setHeader("Cache-Control", "no-store");
              return res.end(data);
            }
            if (method === "PUT") {
              const data = await body(req, MAX_FRAME);
              if (createHash("sha256").update(data).digest("hex") !== parts[1]) return send(400, "the body does not match its hash");
              if (!FRAME_TYPES.has(sniff(new Uint8Array(data)).type)) return send(415, "frames must be PNG, JPEG, GIF, WebP, BMP or ICO images");
              await mkdir(frames, { recursive: true });
              await writeFile(file, data);
              return send(204, "");
            }
          }

          if (parts.length === 2 && parts[0] === "entries" && ID.test(parts[1])) {
            const list = await load();
            if (method === "PUT") {
              let raw: unknown;
              try {
                raw = JSON.parse((await body(req, MAX_ENTRY)).toString("utf8"));
              } catch (e) {
                if (e instanceof TooLarge) throw e;
                return send(400, "not JSON");
              }
              const entry = parseEntry(raw);
              if (!entry || entry.id !== parts[1]) return send(400, "not a library entry");
              for (const f of entry.frames ?? []) if (!(await hasFrame(f.hash))) return send(400, `frame ${f.name} is not stored`);
              await save([...list.filter((e) => e.id !== entry.id), entry]);
              return send(204, "");
            }
            if (method === "DELETE") {
              const rest = list.filter((e) => e.id !== parts[1]);
              await save(rest);
              // Frames no remaining entry uses.
              const used = new Set(rest.flatMap((e) => (e.frames ?? []).map((f) => f.hash)));
              for (const name of await readdir(frames).catch(() => [] as string[])) {
                if (HASH.test(name) && !used.has(name)) await rm(path.join(frames, name), { force: true });
              }
              return send(204, "");
            }
          }
          next();
        } catch (e) {
          if (e instanceof TooLarge) return send(413, e.message);
          send(500, String(e));
        }
      });
    },
  };
}
