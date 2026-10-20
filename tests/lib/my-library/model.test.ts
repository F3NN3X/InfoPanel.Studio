import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { aspectTag, dHash, hamming, hueName, pixelStats, type PixelStats, type Pixels } from "@/lib/my-library/analyse";
import { classify, svgSize, svgVars } from "@/lib/my-library/intake";
import {
  autoTags,
  buildIndex,
  cleanupCounts,
  collectionCounts,
  collectionItems,
  copiesLine,
  duplicateGroups,
  flagOf,
  hashOf,
  metaLine,
  roleOf,
  search,
  sortItems,
  topTags,
  type MediaMeta,
} from "@/lib/my-library/model";
import { contrast, hslTokenToRgb, hueDistance, suggestBackgrounds } from "@/lib/my-library/theme-suggest";

const H = (c: string) => c.repeat(64);
const NOW = Date.parse("2026-10-17T12:00:00Z");

let n = 0;
function item(over: Partial<LibraryItem> & { meta?: MediaMeta } = {}): LibraryItem {
  n++;
  return {
    id: `lib_${String(n).padStart(12, "0")}`,
    kind: "image",
    name: `item ${n}`,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    files: [],
    meta: {},
    copies: [],
    ...over,
  } as LibraryItem;
}

const stats = (over: Partial<PixelStats> = {}): PixelStats => ({ luminance: 0.1, median: 0.08, hues: ["Blue"], hue: 220, colourful: 0.6, alpha: false, edges: 0.1, ...over });

function solid(w: number, h: number, rgba: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

describe("pixel analysis", () => {
  it("reads a dark blue image", () => {
    const s = pixelStats(solid(8, 8, [20, 40, 160, 255]));
    expect(s.luminance).toBeLessThan(0.1);
    expect(s.hues).toEqual(["Blue"]);
    expect(s.hue).toBeGreaterThan(220);
    expect(s.alpha).toBe(false);
    expect(s.edges).toBe(0);
  });

  it("finds transparency and calls grey neutral", () => {
    const s = pixelStats(solid(4, 4, [128, 128, 128, 100]));
    expect(s.alpha).toBe(true);
    expect(s.hues).toEqual([]);
    expect(s.hue).toBeNull();
  });

  it("measures detail", () => {
    const px = solid(8, 8, [0, 0, 0, 255]);
    for (let i = 0; i < 64; i += 2) px.data.set([255, 255, 255, 255], i * 4);
    expect(pixelStats(px).edges).toBeGreaterThan(0.5);
  });

  it("names hues and shapes", () => {
    expect([0, 30, 60, 120, 175, 220, 270, 320, 350].map(hueName)).toEqual(["Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple", "Pink", "Red"]);
    expect([aspectTag(1920, 550), aspectTag(300, 900), aspectTag(512, 512)]).toEqual(["Wide", "Tall", "Square"]);
  });

  it("hashes alike images alike and different images apart", () => {
    const grad = (shift: number, mirror = false): Pixels => {
      const data = new Uint8ClampedArray(18 * 16 * 4);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 18; x++) data.set([((mirror ? 17 - x : x) * 14 + shift) % 256, 0, 0, 255], (y * 18 + x) * 4);
      return { width: 18, height: 16, data };
    };
    expect(dHash(grad(0))).toHaveLength(16);
    expect(hamming(dHash(grad(0)), dHash(grad(1)))).toBeLessThanOrEqual(4);
    expect(hamming(dHash(grad(0)), dHash(grad(0, true)))).toBeGreaterThan(4);
    expect(hamming("ab", "abc")).toBe(Infinity);
  });
});

