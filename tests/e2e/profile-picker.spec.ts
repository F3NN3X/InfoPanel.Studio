import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// The profile picker on the kiosk (pinned layer P4): holding the rail's profile chip opens it beside the rail, with the
// profiles of this panel's size and their rules. Picking one moves the kiosk to it through the control channel's
// override; the lock pauses auto-switch and the switch turns it back on. The rule names a program that is never in front,
// so the server's own reading of this machine's front app can't move the panel during the test.

const W = 1024;
const H = 600;
const zone = (id: string) => ({ id, module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true });
const screen = (id: string, name: string, width: number, extra: object = {}) => ({
  id,
  name,
  width,
  height: H,
  cols: 2,
  rows: 2,
  fit: "fill",
  padding: 12,
  gap: 12,
  pages: [{ id: `${id}-p`, name: `${name} page`, placements: [zone(`${id}-z`)] }],
  pinned: { items: [{ id: "rail", edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: `${id}-rail`, module: "PageRail" } }] },
  ...extra,
});
const config = {
  version: 21,
  activeProfile: "desk",
  profiles: [
    screen("desk", "Desk", W),
    screen("coding", "Coding", W, { autoSwitch: { exe: ["ips-e2e-never.exe"] } }),
    screen("bar", "Bar", 1920),
  ],
};

test("holding the profile chip opens the picker, which switches, locks and resumes", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  const control = async () => (await (await fetch(`${scratch.base}/api/control`)).json()) as { profile: string | null; autoPaused?: boolean };
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1`);
  await settled(page, "[data-page-grid] > *, [data-pinned-item] [data-rail-slot]");

  const chip = page.getByRole("button", { name: "Profile: Desk" });
  const r = (await chip.boundingBox())!;
  expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  // a hold of 600 ms opens it
  await chip.hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const picker = page.getByRole("dialog", { name: "Profiles" });
  await expect(picker).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  // beside the rail, 12 px off it and the top; the 1920 bar is another size and is not listed
  const box = (await picker.boundingBox())!;
  expect([Math.round(box.x), Math.round(box.y), Math.round(box.width)]).toEqual([84 + 12, 12, 520]);
  await expect(picker.locator("li button")).toHaveText([/^DeskDefault · 1 pageCurrent/, /^CodingAuto: ips-e2e-never\.exe/]);
  await expect(picker.locator("li button[aria-current='true']")).toBeFocused();

  // a pick moves the kiosk through the override
  await picker.getByRole("button", { name: /^Coding/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Profile: Coding" })).toBeVisible();
  expect((await control()).profile).toBe("coding");

  // the lock pauses auto-switch on the profile shown; the switch resumes it
  await page.getByRole("button", { name: "Profile: Coding" }).click();
  await page.getByRole("button", { name: "Lock to Coding" }).click();
  await expect(page.getByRole("button", { name: "Locked to Coding" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("switch", { name: "Switch with the app in front" })).toHaveAttribute("aria-checked", "false");
  expect(await control()).toMatchObject({ profile: "coding", autoPaused: true });
  await page.getByRole("switch", { name: "Switch with the app in front" }).click();
  await expect(page.getByRole("switch", { name: "Switch with the app in front" })).toHaveAttribute("aria-checked", "true");
  expect((await control()).autoPaused).toBeUndefined();

  // Escape closes it and gives the chip its focus back
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Profile: Coding" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("a kiosk link that pins its profile keeps the chip a label", async ({ page, scratch }) => {
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-page-grid] > *, [data-pinned-item] [data-rail-slot]");
  await expect(page.getByRole("img", { name: "Profile: Desk" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Profile: Desk" })).toHaveCount(0);
});
