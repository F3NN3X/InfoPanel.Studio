import { describe, expect, it } from "vitest";
import { fetchProxied, isAllowedProxyType, isValidProxyTarget, resolveProxyType, sniffImageType } from "./proxy.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const gif = Buffer.from("GIF89a....");
const webp = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1");
const avif = Buffer.from("\0\0\0\x1cftypavif\0\0\0\0", "latin1");

describe("isAllowedProxyType", () => {
  it("allows raster image types, with or without parameters and case", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "IMAGE/PNG", "image/avif; q=1", "image/x-icon"]) expect(isAllowedProxyType(t)).toBe(true);
  });
  it("refuses everything else, including svg", () => {
    for (const t of ["text/html", "text/html; charset=utf-8", "application/json", "application/octet-stream", "image/svg+xml", "image/", "", null, undefined, "video/mp4"]) expect(isAllowedProxyType(t)).toBe(false);
  });
});

describe("sniffImageType", () => {
  it("recognises the supported formats", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(gif)).toBe("image/gif");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(avif)).toBe("image/avif");
  });
  it("returns null for anything else", () => {
    expect(sniffImageType(Buffer.from("<html><script>"))).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("resolveProxyType", () => {
  it("keeps an image type and ignores the body", () => {
    expect(resolveProxyType("image/jpeg; charset=x", Buffer.from("junk"))).toBe("image/jpeg");
  });
  it("sniffs octet-stream and a missing type, serving the sniffed type", () => {
    expect(resolveProxyType("application/octet-stream", png)).toBe("image/png");
    expect(resolveProxyType(null, webp)).toBe("image/webp");
  });
  it("refuses octet-stream that is not an image, and non-image types even when the body is", () => {
    expect(resolveProxyType("application/octet-stream", Buffer.from("<html>"))).toBeNull();
    expect(resolveProxyType("text/html", png)).toBeNull();
    expect(resolveProxyType("image/svg+xml", Buffer.from("<svg/>"))).toBeNull();
  });
});

describe("isValidProxyTarget", () => {
  it("allows https anywhere and http on loopback only", () => {
    for (const u of ["https://i.scdn.co/a.jpg", "https://10.0.0.1/x", "http://localhost:9/a", "http://127.0.0.1/a", "http://[::1]/a"]) expect(isValidProxyTarget(new URL(u))).toBe(true);
    for (const u of ["http://169.254.169.254/latest", "http://10.0.0.1/x", "http://example.com/a.jpg", "file:///C:/a.png", "ftp://example.com/a"]) expect(isValidProxyTarget(new URL(u))).toBe(false);
  });
});

describe("fetchProxied", () => {
  // A fake fetch answering from a map of URL → [status, location?].
  const fake = (routes) => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push(String(url));
      expect(init.redirect).toBe("manual");
      const [status, location] = routes[String(url)] ?? [404];
      return new Response(status >= 300 && status < 400 ? null : "body", { status, headers: location ? { location } : {} });
    };
    return { fetchImpl, seen };
  };

  it("returns a response that does not redirect", async () => {
    const { fetchImpl } = fake({ "https://a.test/x.jpg": [200] });
    expect((await fetchProxied(new URL("https://a.test/x.jpg"), { fetchImpl })).status).toBe(200);
  });

  it("follows allowed hops, resolving relative locations", async () => {
    const { fetchImpl, seen } = fake({ "https://a.test/x": [302, "/y"], "https://a.test/y": [301, "https://b.test/z"], "https://b.test/z": [200] });
    expect((await fetchProxied(new URL("https://a.test/x"), { fetchImpl })).status).toBe(200);
    expect(seen).toEqual(["https://a.test/x", "https://a.test/y", "https://b.test/z"]);
  });

  it("refuses a hop to plain http off loopback without fetching it", async () => {
    const { fetchImpl, seen } = fake({ "https://a.test/x": [302, "http://169.254.169.254/latest/meta-data"] });
    expect(await fetchProxied(new URL("https://a.test/x"), { fetchImpl })).toBeNull();
    expect(seen).toEqual(["https://a.test/x"]);
  });

  it("gives up after three redirects", async () => {
    const { fetchImpl, seen } = fake({ "https://a.test/0": [302, "/1"], "https://a.test/1": [302, "/2"], "https://a.test/2": [302, "/3"], "https://a.test/3": [302, "/4"], "https://a.test/4": [200] });
    expect(await fetchProxied(new URL("https://a.test/0"), { fetchImpl })).toBeNull();
    expect(seen).toHaveLength(4);
  });
});
