import { afterEach, describe, expect, it, vi } from "vitest";
import { FontLoader, remoteTypeface, type RemoteFont } from "./font-loader.ts";

const API = "http://api.test";
const answer = (family: string, extra: Partial<RemoteFont> = {}): RemoteFont => ({
  family, weight: 400, width: 5, italic: false, fallback: false, face: null, ttcIndex: 0, ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("FontLoader with the Data API", () => {
  it("sends the requests of one tick in one call and maps each answer", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { font: string }[];
      calls.push(body);
      return new Response(JSON.stringify(body.map((r) => answer(r.font === "Missing" ? "Segoe UI" : r.font, { fallback: r.font === "Missing" }))));
    });
    const loader = new FontLoader(null, API);
    const [a, b, again] = await Promise.all([
      loader.resolve({ font: "Barlow", style: "", bold: true, italic: false }),
      loader.resolve({ font: "Missing", style: "", bold: false, italic: false }),
      loader.resolve({ font: "Barlow", style: "", bold: true, italic: false }),
    ]);
    expect(calls).toHaveLength(1);
    expect((calls[0] as unknown[]).length).toBe(2);
    expect(a).toMatchObject({ source: "data-api", fallback: false, exact: false, typeface: { family: "Barlow", via: "data-api" } });
    expect(b).toMatchObject({ fallback: true, typeface: { family: "Segoe UI" } });
    expect(again).toEqual(a);
  });

  it("falls back to the ported resolver when the call fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    const loader = new FontLoader(null, API);
    const r = await loader.resolve({ font: "Barlow", style: "", bold: false, italic: false });
    expect(r.source).toBe("ported");
  });

  it("is only used when the endpoint answers", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.endsWith("/resolve") ? new Response("[]") : new Response("", { status: 404 })));
    expect((await FontLoader.fetch("/fonts", API))?.api).toBe(API);
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect(await FontLoader.fetch("/fonts", API)).toBeNull();
  });

  it("reads italic as Skia's slant", () => {
    expect(remoteTypeface(answer("Arial", { italic: true, weight: 700 }))).toMatchObject({ slant: "Italic", weight: 700 });
  });
});
