import { describe, expect, it, vi } from "vitest";
import { bundleAssets, profileAssetIds, readBundled, restoreAssets, type BundledAsset } from "@/lib/profile-assets";

const id = (c: string, ext = "png") => `${c.repeat(64)}.${ext}`;
const A = id("a");
const B = id("b", "svg");
const C = id("c", "gif");

describe("profileAssetIds", () => {
  it("finds the images a profile names, each once, and leaves videos, fonts and longer runs out", () => {
    const profile = {
      background: { src: `/api/assets/${A}` },
      pinned: { items: [{ rail: [{ icon: { from: "image", asset: B } }, { icon: { from: "app", exe: "Chat.exe", asset: A } }] }] },
      video: `/api/assets/${id("d", "mp4")}`,
      font: id("e", "woff2"),
      long: `f${id("a")}`,
      other: `${C}x`,
    };
    expect(profileAssetIds(profile)).toEqual([A, B]);
  });
});

describe("bundleAssets", () => {
  const bytes: Record<string, Uint8Array> = { [A]: new Uint8Array(300), [B]: new Uint8Array(30), [C]: new Uint8Array(3000) };
  const read = async (k: string) => bytes[k];

  it("carries each image as base64 with its type, in the profile's order", async () => {
    const { assets, left } = await bundleAssets([A, B], 10_000, read);
    expect(left).toBe(0);
    expect(assets.map((a) => [a.id, a.type])).toEqual([
      [A, "image/png"],
      [B, "image/svg+xml"],
    ]);
    expect(atob(assets[0].data)).toHaveLength(300);
  });

  it("fits the smallest first within the budget, and counts what is left out or gone", async () => {
    // room for B (40 + 120) and A (400 + 120), not C (4000 + 120)
    const { assets, left } = await bundleAssets([C, A, B, id("9")], 1000, read);
    expect(assets.map((a) => a.id)).toEqual([A, B]);
    expect(left).toBe(2);
  });
});

describe("readBundled", () => {
  it("keeps entries with an image id, the type its extension names and base64 data", () => {
    const good: BundledAsset = { id: A, type: "image/png", data: "AAAA" };
    expect(
      readBundled([
        good,
        { id: A, type: "image/svg+xml", data: "AAAA" },
        { id: id("d", "mp4"), type: "video/mp4", data: "AAAA" },
        { id: "../config.json", type: "image/png", data: "AAAA" },
        { id: A, type: "image/png", data: "<script>" },
        { id: A, type: "image/png" },
        "x",
        null,
      ])
    ).toEqual([good]);
    expect(readBundled({ [A]: "AAAA" })).toEqual([]);
    expect(readBundled(undefined)).toEqual([]);
  });
});

describe("restoreAssets", () => {
  it("stores the images the profile names and points it at the ids they got", async () => {
    const profile = { a: `/api/assets/${A}`, rail: [{ icon: { from: "image", asset: B } }] };
    const clean = id("c", "svg");
    const upload = vi.fn(async (_b: Uint8Array, mime: string) => ({ id: mime === "image/svg+xml" ? clean : A, url: "", type: mime, size: 1 }));
    const unnamed: BundledAsset = { id: id("9"), type: "image/png", data: "AAAA" };
    const r = await restoreAssets(profile, [{ id: A, type: "image/png", data: "AAAA" }, { id: B, type: "image/svg+xml", data: btoa("<svg/>") }, unnamed], upload);
    // the SVG the server sanitised has a new id; the PNG kept its own; an image the profile doesn't name is not stored
    expect(r).toEqual({ profile: { a: `/api/assets/${A}`, rail: [{ icon: { from: "image", asset: clean } }] }, failed: 0 });
    expect(upload).toHaveBeenCalledTimes(2);
    expect([...upload.mock.calls[1][0]]).toEqual([..."<svg/>"].map((c) => c.charCodeAt(0)));
  });

  it("keeps the old id and counts an image the server refuses", async () => {
    const profile = { a: A };
    const upload = vi.fn(async () => {
      throw new Error("refused");
    });
    expect(await restoreAssets(profile, [{ id: A, type: "image/png", data: "AAAA" }], upload)).toEqual({ profile, failed: 1 });
  });
});
