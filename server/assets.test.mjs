import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetPath,
  declaredType,
  dirBytes,
  isLoopback,
  parseRange,
  isSvgText,
  referencedHashes,
  sniffType,
  uploadQuotaRefusal,
} from "./assets.mjs";

describe("upload quota", () => {
  const base = { inFlight: 0, maxInFlight: 2, used: 100, incoming: 50, maxBytes: 1000 };
  it("accepts within both caps", () => {
    expect(uploadQuotaRefusal(base)).toBeNull();
    expect(uploadQuotaRefusal({ ...base, used: 950 })).toBeNull();
  });
  it("answers 429 at the in-flight cap", () => {
    expect(uploadQuotaRefusal({ ...base, inFlight: 2 })?.status).toBe(429);
    expect(uploadQuotaRefusal({ ...base, inFlight: 1 })).toBeNull();
  });
  it("answers 507 when the total would pass the cap", () => {
    expect(uploadQuotaRefusal({ ...base, used: 951 })?.status).toBe(507);
  });
  it("dirBytes sums the files of a directory, 0 when missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assets-quota-"));
    try {
      fs.writeFileSync(path.join(dir, "a"), Buffer.alloc(10));
      fs.writeFileSync(path.join(dir, "b"), Buffer.alloc(5));
      expect(dirBytes(dir)).toBe(15);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(dirBytes(path.join(dir, "missing"))).toBe(0);
  });
});

const bytes = (...parts) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));

/** An ISO-BMFF `ftyp` box with a major and compatible brands. */
const ftyp = (major, ...compatible) => {
  const size = 16 + 4 * compatible.length;
  return bytes([0, 0, 0, size], "ftyp", major, [0, 0, 0, 0], ...compatible, [0, 0, 0, 8], "free");
};

const SAMPLES = {
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR"),
  jpg: bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF"),
  gif: bytes("GIF89a", [1, 0, 1, 0]),
  webp: bytes("RIFF", [36, 0, 0, 0], "WEBPVP8 "),
  avif: ftyp("avif", "mif1", "miaf"),
  mp4: ftyp("isom", "iso2", "avc1", "mp41"),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0x82, 0x84], "webm"),
  bmp: bytes("BM", [0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 40, 0, 0, 0]),
  ico: bytes([0, 0, 1, 0, 1, 0, 16, 16]),
  svg: bytes('<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  ttf: bytes([0, 1, 0, 0, 0, 12]),
  otf: bytes("OTTO", [0, 12]),
  ttc: bytes("ttcf", [0, 1, 0, 0]),
  woff: bytes("wOFF", [0, 1, 0, 0]),
  woff2: bytes("wOF2", [0, 1, 0, 0]),
};

const ID = `${"a".repeat(64)}.png`;

