import type { Page } from "@playwright/test";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The Widget QA page's widget list (src/widgets/widget-qa/WidgetList.tsx), its left column: the search, the filter chips, the app
// surfaces and galleries entries, the widgets by category with their status dots, and the keys. It took over the row under the top
// bar (the filter box, Theme flags only, Notes only, the jump list and the category links), and each control moves the URL param
// it always did (params.ts is frozen; `issues` is new). The list is the page's own chrome: no worn Look reaches it.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const SOME = "module=CpuMonitor,Clock,GpuMonitor,Weather,NowPlaying,FramePacing&spans=2x1";
const open = async (page: Page, query = SOME) => {
  await page.goto(`${qa.base}/?widget-qa&${query}`);
  await page.waitForFunction(() => window.__qa);
};
const param = (k: string, v: string) => new RegExp(`[?&]${k}=${v}(&|#|$)`);
const noParam = (k: string) => new RegExp(`^(?!.*[?&]${k}=)`);
const list = (page: Page) => page.locator('aside[aria-label="Widget list"]');
const row = (page: Page, id: string) => list(page).locator(`[data-qa-row="${id}"]`);
const current = (page: Page) => list(page).locator('[data-qa-row][aria-current="true"]');

test("the search: / focuses it, it filters the list and the frames, and its text is q=", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.locator("body").press("/");
  const search = list(page).getByRole("textbox", { name: "Filter id or title" });
  await expect(search).toBeFocused();
  await page.keyboard.type("clo");
  await expect(page).toHaveURL(param("q", "clo"));
  await expect(list(page).locator("[data-qa-row]").filter({ visible: true })).toHaveCount(1);
  await expect(list(page).locator("[data-qa-row]").filter({ visible: true })).toHaveAttribute("data-qa-row", "Clock");
  await expect(page.locator("section[id]")).toHaveCount(1);
  // a search with no match says so and offers the way back
  await search.fill("nothing-matches");
  await expect(list(page).getByRole("status")).toContainText("No widget matches “nothing-matches”");
  await list(page).getByRole("button", { name: "Clear the search and filters" }).click();
  await expect(page).toHaveURL(noParam("q"));
  await expect(page.locator("section[id]")).toHaveCount(6);
});

test("the filter chips: Issues, Notes, and Theme flags while a Look is worn", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, `${SOME}&eager=1`);
  const chip = (name: string) => list(page).getByRole("button", { name, exact: true });
  await expect(chip("Theme flags")).toHaveCount(0);
  await chip("Notes").click();
  await expect(page).toHaveURL(param("noted", "1"));
  await expect(chip("Notes")).toHaveAttribute("aria-pressed", "true");
  await chip("Notes").click();
  await expect(page).toHaveURL(noParam("noted"));
  // Issues hides each widget whose checked frames all came back clean, in the frames and in the list alike
  expect(await page.evaluate(() => window.__qaMountAll?.())).toBe(true);
  await chip("Issues").click();
  await expect(page).toHaveURL(param("issues", "1"));
  const mismatched = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("section[id]")]
        .filter((s) => {
          const issues = [...s.querySelectorAll("figcaption span")].some((b) => /^\d+ issues?$/.test(b.textContent ?? ""));
          const listed = !document.querySelector(`[data-qa-row="${s.id}"]`)?.closest("li")?.hidden;
          return !s.closest("[hidden]") !== issues || listed !== issues;
        })
        .map((s) => s.id),
    );
  await expect.poll(mismatched).toEqual([]);
  // fixture data leaves most of these clean, so the filter hides some
  expect(await page.locator("section[id]").filter({ visible: true }).count()).toBeLessThan(6);
  await chip("Issues").click();
  await expect(page).toHaveURL(noParam("issues"));
  await expect(page.locator("section[id]").filter({ visible: true })).toHaveCount(6);
  // under a worn Look the theme check runs, and the chip is the summary's flags count
  await open(page, "module=CpuMonitor&spans=2x1&look=cyberspec");
  await chip("Theme flags").click();
  await expect(page).toHaveURL(param("flagged", "1"));
  await expect(page.locator("main > header").getByRole("button", { name: /theme flags?$/ })).toHaveAttribute("aria-pressed", "true");
});

