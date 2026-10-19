// Content-type rules of server.mjs's /api/image-proxy. Pure; exported for the tests.
//
// The proxy answers from the dashboard's own origin, so whatever it relays must not be able to run
// as a page there: only image types go through (406 otherwise), and the response carries
// `X-Content-Type-Options: nosniff`. SVG is an image type but a script host when opened directly,
// so it is refused too (cover art is raster).
//
// Cover-art sources: Spotify and YouTube Music CDNs send image/jpeg or image/webp. A plugin's local
// image server (http on loopback) may send application/octet-stream or no type at all, so that one
// type is allowed when the bytes themselves are a png/jpeg/gif/webp/avif image, and the response
// then carries the sniffed type rather than the upstream one.
//
// Targets: https anywhere, plain http only on loopback. Redirects are followed by hand (at most
// three) and every hop is checked the same way, so an https URL cannot bounce to a LAN host or
// 169.254.169.254.

const MAX_REDIRECTS = 3;

/** Whether the proxy may fetch `url` (a URL object): https anywhere, plain http only on loopback. */
export function isValidProxyTarget(url) {
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * The final upstream response for `target` (a URL object), following redirects by hand and checking
 * each hop, or null when a hop is refused or there are too many. Network errors throw.
 */
export async function fetchProxied(target, { signal, fetchImpl = fetch } = {}) {
  let url = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isValidProxyTarget(url)) return null;
    const res = await fetchImpl(url, { signal, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel();
    try {
      url = new URL(location, url);
    } catch {
      return null;
    }
  }
  return null;
}

/** Whether an upstream media type (no parameters) may be relayed as it is. */
export function isAllowedProxyType(type) {
  const t = String(type ?? "").split(";")[0].trim().toLowerCase();
  return /^image\/[a-z0-9.+-]+$/.test(t) && t !== "image/svg+xml";
}

/** The image type the first bytes of `buf` show, or null. */
export function sniffImageType(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("latin1", 0, 6))) return "image/gif";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp" && ["avif", "avis"].includes(buf.toString("latin1", 8, 12))) return "image/avif";
  return null;
}

/** The type to serve for an upstream `content-type` header value and body, or null to refuse (406). */
export function resolveProxyType(header, body) {
  const t = String(header ?? "").split(";")[0].trim().toLowerCase();
  if (isAllowedProxyType(t)) return t;
  if (t === "" || t === "application/octet-stream") return sniffImageType(body);
  return null;
}
