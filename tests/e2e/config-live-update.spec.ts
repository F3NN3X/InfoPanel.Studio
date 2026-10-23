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
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
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
