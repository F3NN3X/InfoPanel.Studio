/**
 * Image detection for sensor text values.
 *
 * InfoPanel plugins expose images as plain text URLs — either from their own
 * localhost image servers (Media's cover-art server)
 * or remote CDNs (Steam static, Spotify, OpenWeatherMap weather icons). The
 * Data API carries those strings unchanged; the dashboard decides which
 * text values are actually images. Images a plugin hands to InfoPanel itself
 * are served by the Data API as PNG at `/api/images/{pluginId}/{imageId}`.
 */

import { getApiBase } from "@/lib/data-api";

const URL_RE = /^https?:\/\//i;
const EXT_RE = /\.(png|jpe?g|gif|webp|svg)([?#]|$)/i;
/** A Data API plugin image path (no extension, so matched by shape). */
const API_IMAGE_RE = /(^|^https?:\/\/[^/]+)\/api\/images\/[^/?#]+\/[^/?#]+/i;

/** Known image hosts, matched when the key gives no hint. */
const HOST_RE =
  /scdn\.co|steamstatic\.com|openweathermap\.org|weather-icons|githubusercontent\.com/i;

const IMAGE_TOKENS = new Set([
  "art",
  "artwork",
  "banner",
  "cover",
  "icon",
  "image",
  "img",
  "logo",
  "avatar",
  "thumb",
]);

/** True when the sensor key (id or full key) names an image-bearing field. */
function keyHasImageHint(key: string): boolean {
  const tokens = key.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.some((t) => IMAGE_TOKENS.has(t));
}

/**
 * True when a text value should be rendered with <img>.
 *
 * A value qualifies when it is an http(s) URL AND at least one of:
 * - the URL path ends in an image extension,
 * - the sensor key names an image field (cover-art, icon, banner, ...),
 * - the host is a known image CDN.
 * A root-relative path (the dashboard's own /assets/...) qualifies when it
 * ends in an image extension.
 */
export function isImageUrl(
  text: string | undefined | null,
  key?: string
): boolean {
  if (!text) return false;
  const t = text.trim();
  if (API_IMAGE_RE.test(t)) return true;
  if (t.startsWith("/") && !t.startsWith("//")) return EXT_RE.test(t);
  if (!URL_RE.test(t)) return false;
  if (EXT_RE.test(t)) return true;
  if (key && keyHasImageHint(key)) return true;
  return HOST_RE.test(t);
}

/**
 * An image URL ready for `<img src>`: a root-relative Data API image path
 * resolves against the Data API (not the dashboard's own server).
 */
export function resolveImageUrl(text: string): string {
  const t = text.trim();
  return t.startsWith("/api/images/") ? `${getApiBase()}${t}` : t;
}

/** `text` as an `<img src>` when it is an image URL, else undefined. */
export function imageUrl(text: string | undefined | null, key?: string): string | undefined {
  return text && isImageUrl(text, key) ? resolveImageUrl(text) : undefined;
}
