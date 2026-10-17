// My library (docs/infopanel-import/studio/SPEC.md §3) for server.mjs: the
// user's reusable content (images, videos, fonts, SVG templates, gauges,
// saved panels, style presets, imported canvases), kept apart from any
// profile. Placing an item copies it into a profile, so items only count
// their copies; nothing in a profile points back here.
//
// Each item is one JSON file in DATA_DIR/library, named by its id. Its bytes
// (images, fonts, gauge frames) live in the asset store and are named by
// asset id in `files`, so identical bytes are stored once.
//
// Security rules, as for the asset store: writes need the
// `X-Dashboard-Library: 1` header and JSON, and come from loopback unless
// ALLOW_REMOTE_UPLOAD=1. Ids are made here and checked by ITEM_ID_RE before
// any path is built; nothing else the client sends becomes a path.
//
// Node built-ins only. The pure helpers are exported for the tests.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ID_RE as ASSET_ID_RE, isLoopback } from "./assets.mjs";

export const KINDS = ["image", "video", "font", "svg", "gauge", "panel", "style", "canvas"];
export const ITEM_ID_RE = /^lib_[a-z0-9]{12}$/;

/** The largest item file (an imported canvas holds a whole profile). */
export const MAX_ITEM_BYTES = 8 * 1024 * 1024;
/** The largest `meta` (tags, sizes, colours: what the grid filters and sorts by). */
export const MAX_META_BYTES = 64 * 1024;
/** Larger `data` is left out of the list; GET /api/library/<id> has it. */
export const LIST_DATA_BYTES = 256 * 1024;
const MAX_FILES = 4096;
const MAX_COPIES = 1000;
const MAX_NAME = 200;

const LIBRARY_HEADER = "x-dashboard-library";

/* ---------------- pure helpers ---------------- */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/** A new item id. */
export const newItemId = () => `lib_${crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "0").slice(0, 12)}`;

/** One placed copy: where it went. */
function normalizeCopy(raw) {
  if (!isObject(raw)) return null;
  const profileId = text(raw.profileId, 100);
  if (!profileId) return null;
  return {
    profileId,
    ...(typeof raw.pageId === "string" && { pageId: text(raw.pageId, 100) }),
    ...(typeof raw.zoneId === "string" && { zoneId: text(raw.zoneId, 100) }),
    ...(typeof raw.itemPath === "string" && { itemPath: text(raw.itemPath, 100) }),
    ...(typeof raw.label === "string" && { label: text(raw.label, MAX_NAME) }),
    ...(typeof raw.at === "string" && { at: text(raw.at, 40) }),
  };
}

/**
 * An item from untrusted JSON, merged over `existing` for an update (its id,
 * kind and createdAt stay). Returns `{ item }` or `{ error }`.
 */
export function normalizeItem(raw, existing = null, now = new Date()) {
  if (!isObject(raw)) return { error: "expected an object" };
  const kind = existing ? existing.kind : raw.kind;
  if (!KINDS.includes(kind)) return { error: `kind must be one of ${KINDS.join(", ")}` };
  if (existing && raw.kind !== undefined && raw.kind !== existing.kind) return { error: "kind cannot change" };

  const pick = (key, fallback) => (key in raw ? raw[key] : existing ? existing[key] : fallback);
  const name = text(pick("name", ""), MAX_NAME).trim();
  if (!name) return { error: "name is required" };

  const files = pick("files", []);
  if (!Array.isArray(files) || files.length > MAX_FILES || !files.every((f) => typeof f === "string" && ASSET_ID_RE.test(f))) {
    return { error: "files must be asset ids" };
  }
  const meta = pick("meta", {});
  if (!isObject(meta)) return { error: "meta must be an object" };
  if (JSON.stringify(meta).length > MAX_META_BYTES) return { error: "meta is too large" };
  const copies = pick("copies", []);
  if (!Array.isArray(copies) || copies.length > MAX_COPIES) return { error: "copies must be a list" };

  const data = pick("data", undefined);
  const stamp = now.toISOString();
  const item = {
    id: existing ? existing.id : newItemId(),
    kind,
    name,
    createdAt: existing ? existing.createdAt : stamp,
    updatedAt: stamp,
    files: [...new Set(files)],
    meta,
    copies: copies.map(normalizeCopy).filter(Boolean),
    ...(data !== undefined && { data }),
  };
  if (JSON.stringify(item).length > MAX_ITEM_BYTES) return { error: "item is too large" };
  return { item };
}

