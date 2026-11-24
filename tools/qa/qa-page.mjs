// The page harness the Widget QA tools share (overflow.mjs, adoption.mjs, report.mjs): the server, a page and its settle. Only the
// harness: each tool passes its own viewport, clock and image rule explicitly and keeps its own reading and output, so sharing this
// changes none of them.
import { startScratch } from "../perf/scratch.mjs";

/** One transparent pixel: what an off-site image answers with. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** A scratch server with the debug page on (DASHBOARD_DEBUG=1, fixture data), or `url`: a page already served (Vite dev, the app's debug server). */
export async function startQa({ url } = {}) {
  if (url) return { base: url.replace(/\/$/, ""), stop() {} };
  const scratch = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
  return { base: scratch.base, stop: () => scratch.stop() };
}

/**
 * A page in UTC and en-US at `viewport`. `clock`: a fixed time (reset times and clocks on the fixtures are "now plus", so text
 * would differ per run). `stubImages`: an off-site image answers with a pixel, on every machine (the fixtures' art lives on other
 * hosts: a Steam logo on localhost:39482, loaded or not, changes a widget's text).
 */
export async function openQaPage(browser, { base, viewport, clock, stubImages = false }) {
  const page = await browser.newPage({ viewport, timezoneId: "UTC", locale: "en-US" });
  if (clock) await page.clock.setFixedTime(new Date(clock));
  if (stubImages)
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.resourceType() !== "image" || request.url().startsWith(base)) return route.fallback();
      return route.fulfill({ contentType: "image/png", body: PIXEL });
    });
  return page;
}

/** The page's URL for `params` (a URLSearchParams init), commas kept as written. */
export const qaUrl = (base, params) => `${base}/?widget-qa&${new URLSearchParams(params).toString().replace(/%2C/gi, ",")}`;

/** Waits for the page's tools (`needs`, the globals' names), then mounts every frame (`__qaMountAll`): whether the page settled. */
export async function mountAll(page, { needs = ["__qaMountAll"], timeout = 30_000 } = {}) {
  await page.waitForFunction((names) => names.every((n) => window[n]), needs, { timeout });
  return page.evaluate(() => window.__qaMountAll());
}