test("rows: a click scrolls to the widget and makes it current, j and k move it, a heading folds its group", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await row(page, "Weather").click();
  await expect(current(page)).toHaveAttribute("data-qa-row", "Weather");
  await expect(page.locator("section#Weather")).toBeInViewport();
  // and opens it in the inspector, its widget part
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByText("Weather", { exact: true }).last()).toBeVisible();
  const order = await list(page).locator("[data-qa-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-qa-row")));
  const at = order.indexOf("Weather");
  await page.locator("body").press("j");
  await expect(current(page)).toHaveAttribute("data-qa-row", order[at + 1]!);
  await expect(page.locator(`section[id="${order[at + 1]}"]`)).toBeInViewport();
  await expect(inspector.getByText(order[at + 1]!, { exact: true }).last()).toBeVisible();
  await page.locator("body").press("k");
  await page.locator("body").press("k");
  await expect(current(page)).toHaveAttribute("data-qa-row", order[at - 1]!);
  // keys typed into a field are the field's
  await list(page).getByRole("textbox", { name: "Filter id or title" }).focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(param("q", "j"));
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  // a folded group hides its rows and j skips them
  const group = list(page).getByRole("button", { name: /^Hardware\b/ });
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "CpuMonitor")).toBeHidden();
  await group.click();
  await expect(row(page, "CpuMonitor")).toBeVisible();
});

test("the merged-away widgets are listed last, in their own group, each naming the widget it merged into", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  const groups = list(page).locator("button[aria-expanded]");
  await expect(groups.last()).toHaveText(/^Merged away\s*1$/);
  await expect(row(page, "FramePacing")).toContainText("Frame Pacing");
  await expect(row(page, "FramePacing")).toContainText("→ FPS Monitor");
});

test("App surfaces and Skins & surfaces: drawn after the widgets, reached from the list", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page, "spans=2x1");
  // the surfaces stay first in the DOM (the adoption reports keep document order) and are painted after the widgets
  const y = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  const lastSection = await page.locator("section[id]").last().evaluate((e) => e.getBoundingClientRect().bottom + window.scrollY);
  expect(await y("#surfaces")).toBeGreaterThanOrEqual(lastSection);
  expect(await page.evaluate(() => !!(document.querySelector("#surfaces")!.compareDocumentPosition(document.querySelector("section[id]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await list(page).getByRole("link", { name: /^App surfaces/ }).click();
  await expect(page.locator("#surfaces")).toBeInViewport();
  // the galleries open for the current widget
  await row(page, "Clock").click();
  await list(page).getByRole("button", { name: /^Skins & surfaces/ }).click();
  await expect(page).toHaveURL(param("gallery", "Clock"));
  await expect(page.locator("#galleries")).toBeInViewport();
  await expect(page.locator('figure[data-qa-gallery="Skins"]').first()).toBeVisible();
  // with the surfaces off, the entry turns them back on
  await open(page, "spans=2x1&surfaces=0");
  await list(page).getByRole("button", { name: /^App surfaces/ }).click();
  await expect(page).toHaveURL(noParam("surfaces"));
  await expect(page.locator("#surfaces")).toBeAttached();
});

test("the list is the page's own chrome: no worn Look or page background reaches it", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "module=CpuMonitor&spans=2x1");
  const bg = () => list(page).evaluate((a) => getComputedStyle(a).backgroundColor);
  const before = await bg();
  await open(page, "module=CpuMonitor&spans=2x1&look=cyberspec&lookVariant=crimson&theme=paper");
  await expect(page.locator('[data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
  expect(await list(page).evaluate((a) => !a.closest("[data-look]") && !a.querySelector("[data-look]") && !a.contains(document.querySelector("[data-qa-box]")))).toBe(true);
  expect(await bg()).toBe(before);
});