describe("sniffType", () => {
  it("recognizes every sample by its magic bytes", () => {
    for (const ext of Object.keys(SAMPLES)) expect(sniffType(SAMPLES[ext])?.ext, ext).toBe(ext);
  });

  it("reports the MIME type and kind", () => {
    expect(sniffType(SAMPLES.jpg)).toEqual({ ext: "jpg", mime: "image/jpeg", kind: "image" });
    expect(sniffType(SAMPLES.webm)).toEqual({ ext: "webm", mime: "video/webm", kind: "video" });
  });

  it("finds AVIF behind a generic major brand", () => {
    expect(sniffType(ftyp("mif1", "avif", "miaf"))?.ext).toBe("avif");
  });

  it("reports a font's kind and an SVG's own size limit", () => {
    expect(sniffType(SAMPLES.woff2)).toEqual({ ext: "woff2", mime: "font/woff2", kind: "font" });
    expect(sniffType(SAMPLES.svg)).toEqual({ ext: "svg", mime: "image/svg+xml", kind: "image", limit: 256 * 1024 });
  });

  it("refuses HTML, HTML holding SVG, text and garbage", () => {
    for (const bad of [
      bytes("<!doctype html><script>alert(1)</script>"),
      bytes("<html><svg></svg></html>"),
      bytes("<!-- x --><div><svg/></div>"),
      bytes("BM but not a bitmap"),
      bytes("hello world, not an image at all"),
      bytes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      Buffer.alloc(0),
    ]) {
      expect(sniffType(bad)).toBeNull();
    }
  });

  it("takes Matroska as webm: tools often write it into .webm files", () => {
    expect(sniffType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska"))?.ext).toBe("webm");
  });

  it("refuses other containers: HEIC, QuickTime, M4A", () => {
    expect(sniffType(ftyp("heic", "mif1", "heic"))).toBeNull();
    expect(sniffType(ftyp("qt  ", "qt  "))).toBeNull();
    expect(sniffType(ftyp("M4A ", "M4A ", "mp42"))).toBeNull();
  });

  it("does not take a RIFF file that is not WebP (WAV, AVI)", () => {
    expect(sniffType(bytes("RIFF", [36, 0, 0, 0], "WAVEfmt "))).toBeNull();
  });
});

describe("declaredType", () => {
  it("maps accepted Content-Types, ignoring case and parameters", () => {
    expect(declaredType("image/png")?.ext).toBe("png");
    expect(declaredType("Video/MP4; codecs=avc1")?.ext).toBe("mp4");
    expect(declaredType("video/x-matroska")).toEqual({ ext: "webm", mime: "video/webm", kind: "video" });
    expect(declaredType("image/svg+xml")?.ext).toBe("svg");
    expect(declaredType("application/x-font-ttf")?.ext).toBe("ttf");
    expect(declaredType("font/woff2")?.ext).toBe("woff2");
  });

  it("refuses everything else", () => {
    for (const bad of [undefined, "", "text/html", "application/xhtml+xml", "application/octet-stream", "image/jpg"]) {
      expect(declaredType(bad)).toBeNull();
    }
  });

  it("disagrees with a sniffed type of another kind", () => {
    // The upload route compares the two extensions.
    expect(declaredType("image/png")?.ext).not.toBe(sniffType(SAMPLES.jpg)?.ext);
    expect(declaredType("video/mp4")?.ext).not.toBe(sniffType(SAMPLES.webm)?.ext);
  });
});

describe("assetPath", () => {
  const dir = path.resolve("/data/assets");

  it("builds the file of a valid id inside the folder", () => {
    expect(assetPath(dir, ID)).toBe(path.join(dir, ID));
    expect(assetPath(dir, `${"0123456789abcdef".repeat(4)}.webm`)).toBe(path.join(dir, `${"0123456789abcdef".repeat(4)}.webm`));
  });

  it("refuses traversal, absolute paths, encodings and wrong extensions", () => {
    for (const bad of [
      "../config.json",
      `../${ID}`,
      `..%2f${ID}`,
      "%2e%2e",
      `%2e%2e/${ID}`,
      `..\\${ID}`,
      `/${ID}`,
      `C:\\${ID}`,
      `${ID}/`,
      `${ID}\u0000`,
      `${"a".repeat(64)}.svgz`,
      `${"a".repeat(64)}.html`,
      `${"a".repeat(64)}.PNG`,
      `${"A".repeat(64)}.png`,
      `${"a".repeat(63)}.png`,
      `${"a".repeat(65)}.png`,
      `${"g".repeat(64)}.png`,
      `${"a".repeat(64)}.png.html`,
      "",
      undefined,
    ]) {
      expect(assetPath(dir, bad)).toBeNull();
    }
  });
});

describe("referencedHashes", () => {
  it("collects the hashes in asset URLs, asset ids and bare hashes (an imported canvas)", () => {
    const [a, b, c] = ["a", "b", "c"].map((x) => x.repeat(64));
    const text = JSON.stringify({ background: { src: `/api/assets/${a}.png`, poster: `http://x/api/assets/${b}.mp4` }, canvas: { assets: [{ hash: c }] }, s: "/api/assets/nope.png" });
    expect(referencedHashes(text)).toEqual(new Set([a, b, c]));
  });

  it("takes no part of a longer hex run", () => {
    expect(referencedHashes("f".repeat(65))).toEqual(new Set());
  });
});

describe("isSvgText", () => {
  it("allows a BOM, a prologue, comments and a doctype before <svg>", () => {
    expect(isSvgText(String.fromCharCode(0xfeff) + '  <?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><!-- c --><svg viewBox="0 0 1 1"/>')).toBe(true);
  });

  it("refuses anything else first, and a prologue cut short", () => {
    for (const bad of ["<svgx>", "text <svg>", "<!-- unfinished <svg>", "<html><svg/></html>"]) expect(isSvgText(bad)).toBe(false);
  });
});

describe("parseRange", () => {
  it("serves an explicit range, clamping the end", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("serves an open-ended range to the end", () => {
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("serves a suffix range (the last N bytes)", () => {
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("ignores missing, malformed and multi-range headers (whole file)", () => {
    for (const h of [undefined, "", "bytes=", "bytes=-", "items=0-1", "bytes=a-b", "bytes=0-1,5-6", "bytes=10-5"]) {
      expect(parseRange(h, 1000)).toBeNull();
    }
  });

  it("is unsatisfiable past the end or for an empty suffix", () => {
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=2000-3000", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});

describe("isLoopback", () => {
  it("accepts IPv4, IPv6 and IPv4-mapped loopback only", () => {
    for (const ok of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(ok)).toBe(true);
    for (const bad of ["192.168.1.5", "::ffff:10.0.0.2", "fe80::1", "", undefined, "1127.0.0.1"]) {
      expect(isLoopback(bad)).toBe(false);
    }
  });
});
