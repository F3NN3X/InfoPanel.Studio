import { describe, expect, it } from "vitest";
import { entrySignature, parseEntry } from "./library.ts";
import { DEFAULT_GAUGE } from "./vector.ts";

const hash = "a".repeat(64);

describe("parseEntry", () => {
  it("accepts frames and vector entries, cleaning names", () => {
    const e = parseEntry({ id: "x-1", name: " Fan\u0007 ", kind: "frames", frames: [{ hash, name: "..\\..\\.evil.png" }], max: 3000, extra: true });
    expect(e).toEqual({ id: "x-1", name: "Fan", created: "1970-01-01T00:00:00.000Z", min: 0, max: 3000, animationSpeed: 0, kind: "frames", frames: [{ hash, name: "evil.png" }] });
    expect(parseEntry({ id: "v", name: "Ring", kind: "vector", vector: { sweep: 360 } })?.vector).toEqual({ ...DEFAULT_GAUGE, sweep: 360 });
  });

  it("rejects bad ids, hashes, names and empty or huge frame lists", () => {
    const ok = { id: "x", name: "n", kind: "frames", frames: [{ hash, name: "a.png" }] };
    expect(parseEntry(ok)).not.toBeNull();
    for (const bad of [
      { ...ok, id: "../x" },
      { ...ok, name: "" },
      { ...ok, kind: "other" },
      { ...ok, frames: [] },
      { ...ok, frames: [{ hash: "zz", name: "a.png" }] },
      { ...ok, frames: [{ hash, name: "" }] },
      { ...ok, frames: Array.from({ length: 1001 }, () => ({ hash, name: "a.png" })) },
      null,
      "x",
    ]) expect(parseEntry(bad)).toBeNull();
  });

  it("signs entries by frames or spec", () => {
    expect(entrySignature({ kind: "frames", frames: [{ hash, name: "a" }, { hash, name: "b" }] })).toBe(`f:${hash},${hash}`);
    expect(entrySignature({ kind: "vector", vector: DEFAULT_GAUGE })).toBe(`v:${JSON.stringify(DEFAULT_GAUGE)}`);
  });
});
