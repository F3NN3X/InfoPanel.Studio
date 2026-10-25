import { domToWebp } from "modern-screenshot";
import { IMAGE_PROXY_URL } from "@/lib/dashboard-server";

/** The widest a screenshot is (px); the thumbnails are at most 104 px wide. */
const SHOT_WIDTH = 320;
const SHOT_QUALITY = 0.8;
/** A proxied image that takes longer than this becomes blank. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * Studio-only overlays stay out of a shot: whatever carries `data-shot-skip` (selection and hover outlines,
 * rulers, grid, drag ghosts, placeholders, hidden zones), plus the screen fold, hidden-zone badge and resize handles.
 */
const SKIPPED = "[data-shot-skip], [data-screen-fold], [data-hidden-zone], [data-resize-handle]";

export const keep = (node: Node): boolean => !(node instanceof Element && node.matches(SKIPPED));

/** What an image the proxy can't fetch becomes in a shot: a transparent pixel, not a blocked request. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Images from other origins (cover art, Steam logos, a plugin's local image server) can't be read
 * across origins, so they go through the dashboard's image proxy, the same one Now Playing's tint uses.
 * Same-origin and data URLs take the library's own fetch.
 */
export async function fetchForShot(url: string): Promise<string | false> {
  let target: URL;
  try {
    target = new URL(url, location.href);
  } catch {
    return false;
  }
  if (target.origin === location.origin || !/^https?:$/.test(target.protocol)) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${IMAGE_PROXY_URL}?url=${encodeURIComponent(target.href)}`, { signal: abort.signal });
    return res.ok ? await asDataUrl(await res.blob()) : BLANK;
  } catch {
    return BLANK;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A page element as a small WebP data URL. `zoom` is the CSS zoom the element is drawn under (the studio
 * canvas), so the shot is of the page at its design size. Other-origin images go through the image proxy
 * (`fetchForShot`); `<canvas>` content is copied by the library.
 */
export async function captureShot(page: HTMLElement, zoom = 1): Promise<string> {
  const box = page.getBoundingClientRect();
  const width = Math.round(box.width / zoom);
  const height = Math.round(box.height / zoom);
  const background = getComputedStyle(page).getPropertyValue("--background").trim();
  return domToWebp(page, {
    width,
    height,
    scale: Math.min(1, SHOT_WIDTH / width),
    quality: SHOT_QUALITY,
    backgroundColor: background ? `hsl(${background})` : null,
    style: { zoom: "1", margin: "0", outline: "none" },
    filter: keep,
    fetchFn: fetchForShot,
  });
}
