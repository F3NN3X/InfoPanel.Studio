import { expect, manifest, test } from "./fixtures";

// A page switch through /api/control moves an open kiosk within 1.5 s (/events/control).

test("a control page switch moves an open kiosk", async ({ page, scratch }) => {
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
  await expect(page.getByText("Second page")).toHaveCount(0);

  const res = await fetch(`${scratch.base}/api/control/page`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-control": "1" },
    body: JSON.stringify({ profile: manifest.profiles.light, page: "second" }),
  });
  expect(res.status).toBe(200);
  await expect(page.getByText("Second page")).toBeVisible({ timeout: 1500 });
});
