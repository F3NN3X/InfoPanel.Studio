import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { applyNoteEdit, editProblem, NOTES_ENDPOINT, NOTES_HEADER, NOTES_PATH, notesJson, notesProblems, type NoteEdit, type NotesFile } from "./notes-file.ts";

/**
 * The dev server's notes writer: the Widget QA inspector saves a note through it (`notes.ts`, `writeNote`). Node only, loaded by
 * vite.config.ts and never by the app: `apply: "serve"`, so a build (the kiosk, the studio, the app's debug server) has no writer and
 * the inspector copies the note's JSON instead. It writes `notes.json` in this repo and no other file.
 */

/** A page on this machine: what may send a write (with no Origin, a tool on this machine). */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY = 64 * 1024;

export interface NotesRequest extends AsyncIterable<Buffer | string> {
  method?: string;
  headers: IncomingHttpHeaders;
}
export interface NotesResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

const send = (res: NotesResponse, status: number, body: string, type = "text/plain; charset=utf-8") => {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
};

async function bodyOf(req: NotesRequest): Promise<string | undefined> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += b.length;
    if (size > MAX_BODY) return undefined;
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Why a request may not write; allowed: `undefined`. A POST with the header, from a page on this machine (or no page), as JSON. */
function refused(req: NotesRequest): [number, string] | undefined {
  if (req.method !== "POST") return [405, "notes: POST an edit"];
  if (req.headers[NOTES_HEADER.toLowerCase()] !== "1") return [403, `notes: a write carries ${NOTES_HEADER}: 1`];
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN.test(origin)) return [403, `notes: ${origin} is not a page on this machine`];
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return [403, "notes: a cross-site write"];
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return [415, "notes: send application/json"];
  return undefined;
}

/**
 * Handles one write to `file`: checks the request and the edit, applies it to the file as it is on disk, checks the result's shape,
 * and writes it whole (a temporary file renamed over it), keeping the file's line ends. Answers the file it wrote, as JSON.
 */
export function notesHandler(file: string, onWrite: (text: string) => void = () => {}) {
  return async (req: NotesRequest, res: NotesResponse): Promise<void> => {
    const no = refused(req);
    if (no) return send(res, ...no);
    const body = await bodyOf(req);
    if (body === undefined) return send(res, 413, "notes: the edit is too large");
    let edit: unknown;
    try {
      edit = JSON.parse(body);
    } catch {
      return send(res, 400, "notes: the edit is not JSON");
    }
    const problem = editProblem(edit);
    if (problem) return send(res, 400, `notes: ${problem}`);
    let before: string;
    let current: NotesFile;
    try {
      before = readFileSync(file, "utf8");
      current = JSON.parse(before) as NotesFile;
    } catch (e) {
      return send(res, 500, `notes: ${path.basename(file)} could not be read: ${(e as Error).message}`);
    }
    const broken = notesProblems(current);
    if (broken.length) return send(res, 409, `notes: ${path.basename(file)} is not a notes file now (${broken[0]}); fix it by hand first`);
    const next = applyNoteEdit(current, edit as NoteEdit);
    const after = notesProblems(next);
    if (after.length) return send(res, 400, `notes: ${after[0]}`);
    const text = notesJson(next, before.includes("\r\n") ? "\r\n" : "\n");
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    onWrite(text);
    send(res, 200, JSON.stringify(next), "application/json; charset=utf-8");
  };
}

/**
 * The Vite plugin: the writer at `/__qa/notes` on the dev server only. A file it wrote itself sends no hot update (the page took the
 * new notes from the answer, and an update would re-run the page's modules); one edited by hand or by an agent updates the page in
 * place, as before.
 */
export function qaNotes(root: string): Plugin {
  const file = path.resolve(root, NOTES_PATH);
  let wrote = "";
  return {
    name: "qa-notes",
    apply: "serve",
    configureServer(server) {
      const handle = notesHandler(file, (text) => (wrote = text));
      server.middlewares.use(NOTES_ENDPOINT, (req, res) => void handle(req, res).catch((e: Error) => send(res, 500, `notes: ${e.message}`)));
    },
    async handleHotUpdate(ctx) {
      if (path.resolve(ctx.file) !== file) return;
      if ((await ctx.read()) === wrote) return [];
    },
  };
}
