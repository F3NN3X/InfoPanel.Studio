import { describe, expect, it } from "vitest";
import { buildFont, buildZip } from "./__fixtures__/builders.ts";
import { downloadFamily, fetchCatalogs, findCandidates, searchName, type Catalogs, type Fetch, type FontCandidate } from "./font-sources.ts";

const catalogs: Catalogs = {
  fontsource: [
    { id: "nunito-sans", family: "Nunito Sans", license: "OFL-1.1", type: "google", weights: [400, 700], styles: ["normal"], defSubset: "latin" },
    { id: "nunito", family: "Nunito", license: "OFL-1.1", type: "google", weights: [400], styles: ["normal"], defSubset: "latin" },
    { id: "orbitron", family: "Orbitron", license: "OFL-1.1", type: "google", weights: [400], styles: ["normal"], defSubset: "latin" },
    { id: "adwaita-mono", family: "Adwaita Mono", license: "OFL-1.1", type: "other", weights: [400], styles: ["normal"], defSubset: "latin" },
    { id: "odd", family: "Odd Sans", license: "Proprietary", type: "other", weights: [400], styles: ["normal"], defSubset: "latin" },
  ],
  fontsquirrel: [{ family_name: "Orbitron", family_urlname: "Orbitron" }],
  unavailable: [],
};

describe("searchName", () => {
  it("drops style words and a trailing ' - ' part", () => {
    expect(searchName("Spotify Mix Extrabold")).toBe("Spotify Mix");
    expect(searchName("Roboto Condensed Light Italic")).toBe("Roboto");
    expect(searchName("ANIME VISION - MB_EN REGULAR")).toBe("ANIME VISION");
  });
});

describe("findCandidates", () => {
  it("ranks exact before partial and Google before others, one per family", () => {
    expect(findCandidates("nunito sans", catalogs).map((c) => [c.family, c.match, c.source])).toEqual([
      ["Nunito Sans", "exact", "google"],
      ["Nunito", "partial", "google"],
    ]);
    expect(findCandidates("Orbitron", catalogs).map((c) => c.source)).toEqual(["google"]);
  });

  it("matches a family named with its style", () => {
    expect(findCandidates("Adwaita Mono Bold", catalogs)[0]).toMatchObject({ family: "Adwaita Mono", match: "base", source: "fontsource" });
  });

  it("filters by source before de-duplicating", () => {
    expect(findCandidates("Orbitron", catalogs, ["fontsquirrel"])).toMatchObject([{ source: "fontsquirrel", open: false }]);
  });

  it("flags licenses outside the open set", () => {
    expect(findCandidates("Odd Sans", catalogs)[0]).toMatchObject({ open: false, license: "Proprietary" });
    expect(findCandidates("Spotify Mix", catalogs)).toEqual([]);
  });
});

/** A fetch that serves fixed bodies by URL and records what was asked. */
function mockFetch(routes: Record<string, BodyInit | (() => Response)>): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const body = routes[url];
    if (body === undefined) return new Response("not found", { status: 404 });
    return typeof body === "function" ? body() : new Response(body);
  };
  return Object.assign(f, { calls });
}

const candidate = (c: Partial<FontCandidate>): FontCandidate => ({
  source: "google",
  id: "x",
  family: "X",
  license: "OFL-1.1",
  open: true,
  match: "exact",
  page: "",
  ...c,
});
const fontBytes = buildFont({ 1: "Nunito Sans", 2: "Regular", 4: "Nunito Sans Regular" });

describe("fetchCatalogs", () => {
  it("reports a throttled source instead of failing", async () => {
    const f = mockFetch({
      "https://api.fontsource.org/v1/fonts": JSON.stringify(catalogs.fontsource),
      "https://www.fontsquirrel.com/api/fontlist/all": () => new Response("", { status: 202 }),
    });
    const c = await fetchCatalogs(f);
    expect(c.fontsource).toHaveLength(5);
    expect(c.fontsquirrel).toEqual([]);
    expect(c.unavailable).toEqual(["www.fontsquirrel.com: sent no data (throttled; try again later)"]);
  });
});