/** The item as the list shows it: large `data` left out, with its size. */
export function summaryOf(item) {
  if (item.data === undefined) return item;
  const size = JSON.stringify(item.data).length;
  if (size <= LIST_DATA_BYTES) return item;
  const { data: _data, ...rest } = item;
  return { ...rest, dataSize: size };
}

/* ---------------- storage ---------------- */

/** The items in `dir`, one JSON file each. */
export function createLibraryStore(dir) {
  const fileOf = (id) => (ITEM_ID_RE.test(String(id)) ? path.join(dir, `${id}.json`) : null);

  function read(file) {
    try {
      const item = JSON.parse(fs.readFileSync(file, "utf8"));
      return isObject(item) && ITEM_ID_RE.test(item.id) && KINDS.includes(item.kind) ? item : null;
    } catch {
      return null;
    }
  }

  function write(item) {
    fs.mkdirSync(dir, { recursive: true });
    const file = fileOf(item.id);
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(item));
    fs.renameSync(tmp, file);
  }

  return {
    /** Every item, newest first. */
    list() {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((n) => n.endsWith(".json") && ITEM_ID_RE.test(n.slice(0, -5)))
        .map((n) => read(path.join(dir, n)))
        .filter(Boolean)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    get(id) {
      const file = fileOf(id);
      return file ? read(file) : null;
    },
    create(raw) {
      const r = normalizeItem(raw);
      if (r.item) write(r.item);
      return r;
    },
    update(id, raw) {
      const existing = this.get(id);
      if (!existing) return { missing: true };
      const r = normalizeItem(raw, existing);
      if (r.item) write(r.item);
      return r;
    },
    remove(id) {
      const file = fileOf(id);
      if (!file || !fs.existsSync(file)) return false;
      fs.rmSync(file, { force: true });
      return true;
    },
    /** The raw item files, for the asset store's unused scan. */
    texts() {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((n) => n.endsWith(".json"))
        .map((n) => {
          try {
            return fs.readFileSync(path.join(dir, n), "utf8");
          } catch {
            return "";
          }
        });
    },
  };
}

/* ---------------- request handling ---------------- */

/** The reason a library write is refused, or null (`body`: the write sends JSON). */
export function libraryWriteRefusal(headers, remoteAddress, allowRemote, body = true) {
  const type = String(headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (headers[LIBRARY_HEADER] !== "1") return { status: 403, message: "missing X-Dashboard-Library header" };
  if (!allowRemote && !isLoopback(remoteAddress)) return { status: 403, message: "library changes are accepted from this computer only" };
  if (body && type !== "application/json") return { status: 415, message: "expected application/json" };
  return null;
}

/**
 * The /api/library routes over `store`. `send(res, status, body, type)` is the
 * server's response helper, `readBody(req, limit)` its body reader.
 */
export function createLibrary({ store, send, readBody }) {
  const allowRemote = process.env.ALLOW_REMOTE_UPLOAD === "1";
  const json = (res, status, value) => send(res, status, JSON.stringify(value), "application/json; charset=utf-8");

  async function body(req, res) {
    const refusal = libraryWriteRefusal(req.headers, req.socket.remoteAddress, allowRemote);
    if (refusal) {
      send(res, refusal.status, refusal.message);
      return undefined;
    }
    try {
      return JSON.parse(await readBody(req, MAX_ITEM_BYTES + 1024));
    } catch {
      send(res, 400, "expected a JSON body under 8 MB");
      return undefined;
    }
  }

  return async function handleLibrary(req, res, pathname) {
    if (pathname === "/api/library") {
      if (req.method === "GET") return json(res, 200, store.list().map(summaryOf));
      if (req.method !== "POST") return send(res, 405);
      const raw = await body(req, res);
      if (raw === undefined) return;
      const r = store.create(raw);
      return r.error ? send(res, 400, r.error) : json(res, 201, r.item);
    }
    const id = pathname.slice("/api/library/".length);
    if (!ITEM_ID_RE.test(id)) return send(res, 404);
    if (req.method === "GET") {
      const item = store.get(id);
      return item ? json(res, 200, item) : send(res, 404);
    }
    if (req.method === "PUT") {
      const raw = await body(req, res);
      if (raw === undefined) return;
      const r = store.update(id, raw);
      if (r.missing) return send(res, 404);
      return r.error ? send(res, 400, r.error) : json(res, 200, r.item);
    }
    if (req.method === "DELETE") {
      const refusal = libraryWriteRefusal(req.headers, req.socket.remoteAddress, allowRemote, false);
      if (refusal) return send(res, refusal.status, refusal.message);
      return store.remove(id) ? send(res, 204) : send(res, 404);
    }
    return send(res, 405);
  };
}
