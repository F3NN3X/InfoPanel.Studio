// A user pack's CSS (L94) in the loader and the importer: the loader wears CSS only with the server's word for its signature and the
// grammar's pass, and the importer stores CSS only after the render check, with the hash of what was checked. A fake `fetch` plays the server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharedPack } from "@/looks/pack-load";
import type { PackFile, PackSource } from "@/looks/pack-validate";
import { checkImport, packContentHash, storePack, type PickedFile } from "@/looks/user-pack-import";
import { forgetUserPack, registerUserPacks } from "@/looks/user-packs";
import { readPackDir } from "../../tools/validate-pack.mjs";

const render = vi.hoisted(() => ({ refusals: [] as string[], calls: 0 }));
vi.mock("@/looks/pack-render-check", () => ({
  runRenderCheck: async () => {
    render.calls++;
    return render.refusals;
  },
}));

// biome-ignore lint/suspicious/noExplicitAny: fixtures edit parsed JSON of any shape.
type Json = any;
const enc = (s: string) => new TextEncoder().encode(s);
const CSS = '[data-part="num"] { color: #111; }';

/** Field Kit's folder as the user's pack `mine`. */
function folder(css?: string): PickedFile[] {
  const src = readPackDir("src/looks/packs/field-kit", /\.tsx?$/);
  const files = new Map<string, Uint8Array>(src.files.filter((f: Json) => f.path !== "pack.css").map((f: Json) => [f.path, f.bytes]));
  const pack = structuredClone(src.pack) as Json;
  const look = structuredClone(src.look) as Json;
  pack.id = look.id = "mine";
  pack.fonts = pack.fonts.map((f: Json) => ({ ...f, family: f.family.replace("pack-", "pack-mine-") }));
  for (const k of Object.keys(look.fonts)) look.fonts[k] = look.fonts[k].replace("pack-", "pack-mine-");
  pack.assets = [...files].filter(([p]) => p.startsWith("assets/")).map(([p, b]) => ({ file: p.slice(7), bytes: b.length }));
  files.set("pack.json", enc(JSON.stringify(pack)));
  files.set("look.json", enc(JSON.stringify(look)));
  if (css !== undefined) files.set("pack.css", enc(css));
  return [...files].map(([path, bytes]) => ({ path, bytes }));
}

/** The route: every file of `files`, `pack.json` saying the pack has a stylesheet, which `css` answers for. */
function route(files: PickedFile[], css: () => Response) {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url === "/api/packs/mine/pack.css") return css();
    const file = files.find((f) => `/api/packs/mine/${f.path}` === url);
    return file ? new Response(file.bytes as BodyInit, { headers: packHeader(file) }) : new Response("", { status: 404 });
  });
}
const packHeader = (file: PickedFile): Record<string, string> => (file.path === "pack.json" ? { "X-Pack-Css": "1" } : {});
const vouched = (body: BodyInit = CSS) => new Response(body, { headers: { "X-Pack-Signature": "valid" } });

beforeEach(() => {
  render.refusals = [];
  render.calls = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  forgetUserPack("mine");
});

describe("the hash", () => {
  it("is the server's: the same files give the value pack_sign.rs pins", async () => {
    const files = [{ path: "pack.json", bytes: enc("{}") }, { path: "assets/a.png", bytes: enc("x") }];
    expect(await packContentHash(files)).toBe("6bf20373c9c6dd6202c89936450c5ab12020a31223376672cbfbff2a9647227d");
    expect(await packContentHash([...files].reverse())).toBe(await packContentHash(files));
  });
});

