// The canvas store for server.mjs: the stored form of each imported InfoPanel
// canvas (src/lib/infopanel/import/stored.ts), kept out of the config so the
// config stays under its 5 MB cap and its SSE push stays small. A canvas zone
// holds only `canvasRef`, the id of its file here (#44).
//
// Each canvas is one JSON file in DATA_DIR/canvases, named by content: `cnv_`
// plus the first 32 hex digits of the SHA-256 of its bytes. A file never
// changes once written, so an edit is a new file and a new ref, which changes
// the config and so reaches every kiosk through the config event stream;
// zones and profiles that share bytes share the file. There is no delete
// route, because a file can be any number of zones' content; instead `sweep`
// deletes the files the stored config no longer references (an old edit, a
// deleted zone) once they are an hour old, so a canvas saved just before its
// config is never caught in between.
//
// Security rules, as for the library: writes need the `X-Dashboard-Canvas: 1`
// header and JSON, and come from loopback unless ALLOW_REMOTE_UPLOAD=1; reads
// are open to every page, as the config is. Ids are made here and checked by
// CANVAS_ID_RE before any path is built.
//
// Node built-ins only. The pure helpers are exported for the tests.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isLoopback } from "./assets.mjs";

export const CANVAS_ID_RE = /^cnv_[a-f0-9]{32}$/;
export const CANVAS_FORMAT = "infopanel-canvas";
/** `put`'s temporary file: `<id>.json.<uuid>.tmp`. */
const TMP_NAME_RE = /^cnv_[a-f0-9]{32}\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;

/** The largest canvas (as the library's largest item: a whole imported profile). */
export const MAX_CANVAS_BYTES = 8 * 1024 * 1024;
/** How long an unreferenced file is kept: a studio's save of a canvas and of its config never races the sweep. */
export const SWEEP_GRACE_MS = 60 * 60 * 1000;
/** The sweep runs at most this often (at start and after config saves; server.mjs). */
export const SWEEP_EVERY_MS = 10 * 60 * 1000;

const CANVAS_HEADER = "x-dashboard-canvas";

/* ---------------- pure helpers ---------------- */

/** The id of a canvas's bytes. */
export const canvasIdOf = (text) => `cnv_${crypto.createHash("sha256").update(text).digest("hex").slice(0, 32)}`;

/** The reason `text` is not a stored canvas, or null. */
export function canvasRefusal(text) {
  if (Buffer.byteLength(text) > MAX_CANVAS_BYTES) return "canvas is too large";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "expected JSON";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.format !== CANVAS_FORMAT) {
    return `expected a canvas (format "${CANVAS_FORMAT}")`;
  }
  return null;
}

/**
 * The canvas ids a config's text references (any `canvasRef`, wherever it sits), or null
 * when the text is not a config: then nothing may be swept.
 */
export function referencedCanvasIds(configText) {
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    return null;
  }
  if (!config || typeof config !== "object" || !Array.isArray(config.profiles)) return null;
  const ids = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [key, value] of Object.entries(v)) {
      if (key === "canvasRef" && typeof value === "string") ids.add(value);
      else walk(value);
    }
  };
  walk(config);
  return ids;
}

/* ---------------- storage ---------------- */

/** The canvases in `dir`, one JSON file each. */
export function createCanvasStore(dir) {
  const fileOf = (id) => (CANVAS_ID_RE.test(String(id)) ? path.join(dir, `${id}.json`) : null);

  return {
    /** The canvas's JSON text, or null. */
    /** Whether the store has a file for `id`. */
    has(id) {
      const file = fileOf(id);
      return file !== null && fs.existsSync(file);
    },
    get(id) {
      const file = fileOf(id);
      if (!file) return null;
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    /** Store a canvas's JSON text: `{ id }`, the same id for the same bytes, or `{ error }`. */
    put(text) {
      const error = canvasRefusal(text);
      if (error) return { error };
      const id = canvasIdOf(text);
      const file = fileOf(id);
      if (fs.existsSync(file)) {
        // Sent again: young again, so the sweep leaves it until a config can reference it.
        const now = new Date();
        fs.utimesSync(file, now, now);
      } else {
        fs.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(tmp, text);
        fs.renameSync(tmp, file);
      }
      return { id };
    },
    /**
     * Delete the canvas files `configText` does not reference that were last written over
     * `graceMs` ago (a studio saves a canvas, then the config that references it). A text
     * that is not a config deletes nothing. Returns the ids deleted.
     */
    sweep(configText, now = Date.now(), graceMs = SWEEP_GRACE_MS) {
      const keep = referencedCanvasIds(configText);
      if (!keep || !fs.existsSync(dir)) return [];
      const deleted = [];
      for (const name of fs.readdirSync(dir)) {
        // A canvas file, or the temporary file of a write that never finished (`put`).
        const tmp = TMP_NAME_RE.test(name);
        const id = name.slice(0, -5);
        if (!tmp && (!name.endsWith(".json") || !CANVAS_ID_RE.test(id) || keep.has(id))) continue;
        const file = path.join(dir, name);
        try {
          if (now - fs.statSync(file).mtimeMs <= graceMs) continue;
          fs.rmSync(file, { force: true });
          deleted.push(tmp ? name : id);
        } catch {
          // Gone or locked: the next sweep tries again.
        }
      }
      return deleted;
    },
    /** The raw canvas files, for the asset store's unused scan. */
    texts() {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((n) => n.endsWith(".json") && CANVAS_ID_RE.test(n.slice(0, -5)))
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

/** The reason a canvas write is refused, or null. */
export function canvasWriteRefusal(headers, remoteAddress, allowRemote) {
  const type = String(headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (headers[CANVAS_HEADER] !== "1") return { status: 403, message: "missing X-Dashboard-Canvas header" };
  if (!allowRemote && !isLoopback(remoteAddress)) return { status: 403, message: "canvas changes are accepted from this computer only" };
  if (type !== "application/json") return { status: 415, message: "expected application/json" };
  return null;
}

/**
 * The /api/canvases routes over `store`: POST /api/canvases with a canvas → `{ id }`,
 * GET /api/canvases/<id> → the canvas. `send(res, status, body, type)` is the
 * server's response helper, `readBody(req, limit)` its body reader.
 */
export function createCanvases({ store, send, readBody }) {
  const allowRemote = process.env.ALLOW_REMOTE_UPLOAD === "1";
  const JSON_TYPE = "application/json; charset=utf-8";

  return async function handleCanvases(req, res, pathname) {
    if (pathname === "/api/canvases") {
      if (req.method !== "POST") return send(res, 405);
      const refusal = canvasWriteRefusal(req.headers, req.socket.remoteAddress, allowRemote);
      if (refusal) return send(res, refusal.status, refusal.message);
      let text;
      try {
        text = await readBody(req, MAX_CANVAS_BYTES);
      } catch {
        return send(res, 413);
      }
      const r = store.put(text);
      return r.error ? send(res, 400, r.error) : send(res, 200, JSON.stringify({ id: r.id }), JSON_TYPE);
    }
    const id = pathname.slice("/api/canvases/".length);
    if (!CANVAS_ID_RE.test(id)) return send(res, 404);
    if (req.method !== "GET") return send(res, 405);
    const text = store.get(id);
    return text === null ? send(res, 404) : send(res, 200, text, JSON_TYPE);
  };
}
