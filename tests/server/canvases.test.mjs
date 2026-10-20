import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANVAS_ID_RE, MAX_CANVAS_BYTES, canvasIdOf, canvasRefusal, canvasWriteRefusal, createCanvasStore, createCanvases, referencedCanvasIds } from "../../server/canvases.mjs";

const canvas = (name, extra = {}) => JSON.stringify({ format: "infopanel-canvas", version: 1, source: { name }, items: [], ...extra });

const withStore = async (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canvases-"));
  try {
    return await fn(createCanvasStore(path.join(dir, "canvases")), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("canvasRefusal", () => {
  it("takes a stored canvas and refuses anything else", () => {
    expect(canvasRefusal(canvas("ARCv2"))).toBeNull();
    expect(canvasRefusal("{broken")).toMatch(/JSON/);
    expect(canvasRefusal("[]")).toMatch(/canvas/);
    expect(canvasRefusal(JSON.stringify({ format: "other" }))).toMatch(/canvas/);
    expect(canvasRefusal(canvas("big", { pad: "x".repeat(MAX_CANVAS_BYTES) }))).toMatch(/too large/);
  });
});

describe("createCanvasStore", () => {
  it("stores a canvas by its content and reads it back", () =>
    withStore((store, dir) => {
      const text = canvas("ARCv2");
      const { id } = store.put(text);
      expect(id).toMatch(CANVAS_ID_RE);
      expect(id).toBe(canvasIdOf(text));
      expect(store.get(id)).toBe(text);
      expect(fs.readdirSync(path.join(dir, "canvases"))).toEqual([`${id}.json`]);
      expect(store.texts()).toEqual([text]);
    }));

  it("gives the same bytes the same file and an edit a new one", () =>
    withStore((store, dir) => {
      const a = store.put(canvas("A")).id;
      expect(store.put(canvas("A")).id).toBe(a);
      const b = store.put(canvas("B")).id;
      expect(b).not.toBe(a);
      expect(fs.readdirSync(path.join(dir, "canvases")).sort()).toEqual([`${a}.json`, `${b}.json`].sort());
    }));

  it("refuses what is not a canvas and ids that could be paths", () =>
    withStore((store, dir) => {
      expect(store.put("{}").error).toMatch(/canvas/);
      fs.writeFileSync(path.join(dir, "config.json"), "{}");
      expect(store.get("../config")).toBeNull();
      expect(store.get("cnv_../../config")).toBeNull();
      expect(store.get("cnv_0123456789abcdef0123456789abcdef")).toBeNull();
      expect(store.texts()).toEqual([]);
    }));
});

describe("referencedCanvasIds", () => {
  it("finds every canvasRef, legacy placements included, and nothing in a text that is not a config", () => {
    const config = { profiles: [{ pages: [{ placements: [{ canvasRef: "cnv_a" }, { module: "Clock" }] }] }, { placements: [{ canvasRef: "cnv_b" }] }] };
    expect([...referencedCanvasIds(JSON.stringify(config))].sort()).toEqual(["cnv_a", "cnv_b"]);
    expect(referencedCanvasIds("{broken")).toBeNull();
    expect(referencedCanvasIds("{}")).toBeNull();
    expect(referencedCanvasIds("[]")).toBeNull();
  });
});

describe("sweep", () => {
  const HOUR = 60 * 60 * 1000;
  const age = (dir, id, ms) => {
    const t = new Date(Date.now() - ms);
    fs.utimesSync(path.join(dir, "canvases", `${id}.json`), t, t);
  };
  const configOf = (...refs) => JSON.stringify({ profiles: [{ pages: [{ placements: refs.map((canvasRef) => ({ canvasRef })) }] }] });

  it("deletes only unreferenced files past the grace period", () =>
    withStore((store, dir) => {
      const kept = store.put(canvas("referenced")).id;
      const young = store.put(canvas("young")).id;
      const old = store.put(canvas("old")).id;
      age(dir, kept, 48 * HOUR);
      age(dir, young, HOUR / 2);
      age(dir, old, 2 * HOUR);
      expect(store.sweep(configOf(kept))).toEqual([old]);
      expect(store.get(kept)).not.toBeNull();
      expect(store.get(young)).not.toBeNull();
      expect(store.get(old)).toBeNull();
    }));

  it("deletes nothing when the config is not readable", () =>
    withStore((store, dir) => {
      const id = store.put(canvas("x")).id;
      age(dir, id, 48 * HOUR);
      expect(store.sweep("{broken")).toEqual([]);
      expect(store.sweep("{}")).toEqual([]);
      expect(store.get(id)).not.toBeNull();
    }));

  it("never touches files that are not canvas ids", () =>
    withStore((store, dir) => {
      store.put(canvas("x"));
      const others = ["notes.json", "cnv_short.json", `cnv_${"a".repeat(32)}.json.1234.tmp`];
      for (const name of others) fs.writeFileSync(path.join(dir, "canvases", name), "{}");
      expect(store.sweep(configOf(), Date.now() + 48 * HOUR)).toHaveLength(1);
      expect(fs.readdirSync(path.join(dir, "canvases")).sort()).toEqual(others.sort());
    }));

  it("deletes a write's leftover temporary file once it is past the grace period", () =>
    withStore((store, dir) => {
      store.put(canvas("x"));
      const id = `cnv_${"b".repeat(32)}`;
      const leftover = (uuid, ms) => {
        const file = path.join(dir, "canvases", `${id}.json.${uuid}.tmp`);
        fs.writeFileSync(file, "{");
        const t = new Date(Date.now() - ms);
        fs.utimesSync(file, t, t);
        return path.basename(file);
      };
      const old = leftover("0f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b", 2 * HOUR);
      const young = leftover("1f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b", HOUR / 2);
      const kept = store.texts().length;
      expect(store.sweep(configOf(...[canvasIdOf(canvas("x"))]))).toEqual([old]);
      expect(fs.readdirSync(path.join(dir, "canvases"))).toContain(young);
      expect(store.texts()).toHaveLength(kept);
    }));

  it("makes a file sent again young again", () =>
    withStore((store, dir) => {
      const id = store.put(canvas("again")).id;
      age(dir, id, 2 * HOUR);
      store.put(canvas("again"));
      expect(store.sweep(configOf())).toEqual([]);
    }));
});

describe("canvasWriteRefusal", () => {
  const ok = { "x-dashboard-canvas": "1", "content-type": "application/json" };
  it("needs the header, JSON and this computer", () => {
    expect(canvasWriteRefusal(ok, "127.0.0.1", false)).toBeNull();
    expect(canvasWriteRefusal({ ...ok, "x-dashboard-canvas": undefined }, "127.0.0.1", false)?.status).toBe(403);
    expect(canvasWriteRefusal({ ...ok, "content-type": "text/plain" }, "::1", false)?.status).toBe(415);
    expect(canvasWriteRefusal(ok, "192.168.1.5", false)?.status).toBe(403);
    expect(canvasWriteRefusal(ok, "192.168.1.5", true)).toBeNull();
  });
});

describe("createCanvases", () => {
  // A request and a response stand-in for the handler; `send` records what it answered.
  const call = async (store, { method, pathname, headers = {}, remote = "127.0.0.1", body = "" }) => {
    const answer = {};
    const send = (_res, status, text = "") => Object.assign(answer, { status, text: String(text) });
    const readBody = async (_req, limit) => {
      if (Buffer.byteLength(body) > limit) throw new Error("body too large");
      return body;
    };
    const handle = createCanvases({ store, send, readBody });
    await handle({ method, headers, socket: { remoteAddress: remote } }, {}, pathname);
    return answer;
  };
  const writeHeaders = { "x-dashboard-canvas": "1", "content-type": "application/json" };

  it("saves from this computer and serves the canvas to a kiosk on another one", () =>
    withStore(async (store) => {
      const text = canvas("ARCv2");
      const saved = await call(store, { method: "POST", pathname: "/api/canvases", headers: writeHeaders, body: text });
      expect(saved.status).toBe(200);
      const { id } = JSON.parse(saved.text);
      const read = await call(store, { method: "GET", pathname: `/api/canvases/${id}`, remote: "192.168.1.20" });
      expect(read).toEqual({ status: 200, text });
    }));

  it("refuses writes from another computer, without the header, too large or to an id", () =>
    withStore(async (store) => {
      const post = (extra) => call(store, { method: "POST", pathname: "/api/canvases", headers: writeHeaders, body: canvas("x"), ...extra });
      expect((await post({ remote: "192.168.1.20" })).status).toBe(403);
      expect((await post({ headers: { "content-type": "application/json" } })).status).toBe(403);
      expect((await post({ body: canvas("big", { pad: "x".repeat(MAX_CANVAS_BYTES) }) })).status).toBe(413);
      expect((await post({ body: "{}" })).status).toBe(400);
      expect((await call(store, { method: "GET", pathname: "/api/canvases" })).status).toBe(405);
      const id = canvasIdOf(canvas("x"));
      expect((await call(store, { method: "PUT", pathname: `/api/canvases/${id}`, headers: writeHeaders })).status).toBe(405);
      expect((await call(store, { method: "DELETE", pathname: `/api/canvases/${id}`, headers: writeHeaders })).status).toBe(405);
      expect((await call(store, { method: "GET", pathname: "/api/canvases/..%2Fconfig" })).status).toBe(404);
      expect(store.texts()).toEqual([]);
    }));
});
