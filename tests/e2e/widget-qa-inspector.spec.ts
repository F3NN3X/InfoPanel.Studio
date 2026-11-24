import type { Page } from "@playwright/test";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The Widget QA page's frames and inspector (src/widgets/widget-qa/Section.tsx, SectionHead.tsx, Focus.tsx, inspector/): each widget's
// one-line header, the sizes under its minimum hidden behind one line (below=1 shows them), a click that selects a frame and opens the
// inspector (its issues, outlined in the frame on hover, its flags, note and copy actions, then what the info column held), the frame's
// hover menu, and focus mode (focus=<id>, Esc leaves it). The frames themselves draw as before: the chrome is outside every box.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const open = async (page: Page, query: string) => {
  await page.goto(`${qa.base}/?widget-qa&${query}`);
  await page.waitForFunction(() => window.__qa);
};
const param = (k: string, v: string) => new RegExp(`[?&]${k}=${v}(&|#|$)`);
const noParam = (k: string) => new RegExp(`^(?!.*[?&]${k}=)`);
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
// the system clipboard gives Windows line ends back
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"));

test("a widget's header, and the sizes under its minimum behind one line (below=1, Grid)", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Bluetooth's minimum is 2x1: 1x1 and 1x2 are under it
  await open(page, "module=Bluetooth&spans=1x1,2x1,1x2");
  const section = page.locator("section#Bluetooth");
  const head = section.locator("[data-qa-ui]").first();
  await expect(head.getByRole("button", { name: "Bluetooth", exact: true })).toBeVisible();
  expect(await head.getByRole("link", { name: "Solo" }).getAttribute("href")).toMatch(/module=Bluetooth/);
  await head.getByRole("button", { name: "Copy link" }).click();
  await expect(head.getByRole("button", { name: "copied" })).toBeVisible();
  expect(await clipboard(page)).toBe(`${page.url().split("#")[0]}#Bluetooth`);
  // the two sizes under the minimum are one line, not placeholders; the line shows them
  await expect(section.locator("[data-qa-below]")).toHaveCount(0);
  await section.getByRole("button", { name: "2 sizes under the minimum (2x1)" }).click();
  await expect(page).toHaveURL(param("below", "1"));
  await expect(section.locator("[data-qa-below]")).toHaveCount(2);
  await expect(section.getByRole("button", { name: /under the minimum/ })).toHaveCount(0);
  // and Grid's switch hides them again
  await page.locator("main > header").getByRole("button", { name: /^Grid/ }).click();
  await page.getByRole("dialog").getByRole("switch", { name: "Show sizes under the minimum" }).click();
  await expect(page).toHaveURL(noParam("below"));
  await expect(section.locator("[data-qa-below]")).toHaveCount(0);
});