describe("auto tags", () => {
  it("tags a dark wide background", () => {
    const m = { width: 1920, height: 550, stats: stats() };
    expect(roleOf("image", m)).toBe("background");
    expect(autoTags("image", m)).toEqual(["Dark", "Blue", "Wide", "Background"]);
  });

  it("tags a transparent icon and a looping video", () => {
    expect(autoTags("image", { width: 64, height: 64, stats: stats({ luminance: 0.7, hues: [], alpha: true }) })).toEqual(["Light", "Transparent", "Square", "Icon"]);
    expect(autoTags("video", { width: 1920, height: 1080, audio: false })).toEqual(["Wide", "Animated", "Loop", "Background"]);
    expect(autoTags("image", { width: 160, height: 48, frames: 24 })).toContain("Animated");
  });

  it("never calls an SVG template an icon", () => {
    expect(roleOf("svg", { width: 200, height: 200, vars: ["--value"] })).toBeNull();
    expect(roleOf("svg", { width: 24, height: 24 })).toBe("icon");
  });
});

describe("collections", () => {
  const a = item({ name: "Aurora blue.jpg", files: [`${H("a")}.jpg`], meta: { type: "jpeg", size: 1_900_000, width: 1920, height: 550, tags: ["Dark", "Blue", "Wide", "Background"] }, copies: [{ profileId: "p" }], createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z" });
  const b = item({ name: "rog_logo (1).png", files: [`${H("b")}.png`], meta: { type: "png", size: 140_000, width: 512, height: 512, phash: "ff00ff00ff00ff00", tags: ["Square"] } });
  const c = item({ name: "ROG logo.png", files: [`${H("c")}.png`], meta: { type: "png", size: 140_000, width: 512, height: 512, phash: "ff00ff00ff00ff01", tags: ["Square"] }, copies: [{ profileId: "p" }, { profileId: "q" }], createdAt: "2026-09-01T00:00:00Z" });
  const d = item({ name: "copy.jpg", files: [`${H("a")}.jpg`], meta: { size: 1_900_000 } });
  const g = item({ kind: "gauge", name: "CPU arc", meta: { gaugeKind: "Vector gauge · arc" } });
  const f = item({ kind: "font", name: "Orbitron", meta: { family: "Orbitron", faces: 4, size: 412_000 } });
  const index = buildIndex([a, b, c, d, g, f]);

  it("finds identical bytes and images that look identical, oldest first", () => {
    const groups = duplicateGroups([a, b, c, d, g, f]);
    expect(groups.map((gr) => gr.map((i) => i.name)).sort()).toEqual([
      ["ROG logo.png", "rog_logo (1).png"],
      ["copy.jpg", "Aurora blue.jpg"],
    ]);
    expect(hashOf(a)).toBe(H("a"));
  });

  it("counts every collection, an item in several", () => {
    const counts = collectionCounts(index, NOW);
    expect(counts.all).toBe(6);
    expect(counts.recent).toBe(1);
    expect(counts.unused).toBe(4);
    expect(counts.large).toBe(2);
    expect(counts.duplicates).toBe(4);
    expect(counts.images).toBe(4);
    expect(counts.backgrounds).toBe(1);
    expect(counts.gauges).toBe(1);
    expect(counts.fonts).toBe(1);
    expect(collectionItems("backgrounds", index).map((i) => i.name)).toEqual(["Aurora blue.jpg"]);
  });

  it("counts the cleanup banner and flags cards", () => {
    expect(cleanupCounts(index)).toMatchObject({ duplicates: 2, unused: 4, large: 2 });
    expect(flagOf(b, index)).toBe("Duplicate");
    expect(flagOf(g, index)).toBe("Unused");
    expect(flagOf(buildIndex([a]).items[0], buildIndex([a]))).toBeNull();
  });

  it("searches everything: every word must match, ignoring case", () => {
    expect(search(index.items, "blue wide").map((i) => i.name)).toEqual(["Aurora blue.jpg"]);
    expect(search(index.items, "512x512").map((i) => i.name).sort()).toEqual(["ROG logo.png", "rog_logo (1).png"]);
    expect(search(index.items, "ARC gauge").map((i) => i.name)).toEqual(["CPU arc"]);
    expect(search(index.items, "blue font")).toEqual([]);
    expect(search(index.items, "  ")).toHaveLength(6);
  });

  it("picks the most frequent tags", () => {
    expect(topTags(index.items, 2)).toEqual(["Square", "Background"]);
  });

  it("sorts by date, name, size and use", () => {
    expect(sortItems([c, a], "recent")[0]).toBe(a);
    expect(sortItems([a, c, b], "name").map((i) => i.name)).toEqual(["Aurora blue.jpg", "ROG logo.png", "rog_logo (1).png"]);
    expect(sortItems([b, a], "size")[0]).toBe(a);
    expect(sortItems([a, c], "used")[0]).toBe(c);
  });

  it("writes the card and copy lines", () => {
    expect(metaLine(a)).toBe("1920 × 550 · 1.8 MB");
    expect(metaLine(item({ kind: "video", meta: { duration: 12, width: 1920, height: 550, size: 8_800_000 } }))).toBe("0:12 · 1920 × 550 · 8.4 MB");
    expect(metaLine(f)).toBe("4 faces · 402 KB");
    expect(metaLine(g)).toBe("Vector gauge · arc");
    expect(metaLine(item({ kind: "panel", meta: { cols: 4, rows: 2 } }))).toBe("4 × 2 cells");
    expect(copiesLine(2)).toBe("2 copies placed · editing this one changes none of them");
    expect(copiesLine(0)).toBe("Not placed anywhere yet");
  });
});

describe("theme suggestions", () => {
  const theme = { foreground: "0 0% 98%", accent: "220 80% 55%", name: "Midnight" };
  const bg = (name: string, s: Partial<PixelStats>) => item({ name, meta: { width: 1920, height: 550, stats: stats(s), tags: ["Background"] } });

  it("converts tokens and measures contrast and hue", () => {
    expect(hslTokenToRgb("0 0% 100%")).toEqual([255, 255, 255]);
    expect(hslTokenToRgb("120 100% 25%")).toEqual([0, 128, 0]);
    expect(hslTokenToRgb("nope")).toBeNull();
    expect(contrast(1, 0)).toBeCloseTo(21);
    expect(hueDistance(350, 10)).toBe(20);
  });

  it("keeps readable backgrounds, matching hues first, with a reason", () => {
    const out = suggestBackgrounds(
      [
        bg("blue", { hue: 225 }),
        bg("grey", { hue: null, hues: [], colourful: 0.02 }),
        bg("too light", { median: 0.7, luminance: 0.7 }),
        bg("orange", { hue: 30, hues: ["Orange"], edges: 0.05 }),
        item({ name: "no tag", meta: { stats: stats() } }),
      ],
      theme,
    );
    expect(out.map((s) => s.item.name)).toEqual(["blue", "grey", "orange"]);
    expect(out[0].reason).toBe("Same blues as the Midnight accent");
    expect(out[1].reason).toBe("Neutral; lets the accent lead");
    expect(out[2].reason).toBe("Low detail; keeps values readable");
  });
});

describe("intake", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0]);
  const text = (s: string) => new TextEncoder().encode(s);

  it("sorts files into images, SVG, video, fonts and profiles", () => {
    expect(classify("a.png", "image/png", png)).toMatchObject({ ok: true, kind: "image", type: "png", width: 64, height: 32 });
    expect(classify("t.svg", "", text('<svg viewBox="0 0 200 100"><rect style="fill:var(--value)"/></svg>'))).toMatchObject({ ok: true, kind: "svg", width: 200, height: 100 });
    expect(classify("v.mp4", "", new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0]))).toMatchObject({ ok: true, kind: "video", type: "mp4" });
    expect(classify("v.mkv", "", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toMatchObject({ ok: true, kind: "video", mime: "video/webm" });
    expect(classify("f.ttf", "", new Uint8Array([0, 1, 0, 0, 0, 9]))).toMatchObject({ ok: true, kind: "font", type: "ttf" });
    expect(classify("f.otf", "", text("OTTO...."))).toMatchObject({ ok: true, kind: "font", type: "otf" });
    expect(classify("ARC.infopanel", "", png)).toEqual({ ok: true, kind: "infopanel" });
  });

  it("refuses what the store would, with the reason per file", () => {
    expect(classify("bad.ttf", "", text("hello"))).toEqual({ ok: false, reason: "Not a font this app can read" });
    expect(classify("x.svg", "", text('<svg onload="alert(1)"></svg>'))).toEqual({ ok: false, reason: "Unsafe SVG: it has scripts or event handlers" });
    expect(classify("x.svg", "", text(`<svg>${"a".repeat(256 * 1024)}</svg>`))).toEqual({ ok: false, reason: "SVG over 256 KB" });
    expect(classify("notes.txt", "text/plain", text("hi"))).toEqual({ ok: false, reason: "Not an image, video, SVG or font" });
  });

  it("reads an SVG's size and template variables", () => {
    expect(svgSize('<svg width="48px" height="24" viewBox="0 0 10 10">')).toEqual({ width: 48, height: 24 });
    expect(svgVars("a{fill:var(--value)} b{width:calc(var( --percent) * 1%)} c{x:var(--value)}")).toEqual(["--value", "--percent"]);
  });
});

