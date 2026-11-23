// The public walkthrough (docs/building-an-advanced-theme-pack.md) shows what a pack may say, so what it shows must be accepted: each
// JSON snippet, merged into Cyberspec read as a user's own pack (the doc's `my-cyberspec`), and each CSS snippet pass the validator, and
// its script snippet passes the pack checker's static analysis. A fenced block names what it is after its language (`json pack.json`,
// `json look.json`, `css user`, `css built-in`, `js fx.js`); a block with a language and no known name fails, so none goes unchecked.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type PackFile, type PackSource, validatePack } from "@/looks/pack-validate";
import { analyseScript } from "../../tools/packs/themely-check.mjs";
import { readPackDir } from "../../tools/validate-pack.mjs";

// biome-ignore lint/suspicious/noExplicitAny: the snippets are JSON of any shape.
type Json = any;
const DOC = readFileSync("docs/building-an-advanced-theme-pack.md", "utf8");
const BLOCKS = [...DOC.matchAll(/^```(\w+)([^\n]*)\n([\s\S]*?)^```$/gm)].map(([, lang, tag, body]) => ({ kind: `${lang} ${tag.trim()}`, body }));
const of = (kind: string) => BLOCKS.filter((b) => b.kind === kind).map((b) => b.body);
const KINDS = ["json pack.json", "json look.json", "css user", "css built-in", "js fx.js"];

const CYBERSPEC = readPackDir("src/looks/packs/cyberspec", /\.tsx?$/) as PackSource;
const enc = (s: string) => new TextEncoder().encode(s);
const asFile = (path: string, text: string): PackFile => ({ path, size: enc(text).length, bytes: enc(text) });
const errors = (src: PackSource, source: "user" | "builtin" = "user") => validatePack(src, { source }).filter((i) => i.severity === "error");

/** Cyberspec as the doc's own pack: its id and font families its own, its assets listed, and no CSS but the snippet's (a built-in's CSS is not held to the user grammar). */
function mine(edit: { pack?: Json; look?: Json; css?: string } = {}): PackSource {
  const rename = (family: string) => family.replace("pack-cyberspec", "pack-myspec");
  const pack: Json = { ...structuredClone(CYBERSPEC.pack as Json), id: "my-cyberspec" };
  pack.fonts = pack.fonts.map((f: Json) => ({ ...f, family: rename(f.family) }));
  const look: Json = { ...structuredClone(CYBERSPEC.look as Json), id: "my-cyberspec" };
  look.fonts = Object.fromEntries(Object.entries(look.fonts).map(([k, v]) => [k, rename(v as string)]));
  const files = CYBERSPEC.files.filter((f) => f.path !== "pack.css");
  pack.assets = files.filter((f) => f.path.startsWith("assets/")).map((f) => ({ file: f.path.slice(7), bytes: f.size }));
  return { ...CYBERSPEC, pack: merge(pack, edit.pack), look: merge(look, edit.look), css: edit.css, files: edit.css === undefined ? files : [...files, asFile("pack.css", edit.css)] };
}

/** A snippet over the file: its keys replace the file's, an object one level deep (a snippet of `t3` keeps the Look's other T3 names). */
function merge(base: Json, over: Json = {}): Json {
  const plain = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  return { ...base, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, plain(v) && plain(base[k]) ? { ...base[k], ...(v as object) } : v])) };
}

describe("the walkthrough's snippets", () => {
  it("each name what they are, and there are some of each", () => {
    expect(BLOCKS.filter((b) => !KINDS.includes(b.kind)).map((b) => b.kind)).toEqual([]);
    for (const kind of KINDS) expect(of(kind).length, kind).toBeGreaterThan(0);
  });

  it("the base it merges them into is a pack the validator accepts", () => {
    expect(errors(mine())).toEqual([]);
  });

  it.each(of("json pack.json").map((body, i) => [i + 1, body]))("pack.json snippet %i passes", (_, body) => {
    expect(errors(mine({ pack: JSON.parse(body as string) }))).toEqual([]);
  });

  it.each(of("json look.json").map((body, i) => [i + 1, body]))("look.json snippet %i passes", (_, body) => {
    expect(errors(mine({ look: JSON.parse(body as string) }))).toEqual([]);
  });

  it.each(of("css user").map((body, i) => [i + 1, body]))("user pack.css snippet %i passes the user grammar", (_, body) => {
    expect(errors(mine({ css: body as string }))).toEqual([]);
  });

  it.each(of("css built-in").map((body, i) => [i + 1, body]))("built-in pack.css snippet %i passes as Cyberspec's", (_, body) => {
    const css = body as string;
    const files = [...CYBERSPEC.files.filter((f) => f.path !== "pack.css"), asFile("pack.css", css)];
    expect(errors({ ...CYBERSPEC, css, files }, "builtin")).toEqual([]);
  });

  it("the script snippet passes the checker's static analysis", async () => {
    for (const body of of("js fx.js")) expect((await analyseScript(body)).issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
