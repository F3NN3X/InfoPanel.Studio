/**
 * A folder of files named by their SHA-256, for the lab dev server's plugins
 * (the gauge library's frames, the lab asset store). A file is stored only
 * when its bytes hash to its name and sniff as one of the allowed types, and
 * is served with that type, nosniff and a sandbox CSP, so nothing stored runs
 * script if its URL is opened.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { MIME, sniff, type AssetType } from "../../src/lib/infopanel/assets/assets.ts";

export const HASH = /^[0-9a-f]{64}$/;
export const RASTER: ReadonlySet<AssetType> = new Set(["png", "jpeg", "gif", "webp", "bmp", "ico"]);

export class TooLarge extends Error {}

export async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new TooLarge(`over ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export const send = (res: ServerResponse, status: number, text: string) => {
  res.statusCode = status;
  res.end(text);
};

export function hashStore(dir: string, types: ReadonlySet<AssetType>, maxBytes: number) {
  const has = (hash: string) => stat(path.join(dir, hash)).then(() => true, () => false);
  return {
    dir,
    has,
    /** POST: of a JSON list of hashes, the ones not stored. */
    async missing(req: IncomingMessage, res: ServerResponse) {
      let list: unknown;
      try {
        list = JSON.parse((await body(req, 1024 * 1024)).toString("utf8"));
      } catch (e) {
        if (e instanceof TooLarge) throw e;
        return send(res, 400, "not JSON");
      }
      if (!Array.isArray(list) || !list.every((h) => typeof h === "string" && HASH.test(h))) return send(res, 400, "not a list of hashes");
      const out: string[] = [];
      for (const h of new Set(list as string[])) if (!(await has(h))) out.push(h);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
    },
    /** GET serves a stored file; PUT stores one. */
    async file(req: IncomingMessage, res: ServerResponse, hash: string) {
      const file = path.join(dir, hash);
      if (req.method === "GET") {
        if (!(await has(hash))) return send(res, 404, "not stored");
        const data = await readFile(file);
        const { type } = sniff(new Uint8Array(data));
        if (!types.has(type)) return send(res, 415, "not an allowed file");
        res.setHeader("Content-Type", MIME[type]);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        res.setHeader("Cache-Control", "no-store");
        return res.end(data);
      }
      if (req.method === "PUT") {
        const data = await body(req, maxBytes);
        if (createHash("sha256").update(data).digest("hex") !== hash) return send(res, 400, "the body does not match its hash");
        if (!types.has(sniff(new Uint8Array(data)).type)) return send(res, 415, `only ${[...types].join(", ")} files`);
        await mkdir(dir, { recursive: true });
        await writeFile(file, data);
        return send(res, 204, "");
      }
      send(res, 405, "GET or PUT");
    },
  };
}