describe("downloadFamily", () => {
  it("downloads a Google family from its manifest, with the license", async () => {
    const manifest = {
      manifest: {
        files: [{ filename: "OFL.txt", contents: "SIL Open Font License" }, { filename: "README.txt", contents: "x" }],
        fileRefs: [{ filename: "NunitoSans-VariableFont_wght.ttf", url: "https://fonts.gstatic.com/s/n.ttf" }],
      },
    };
    const f = mockFetch({
      "https://fonts.google.com/download/list?family=Nunito%20Sans": ")]}'\n" + JSON.stringify(manifest),
      "https://fonts.gstatic.com/s/n.ttf": fontBytes,
    });
    const files = await downloadFamily(candidate({ family: "Nunito Sans" }), f);
    expect(files.map((x) => [x.name, x.kind])).toEqual([
      ["NunitoSans-VariableFont_wght.ttf", "font"],
      ["OFL.txt", "license"],
    ]);
  });

  it("downloads one Fontsource file per weight and style, in the default subset", async () => {
    const f = mockFetch({
      "https://api.fontsource.org/v1/fonts/adwaita-mono": JSON.stringify({
        id: "adwaita-mono",
        defSubset: "latin",
        variants: { "400": { normal: { latin: { url: { ttf: "https://cdn.jsdelivr.net/a-400.ttf" } }, greek: { url: { ttf: "https://cdn.jsdelivr.net/g.ttf" } } } } },
      }),
      "https://cdn.jsdelivr.net/a-400.ttf": fontBytes,
    });
    const files = await downloadFamily(candidate({ source: "fontsource", id: "adwaita-mono" }), f);
    expect(files.map((x) => x.name)).toEqual(["adwaita-mono-400-normal.ttf"]);
    expect(f.calls).not.toContain("https://cdn.jsdelivr.net/g.ttf");
  });

  it("takes only fonts and licenses out of a Font Squirrel zip, flattening paths", async () => {
    const zip = await buildZip([
      { name: "../../evil/orbitron-bold.otf", data: fontBytes, method: 8 },
      { name: "SIL Open Font License.txt", text: "OFL", method: 0 },
      { name: "readme.exe", text: "MZ", method: 0 },
    ]);
    const f = mockFetch({ "https://www.fontsquirrel.com/fonts/download/Orbitron": zip });
    const files = await downloadFamily(candidate({ source: "fontsquirrel", id: "Orbitron" }), f);
    expect(files.map((x) => [x.name, x.kind])).toEqual([
      ["orbitron-bold.otf", "font"],
      ["SIL_Open_Font_License.txt", "license"],
    ]);
  });

  it("rejects files that are not fonts and hosts outside the allowlist", async () => {
    const bad = mockFetch({
      "https://fonts.google.com/download/list?family=X": JSON.stringify({ manifest: { files: [], fileRefs: [{ filename: "x.ttf", url: "https://fonts.gstatic.com/x.ttf" }] } }),
      "https://fonts.gstatic.com/x.ttf": "<html>not a font</html>",
    });
    await expect(downloadFamily(candidate({}), bad)).rejects.toThrow(/not a readable font/);

    const redirect = mockFetch({
      "https://fonts.google.com/download/list?family=X": JSON.stringify({ manifest: { files: [], fileRefs: [{ filename: "x.ttf", url: "https://evil.example/x.ttf" }] } }),
    });
    await expect(downloadFamily(candidate({}), redirect)).rejects.toThrow(/Refusing to fetch https:\/\/evil.example/);
  });

  it("checks every redirect hop against the allowlist", async () => {
    const hop = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });
    const manifest = JSON.stringify({ manifest: { files: [], fileRefs: [{ filename: "x.ttf", url: "https://fonts.gstatic.com/x.ttf" }] } });
    const ok = mockFetch({
      "https://fonts.google.com/download/list?family=X": manifest,
      "https://fonts.gstatic.com/x.ttf": hop("/y.ttf"),
      "https://fonts.gstatic.com/y.ttf": fontBytes,
    });
    expect((await downloadFamily(candidate({}), ok)).map((f) => f.name)).toEqual(["x.ttf"]);

    const away = mockFetch({
      "https://fonts.google.com/download/list?family=X": manifest,
      "https://fonts.gstatic.com/x.ttf": hop("https://evil.example/x.ttf"),
    });
    await expect(downloadFamily(candidate({}), away)).rejects.toThrow(/Refusing to fetch https:\/\/evil.example/);
    expect(away.calls).not.toContain("https://evil.example/x.ttf");
  });

  it("stops reading a body past the size cap, whatever Content-Length says", async () => {
    let pulled = 0;
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            pulled++;
            c.enqueue(new Uint8Array(1024 * 1024));
          },
        }),
        { headers: { "content-length": "10" } },
      );
    const f = mockFetch({
      "https://fonts.google.com/download/list?family=X": JSON.stringify({ manifest: { files: [], fileRefs: [{ filename: "x.ttf", url: "https://fonts.gstatic.com/x.ttf" }] } }),
      "https://fonts.gstatic.com/x.ttf": endless,
    });
    await expect(downloadFamily(candidate({}), f)).rejects.toThrow(/more than 31457280 bytes/);
    expect(pulled).toBeLessThan(40);
  });

  it("refuses zip entries that inflate past the cap", async () => {
    const big = new Uint8Array(31 * 1024 * 1024);
    const zip = await buildZip([{ name: "bomb.ttf", data: big, method: 8 }]);
    const f = mockFetch({ "https://www.fontsquirrel.com/fonts/download/Orbitron": zip });
    await expect(downloadFamily(candidate({ source: "fontsquirrel", id: "Orbitron" }), f)).rejects.toThrow(/too large/);
  });
});