describe("the loader", () => {
  it("wears signed CSS: inside the pack's stylesheet, after the loader's own font rules", async () => {
    route(folder(), () => vouched());
    expect(await registerUserPacks(["mine"])).toEqual(["mine"]);
    const pack = await sharedPack("mine");
    expect(pack?.css).toContain("font-family");
    expect(pack?.css?.endsWith(CSS)).toBe(true);
  });

  it("a pack with no CSS needs no signature, makes no request for one and carries only the font rules", async () => {
    const files = folder();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const file = files.find((f) => `/api/packs/mine/${f.path}` === url);
      return file ? new Response(file.bytes as BodyInit) : new Response("", { status: 404 });
    });
    expect(await registerUserPacks(["mine"])).toEqual(["mine"]);
    expect(asked).not.toContain("/api/packs/mine/pack.css");
    expect((await sharedPack("mine"))?.css).not.toContain("color");
  });

  it.each([
    ["a 200 with no word for its signature", () => new Response(CSS)],
    ["a word that is not the server's", () => new Response(CSS, { headers: { "X-Pack-Signature": "yes" } })],
    ["a refusal", () => new Response("", { status: 403 })],
    ["a stylesheet gone since pack.json was read", () => new Response("", { status: 404 })],
    ["a server error", () => new Response("", { status: 500 })],
    ["an empty file", () => vouched("")],
  ])("refuses the pack on %s", async (_name, css) => {
    route(folder(), css);
    expect(await registerUserPacks(["mine"])).toEqual([]);
  });

  it("refuses the pack when the stylesheet cannot be asked for: no answer is not no CSS", async () => {
    const files = folder();
    route(files, () => {
      throw new Error("offline");
    });
    expect(await registerUserPacks(["mine"])).toEqual([]);
  });

  it("the grammar runs again on signed CSS: the signature does not stand in for it", async () => {
    route(folder(), () => vouched("* { color: #111; }"));
    expect(await registerUserPacks(["mine"])).toEqual([]);
  });

  it("bytes that are not UTF-8 are refused, not read with a replacement character", async () => {
    route(folder(), () => vouched(new Uint8Array([0xff, 0xfe, 0x7b]) as BodyInit));
    expect(await registerUserPacks(["mine"])).toEqual([]);
  });

});

describe("the importer", () => {
  /** The server's side of an import: what was asked, and how each write answers. */
  function server(sign: () => Response = () => new Response("{}"), files = folder(CSS)) {
    const log: { method: string; url: string; body?: Json }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      log.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/sign")) return sign();
      if (init?.method === "POST") return new Response("{}");
      if (url.endsWith("/pack.css")) return vouched();
      const file = files.find((f) => `/api/packs/mine/${f.path}` === url);
      return file ? new Response(file.bytes as BodyInit, { headers: packHeader(file) }) : new Response("", { status: 404 });
    });
    return log;
  }
  const report = () => checkImport(folder(CSS)) as ReturnType<typeof checkImport> & { src: PackSource };

  it("reads a pack.css into the source, and the validator passes one inside the grammar", () => {
    const checked = report();
    expect(checked.ok).toBe(true);
    expect(checked.src.css).toBe(CSS);
  });

  it("a refused render check stores nothing", async () => {
    const log = server();
    render.refusals = ["a text is hidden"];
    expect(await storePack(report())).toContain("a text is hidden");
    expect(render.calls).toBe(1);
    expect(log.filter((l) => l.method !== "GET")).toEqual([]);
  });

  it("a pack with no CSS has no render check and no signature", async () => {
    const log = server(undefined, folder());
    expect(await storePack(checkImport(folder()))).toBeUndefined();
    expect(render.calls).toBe(0);
    expect(log.filter((l) => l.method === "POST").map((l) => l.url)).toEqual(["/api/packs"]);
  });

  it("after the check: the files go first with no CSS among them, then the CSS with the hash of everything that was checked", async () => {
    const log = server();
    const checked = report();
    expect(await storePack(checked)).toBeUndefined();
    const [store, sign] = log.filter((l) => l.method === "POST");
    expect(store.url).toBe("/api/packs");
    expect(store.body.files.map((f: { path: string }) => f.path)).not.toContain("pack.css");
    expect(sign.url).toBe("/api/packs/mine/sign");
    expect(atob(sign.body.css)).toBe(CSS);
    expect(sign.body.hash).toBe(await packContentHash(checked.src.files as (PackFile & { bytes: Uint8Array })[]));
    // the CSS still to come, by size and SHA-256: a publisher's signature covers it, so the server checks it at the import
    const bytes = new TextEncoder().encode(CSS);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(store.body.css).toEqual({ size: bytes.length, sha256 });
  });

  it("a signature the server will not give takes the pack off again, and says so", async () => {
    const log = server(() => new Response("the stored pack is not the pack that was checked", { status: 409 }));
    expect(await storePack(report())).toContain("not the pack that was checked");
    expect(log.some((l) => l.method === "DELETE")).toBe(true);
  });

  it("a hash that cannot be made (no secure context) takes the pack off again", async () => {
    const log = server();
    vi.stubGlobal("crypto", {});
    expect(await storePack(report())).toBeTruthy();
    expect(log.some((l) => l.method === "DELETE")).toBe(true);
  });
});
