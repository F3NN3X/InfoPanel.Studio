import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type NotesRequest, type NotesResponse, notesHandler, qaNotes } from "@/widgets/widget-qa/notes-dev";

// The dev server's notes writer writes a tracked file from a browser request: it must refuse what is not the page's own edit, and
// never leave the file half written or in a shape the page and notes.test.ts reject. Each test writes a scratch copy, never the repo's.
let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qa-notes-"));
  file = path.join(dir, "notes.json");
  writeFileSync(file, '{\r\n  "CodingAgents": {\r\n    "1x1": "Sparkline."\r\n  }\r\n}\r\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const headers = { "x-qa-notes": "1", "content-type": "application/json", origin: "http://localhost:5173", "sec-fetch-site": "same-origin" };
function request(body: unknown, over: { method?: string; headers?: Record<string, string | undefined> } = {}): NotesRequest {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    method: over.method ?? "POST",
    headers: { ...headers, ...over.headers },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(text);
    },
  };
}
async function send(req: NotesRequest) {
  const res = { statusCode: 0, body: "", headers: {} as Record<string, string> };
  const out: NotesResponse = {
    get statusCode() {
      return res.statusCode;
    },
    set statusCode(v) {
      res.statusCode = v;
    },
    setHeader: (name, value) => (res.headers[name.toLowerCase()] = value),
    end: (body) => (res.body = body ?? ""),
  };
  const written: string[] = [];
  await notesHandler(file, (t) => written.push(t))(req, out);
  return { ...res, written };
}
const onDisk = () => readFileSync(file, "utf8");

describe("the dev server's notes writer", () => {
  it("applies an edit to the file on disk, keeps its line ends, answers what it wrote and leaves no temporary file", async () => {
    const res = await send(request({ module: "CodingAgents", key: "2x1", note: { text: "Beside the count.", status: "fixed" } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    const next = { CodingAgents: { "1x1": "Sparkline.", "2x1": { text: "Beside the count.", status: "fixed" } } };
    expect(JSON.parse(res.body)).toEqual(next);
    expect(onDisk()).toBe(`${JSON.stringify(next, null, 2)}\n`.replace(/\n/g, "\r\n"));
    expect(res.written).toEqual([onDisk()]);
    expect(readdirSync(dir)).toEqual(["notes.json"]);
  });

  it("deletes a note and clears the fixed ones", async () => {
    await send(request({ module: "CodingAgents", key: "2x1", note: { text: "x", status: "fixed" } }));
    expect(JSON.parse((await send(request({ clear: "fixed" }))).body)).toEqual({ CodingAgents: { "1x1": "Sparkline." } });
    expect(JSON.parse((await send(request({ module: "CodingAgents", key: "1x1", note: null }))).body)).toEqual({});
    expect(onDisk()).toBe("{}\r\n");
  });

  it("refuses anything but the page's own POST: no header, another site, not JSON, another method", async () => {
    const before = onDisk();
    const edit = { module: "CodingAgents", key: "2x1", note: "x" };
    const cases: [NotesRequest, number][] = [
      [request(edit, { method: "GET" }), 405],
      [request(edit, { headers: { "x-qa-notes": undefined } }), 403],
      [request(edit, { headers: { origin: "https://evil.example" } }), 403],
      [request(edit, { headers: { origin: "http://localhost.evil.example:5173" } }), 403],
      [request(edit, { headers: { "sec-fetch-site": "cross-site" } }), 403],
      [request(edit, { headers: { "content-type": "text/plain" } }), 415],
      [request("{not json"), 400],
      [request({ module: "CodingAgents", key: "layout:x", note: "x" }), 400],
      [request({ module: "CodingAgents", key: "2x1", note: { text: "x", status: "done" } }), 400],
      [request({ module: "CodingAgents", key: "2x1", note: "x".repeat(70_000) }), 413],
    ];
    for (const [req, status] of cases) expect((await send(req)).statusCode, JSON.stringify(req.headers)).toBe(status);
    expect(onDisk()).toBe(before);
  });

  it("takes a write from a tool on this machine (no Origin) and from 127.0.0.1", async () => {
    expect((await send(request({ module: "A", key: "1x1", note: "x" }, { headers: { origin: undefined, "sec-fetch-site": undefined } }))).statusCode).toBe(200);
    expect((await send(request({ module: "A", key: "1x1", note: "y" }, { headers: { origin: "http://127.0.0.1:5173" } }))).statusCode).toBe(200);
  });

  it("leaves a file it cannot read as a notes file alone", async () => {
    writeFileSync(file, '{ "A": { "1x1": 3 } }');
    const res = await send(request({ module: "A", key: "2x1", note: "x" }));
    expect(res.statusCode).toBe(409);
    expect(onDisk()).toBe('{ "A": { "1x1": 3 } }');
  });

  it("is a dev-server plugin only: a build has no writer", () => {
    const plugin = qaNotes(dir);
    expect(plugin.apply).toBe("serve");
    expect(plugin.name).toBe("qa-notes");
  });
});
