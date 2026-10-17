import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFont, buildZip } from "./__fixtures__/builders.ts";
import { listFaces, neededBy, proxiedFetch } from "./font-get.ts";
import type { Fetch, FontCandidate } from "./font-sources.ts";

const candidate = (source: FontCandidate["source"], id: string, family: string): FontCandidate => ({ source, id, family, license: "OFL-1.1", open: true, match: "exact", page: "" });
const req = (font: string, style = "", bold = false, italic = false) => ({ font, style, bold, italic });

const info = {
  id: "orbitron",
  defSubset: "latin",
  variants: {
    "400": { normal: { latin: { url: { ttf: "https://cdn.jsdelivr.net/o-400.ttf" } } }, italic: { latin: { url: { ttf: "https://cdn.jsdelivr.net/o-400i.ttf" } } } },
    "700": { normal: { latin: { url: { ttf: "https://cdn.jsdelivr.net/o-700.ttf" } } } },
  },
};

describe("listFaces", () => {
  it("lists a Fontsource family's weights and styles, loading a face on demand", async () => {
    const fetched: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      fetched.push(url);
      return url.endsWith("/orbitron") ? new Response(JSON.stringify(info)) : new Response(new Uint8Array([1, 2, 3]));
    };
    const faces = await listFaces(candidate("google", "orbitron", "Orbitron"), fetchImpl);
    expect(faces.map((f) => [f.style, f.weight, f.italic, f.file])).toEqual([
      ["Regular", 400, false, "orbitron-400-normal.ttf"],
      ["Italic", 400, true, "orbitron-400-italic.ttf"],
      ["Bold", 700, false, "orbitron-700-normal.ttf"],
    ]);
    expect(fetched).toHaveLength(1);
    expect([...(await faces[2].load())]).toEqual([1, 2, 3]);
    expect(fetched[1]).toBe("https://cdn.jsdelivr.net/o-700.ttf");
  });

  it("reads Font Squirrel's zip for its faces", async () => {
    const zip = await buildZip([
      { name: "Rajdhani-Bold.ttf", data: buildFont({ 1: "Rajdhani", 2: "Bold" }, { weight: 700 }), method: 0 },
      { name: "license.txt", text: "OFL", method: 0 },
    ]);
    const fetchImpl: Fetch = async () => new Response(zip);
    const faces = await listFaces(candidate("fontsquirrel", "rajdhani", "Rajdhani"), fetchImpl);
    expect(faces.map((f) => [f.style, f.weight, f.file])).toEqual([["Bold", 700, "Rajdhani-Bold.ttf"]]);
  });
});

describe("neededBy", () => {
  const faces = ["400-normal", "400-italic", "700-normal"].map((id) => {
    const [w, s] = id.split("-");
    return { id, style: id, weight: Number(w), italic: s === "italic", file: id, load: async () => new Uint8Array() };
  });

  it("counts the items each face serves, as InfoPanel would match them", () => {
    const needed = neededBy("Orbitron", faces, [
      { request: req("Orbitron"), items: 3 },
      { request: req("Orbitron", "", true), items: 14 },
      { request: req("Barlow"), items: 9 },
    ]);
    expect([...needed]).toEqual([
      ["400-normal", 3],
      ["700-normal", 14],
    ]);
  });
});

describe("proxiedFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends Font Squirrel through the server's proxy and the other hosts direct", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (seen.push(url), new Response("")));
    await proxiedFetch("https://www.fontsquirrel.com/api/fontlist/all");
    await proxiedFetch("https://api.fontsource.org/v1/fonts");
    expect(seen).toEqual(["/api/font-proxy?url=https%3A%2F%2Fwww.fontsquirrel.com%2Fapi%2Ffontlist%2Fall", "https://api.fontsource.org/v1/fonts"]);
  });
});