describe("near-duplicate images (G15)", () => {
  // A smooth, asymmetric picture; a "re-encode" nudges every channel by a few levels, a "resize" halves it.
  const picture = (w: number, h: number, noise = 0): Pixels => {
    const data = new Uint8ClampedArray(w * h * 4);
    let seed = 7;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const jitter = noise ? (seed % (2 * noise + 1)) - noise : 0;
        const u = x / w;
        const v = y / h;
        data.set([128 + 100 * Math.sin(6 * u + v) + jitter, 128 + 100 * Math.cos(5 * v - u * 2) + jitter, 60 + 150 * u * v + jitter, 255], (y * w + x) * 4);
      }
    return { width: w, height: h, data };
  };
  const half = (p: Pixels): Pixels => {
    const w = p.width / 2;
    const h = p.height / 2;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) data[(y * w + x) * 4 + c] = p.data[(2 * y * p.width + 2 * x) * 4 + c];
    return { width: w, height: h, data };
  };
  const inverted = (p: Pixels): Pixels => ({ ...p, data: p.data.map((v, i) => (i % 4 === 3 ? v : 255 - v)) });
  const base = picture(128, 96);
  const as = (name: string, hash: string, px: Pixels, width: number, height: number) =>
    item({ name, files: [`${H(hash)}.png`], meta: { type: "png", size: 1000, width, height, phash: dHash(px) } });

  it("groups the same pixels re-encoded (different bytes, same size)", () => {
    const a = as("photo.png", "a", base, 1024, 768);
    const b = as("photo-reencoded.png", "b", picture(128, 96, 3), 1024, 768);
    expect(hamming(metaPhash(a), metaPhash(b))).toBeLessThanOrEqual(4);
    expect(duplicateGroups([a, b]).map((g) => g.map((i) => i.name))).toEqual([["photo.png", "photo-reencoded.png"]]);
  });

  it("does not group a resize: the hashes agree but the pixel size differs, so it is kept apart", () => {
    const a = as("photo.png", "a", base, 1024, 768);
    const small = as("photo-small.png", "c", half(base), 512, 384);
    expect(hamming(metaPhash(a), metaPhash(small))).toBeLessThanOrEqual(4);
    expect(duplicateGroups([a, small])).toEqual([]);
  });

  it("does not group a different picture of the same size", () => {
    const a = as("photo.png", "a", base, 1024, 768);
    expect(duplicateGroups([a, as("other.png", "d", inverted(base), 1024, 768)])).toEqual([]);
  });
});

const metaPhash = (i: LibraryItem) => String((i.meta as { phash?: string }).phash);
