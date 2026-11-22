// The render check's frame reads a candidate's url() masks from the files the studio sent (the pack is not stored, so its route
// answers 404): each file is keyed by the absolute URL the mounted CSS names it by. The decoding and the sampling run in a browser
// (tests/e2e/pack-render-shapes.spec.ts).
import { describe, expect, it } from "vitest";
import { maskFiles } from "@/looks/pack-render-measures";
import { scopePackCss } from "@/looks/pack-css";

const ORIGIN = "http://127.0.0.1:5173";
const bytes = (s: string) => new TextEncoder().encode(s);

describe("a candidate's files by the URL its CSS names them by", () => {
  it("keys each file as the mounted CSS writes its url, an SVG typed as one", async () => {
    const files = maskFiles("my pack", [{ path: "assets/a mask.svg", size: 5, bytes: bytes("<svg/>") }, { path: "assets/m.png", size: 3, bytes: bytes("png") }], ORIGIN);
    // the url as `scopePackCss` writes it for a user pack, resolved against the page as the browser does
    const written = /url\("([^"]+)"\)/.exec(scopePackCss("my pack", "[data-part=\"card\"]::before { content: \"\"; mask-image: url(\"./assets/a mask.svg\"); }", { user: true }))?.[1] as string;
    const svg = files[new URL(written, ORIGIN).href];
    expect(svg?.type).toBe("image/svg+xml");
    expect(await svg?.text()).toBe("<svg/>");
    expect(files[`${ORIGIN}/api/packs/my%20pack/assets/m.png`]?.type).toBe("");
  });

  it("leaves out a file without its bytes, and names no URL outside the pack's route", () => {
    const files = maskFiles("p", [{ path: "assets/gone.svg", size: 4 }], ORIGIN);
    expect(files).toEqual({});
    expect(Object.keys(maskFiles("p", [{ path: "x.svg", size: 1, bytes: bytes("x") }], ORIGIN))).toEqual([`${ORIGIN}/api/packs/p/x.svg`]);
  });
});