test("a click selects a frame: the inspector lists its issue, outlines it on hover and copies the frame", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // one element that pokes out of the 2x1 frame, put in before the frame settles and probes itself
  await page.addInitScript(() => {
    const mo = new MutationObserver(() => {
      const box = document.querySelector('#CpuMonitor--2x1 [data-qa-box]');
      if (!box?.firstElementChild) return;
      mo.disconnect();
      const wide = document.createElement("div");
      wide.className = "qa-test-wide";
      Object.assign(wide.style, { position: "absolute", left: "0", top: "0", width: "400px", height: "4px" });
      box.append(wide);
    });
    mo.observe(document, { childList: true, subtree: true });
  });
  await open(page, "module=CpuMonitor&spans=2x1,4x2");
  const frame = page.locator("#CpuMonitor--2x1");
  await expect(frame.locator("figcaption")).toContainText("1 issue", { timeout: 15_000 });
  await expect(page.locator("section#CpuMonitor [data-qa-ui]").first()).toContainText("1 issue");
  await expect(inspector(page)).toHaveCount(0);
  await frame.locator("[data-qa-box]").click();
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "CpuMonitor 2x1" })).toBeVisible();
  const issues = panel.getByRole("group", { name: "Issues" });
  await expect(issues.getByRole("button")).toHaveCount(1);
  await expect(issues).toContainText("Pokes out");
  // hovering the issue outlines its element inside the frame, beside the box and never in it
  await issues.getByRole("button").hover();
  await expect(frame.locator("[data-qa-highlight]")).toHaveCount(1);
  await expect(frame.locator("[data-qa-box] [data-qa-highlight]")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(frame.locator("[data-qa-highlight]")).toHaveCount(0);
  await panel.getByRole("button", { name: "Copy reference" }).click();
  expect(await clipboard(page)).toBe(`CpuMonitor 2x1 (cell 110, skin default)\n${qa.base}/?widget-qa&module=CpuMonitor&spans=2x1,4x2#CpuMonitor--2x1`);
  // what the info column held: the widget's files as paths, and its settings, searchable
  await expect(panel.getByRole("group", { name: "Files" })).toContainText("src/widgets/cpu-monitor/CpuMonitor.tsx");
  const settings = panel.getByRole("group", { name: "Settings" });
  await settings.getByRole("textbox", { name: "Search settings" }).fill("zzz-none");
  await expect(settings).toContainText("None match.");
  // Esc closes it (not while typing in a field)
  await settings.getByRole("textbox", { name: "Search settings" }).blur();
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);

  // the frame's hover menu copies its reference too, and `c` on its caption does
  const wide = page.locator("#CpuMonitor--4x2");
  await wide.locator("[data-qa-box]").hover();
  await wide.getByRole("button", { name: "Frame menu: CpuMonitor 4x2" }).click();
  await page.getByRole("menuitem", { name: "Copy reference" }).click();
  await expect.poll(() => clipboard(page)).toMatch(/^CpuMonitor 4x2 \(cell 110, skin default\)\n/);
  await frame.locator("figcaption button").first().focus();
  await page.keyboard.press("c");
  await expect(frame.locator("figcaption")).toContainText("copied");
  expect(await clipboard(page)).toMatch(/^CpuMonitor 2x1 \(cell 110, skin default\)\n/);
  // `__qa.select` opens the inspector at the frame it names
  await page.evaluate(() => window.__qa!.select("CpuMonitor 4x2"));
  await expect(inspector(page).getByRole("heading", { name: "CpuMonitor 4x2" })).toBeVisible();
});

test("focus mode: one widget, a strip that steps its frame through the sizes, its galleries inline; Esc leaves", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "module=CpuMonitor,Clock&spans=2x1,4x2");
  await expect(page.locator("section[id]")).toHaveCount(2);
  await page.locator("section#CpuMonitor").getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page).toHaveURL(param("focus", "CpuMonitor"));
  await expect(page.locator("section[id]")).toHaveCount(1);
  const section = page.locator("section#CpuMonitor");
  await expect(section.locator("figure[data-qa-gallery]").first()).toBeVisible();
  const strip = section.getByRole("radiogroup", { name: "Size" });
  await strip.getByRole("radio", { name: "4x2" }).click();
  await expect(section.locator("figure[data-qa-span]")).toHaveCount(1);
  await expect(section.locator('figure[data-qa-span="4x2"]')).toHaveCount(1);
  await expect(inspector(page).getByRole("heading", { name: "CpuMonitor 4x2" })).toBeVisible();
  // › from the last size goes round to the first
  await section.getByRole("button", { name: "Next size" }).click();
  await expect(section.locator('figure[data-qa-span="2x1"]')).toHaveCount(1);
  await strip.getByRole("radio", { name: "All" }).click();
  await expect(section.locator("figure[data-qa-span]")).toHaveCount(2);
  await page.locator("body").press("Escape");
  await expect(page).toHaveURL(noParam("focus"));
  await expect(page.locator("section[id]")).toHaveCount(2);
  await expect(page.locator("section#CpuMonitor figure[data-qa-gallery]")).toHaveCount(0);
});

test("a surface selects as a frame with no widget, and the inspector keeps its own colours under a worn Look", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "spans=2x1&look=cyberspec");
  await page.locator('[data-qa-surface="toast"] [data-qa-box]').click();
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "surface:toast" })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Theme flags" })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Issues" })).toHaveCount(0);
  await expect(page.locator('[data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
  expect(await panel.evaluate((a) => !a.closest("[data-look]") && !a.querySelector("[data-look], [data-qa-box]"))).toBe(true);
});
