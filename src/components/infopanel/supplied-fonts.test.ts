import { describe, expect, it } from "vitest";
import type { TextStyle } from "@/lib/infopanel/render/scene";
import { suppliedUrl, withSupplied } from "./supplied-fonts";

const style = (font: string) => ({ font: { font, style: "Regular", bold: false, italic: false } }) as TextStyle;

describe("supplied fonts", () => {
  it("serves a face from the asset store by its file's extension, never a collection", () => {
    const s = { hash: "a".repeat(64), index: 0, family: "Orbitron", face: "Bold" };
    expect(suppliedUrl({ ...s, file: "Orbitron-Bold.TTF" })).toBe(`/api/assets/${"a".repeat(64)}.ttf`);
    expect(suppliedUrl({ ...s, file: "x.woff2" })).toBe(`/api/assets/${"a".repeat(64)}.woff2`);
    expect(suppliedUrl({ ...s, file: "set.ttc" })).toBeNull();
  });

  it("draws a supplied request with its face and the rest as the loader says", () => {
    const base = () => ({ fontFamily: "fallback" });
    const font = withSupplied(base, new Map([[JSON.stringify(["Orbitron", "Regular", false, false]), "sup-x"]]));
    expect(font(style("Orbitron"))).toEqual({ fontFamily: '"sup-x"', fontWeight: 400, fontStyle: "normal" });
    expect(font(style("Other"))).toEqual({ fontFamily: "fallback" });
    expect(withSupplied(base, new Map())).toBe(base);
  });
});
