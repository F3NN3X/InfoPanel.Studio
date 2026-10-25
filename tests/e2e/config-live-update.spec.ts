import { expect, manifest, saveConfig, test } from "./fixtures";

// A config save reaches an open kiosk over /events/config within 1.5 s, without a page reload.

interface Placement {
  id: string;
  settings?: Record<string, unknown>;
}
interface Config {
  profiles: { id: string; pages: { placements: Placement[] }[] }[];
}

test("a saved change shows on an open kiosk without a reload", async ({ page, scratch }) => {
  // The save is pushed to the streams open now: note when the kiosk's config stream has connected.
  await page.addInitScript(() => {
    const Native = window.EventSource;
    const flag = window as unknown as { __configStreamOpen: boolean };
    flag.__configStreamOpen = false;
    window.EventSource = class extends Native {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        if (String(url).startsWith("/events/config")) {
          this.addEventListener("open", () => {
            flag.__configStreamOpen = true;
          });
        }
      }
    };
  });
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
  await page.waitForFunction(() => (window as unknown as { __configStreamOpen: boolean }).__configStreamOpen);
  await page.evaluate(() => {
    (window as unknown as { __notReloaded: boolean }).__notReloaded = true;
  });

  const config = (await (await fetch(`${scratch.base}/api/config`)).json()) as Config;
  const light = config.profiles.find((p) => p.id === manifest.profiles.light)!;
  const cpu = light.pages[0].placements.find((p) => p.id === "perf-cpu")!;
  cpu.settings = { ...cpu.settings, label: "Live label" };
  expect((await saveConfig(scratch.base, config)).status).toBe(200);

  await expect(page.getByText("Live label")).toBeVisible({ timeout: 1500 });
  expect(await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded)).toBe(true);
});
