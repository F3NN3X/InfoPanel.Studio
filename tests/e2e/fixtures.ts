import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { startScratch, FIXTURE_DIR, type Scratch } from "../../tools/perf/scratch.mjs";

/** tests/fixtures/perf/fixture.json: the fixture's profile and zone ids (tools/perf/make-fixture.mjs). */
export interface FixtureManifest {
  profiles: { heavy: string; light: string };
  zones: { heavy: string[]; light: string[] };
  gaugeIconZone: string;
  /** Studio zones (`data-zone-id`). */
  zoneSelector: string;
  /** Kiosk zones, in placement order (the kiosk marks none). */
  kioskZoneSelector: string;
  sensorKeys: string[];
  configVersion: number;
}

export const manifest: FixtureManifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "..", "fixture.json"), "utf8"));

/** Each test gets its own scratch server, so a spec that saves the config can't leak into another. */
export const test = base.extend<{ scratch: Scratch }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this destructuring.
  scratch: async ({}, use) => {
    const scratch = await startScratch();
    await use(scratch);
    scratch.stop();
  },
});

export { expect };

/** Collect console errors and failed requests from a page (the kiosk must load clean). */
export function watchErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    // An EventSource closed by navigation or teardown reports as aborted; that is not a load failure.
    if (req.failure()?.errorText === "net::ERR_ABORTED") return;
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });
  return { errors };
}

/** POST a whole config the way the studio does (the write header `configWriteRefusal` asks for). */
export async function saveConfig(base: string, config: unknown): Promise<Response> {
  return fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-config": "1" },
    body: JSON.stringify(config),
  });
}
