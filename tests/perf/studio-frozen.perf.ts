import { test } from "../e2e/fixtures";
import { measurePage, openDesign, type PageRun, type Sample, STUDIO_READY, writeResult } from "./measure";

// The frozen Design preview (src/lib/preview-data.ts) against live: Design on the heavy profile, the studio-idle
// metrics plus the bytes the page receives a minute (the Data API streams). The setting is set before load, as a
// returning user's would be.

const withPreview = (mode: string) => `localStorage.setItem("studio.previewData", ${JSON.stringify(mode)});`;

/** Bytes received a minute over the window, every request (the SSE streams never finish, so per chunk). */
async function bytesPerMinute({ cdp }: PageRun, windowMs: number): Promise<Sample> {
  let bytes = 0;
  const onData = (e: { encodedDataLength: number }) => {
    bytes += e.encodedDataLength;
  };
  cdp.on("Network.dataReceived", onData);
  await new Promise((r) => setTimeout(r, windowMs));
  cdp.off("Network.dataReceived", onData);
  return { networkKBPerMin: (bytes / 1024) * (60_000 / windowMs) };
}

test("studio-frozen", async ({ browser, scratch }, info) => {
  const viewport = info.project.use.viewport ?? { width: 1440, height: 860 };
  const url = `${scratch.base}/?studio=1`;
  // Screens (where the studio opens) is live; its streams close 2 s after Design replaces it, inside the warm-up.
  const live = await measurePage(browser, url, STUDIO_READY, viewport, openDesign, [withPreview("live")], bytesPerMinute);
  const frozen = await measurePage(browser, url, STUDIO_READY, viewport, openDesign, [withPreview("frozen")], bytesPerMinute);
  writeResult("studio-frozen", { cases: { live, frozen } });
});
