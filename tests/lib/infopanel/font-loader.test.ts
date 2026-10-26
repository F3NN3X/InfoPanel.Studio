import { afterEach, describe, expect, it, vi } from "vitest";
import { FontLoader, nameFont } from "@/lib/infopanel/font-loader.ts";

afterEach(() => vi.unstubAllGlobals());

describe("FontLoader without a font list", () => {
  it("draws a request InfoPanel did not answer with its family by name, not Segoe UI", async () => {
    vi.stubGlobal("fetch", async () => new Response("oops", { status: 500 }));
    const loader = new FontLoader(null, "http://127.0.0.1:1");
    const r = await loader.resolve({ font: "JetBrains Mono", style: "Bold", bold: false, italic: false });
    expect(r.css).toEqual({ fontFamily: '"JetBrains Mono"', fontWeight: 700, fontStyle: "normal" });
    expect(r).toEqual(nameFont({ font: "JetBrains Mono", style: "Bold", bold: false, italic: false }));
  });

  it("draws a styled request whose family is missing as InfoPanel does: Segoe UI regular", () => {
    const missing = () => false;
    expect(nameFont({ font: "Nunito Sans", style: "Bold", bold: true, italic: false }, missing).css).toEqual({ fontFamily: '"Segoe UI"', fontWeight: 400, fontStyle: "normal" });
    // Without a FontStyle the browser's fallback for the name stands, at the asked weight.
    expect(nameFont({ font: "Nunito Sans", style: "", bold: true, italic: false }, missing).css).toEqual({ fontFamily: '"Nunito Sans"', fontWeight: 700, fontStyle: "normal" });
  });
});
