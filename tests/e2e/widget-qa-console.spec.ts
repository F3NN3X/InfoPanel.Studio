import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The Widget QA page's console namespace (`window.__qa`, src/widgets/widget-qa/console.ts) is what an agent drives the page with,
// and tools/qa/report.mjs prints its report: the six `__qa*` globals stay the same functions, the report reads the frames, Copy for
// Claude names a frame as the formatter does (tests/widgets/widget-qa/claude.test.ts), and `set` moves the URL as the toolbar does.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

test("window.__qa keeps the six globals, reports the frames and copies one for Claude", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${qa.base}/?widget-qa&module=CpuMonitor&spans=2x1,4x2`);
  await page.waitForFunction(() => window.__qa && window.__qaMountAll);
  const same = await page.evaluate(() => {
    const q = window.__qa!;
    return [q.overflow === window.__qaOverflow, q.mountAll === window.__qaMountAll, q.snapshot === window.__qaSnapshot, q.adoption === window.__qaAdoption, q.setLook === window.__qaSetLook, q.roundTrip === window.__qaRoundTrip];
  });
  expect(same).toEqual([true, true, true, true, true, true]);
  expect(await page.evaluate(() => window.__qa!.help())).toContain("copyForClaude(target)");
  // the skin list a tool reads without opening the top bar's Overrides popover is the popover's own
  const skins = await page.evaluate(() => window.__qa!.options().skins);
  await page.locator("main > header").getByRole("button", { name: /^Overrides/ }).click();
  const offered = (await page.getByRole("dialog").getByRole("combobox", { name: "Skin", exact: true }).locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean);
  await page.keyboard.press("Escape");
  expect(skins).toEqual(offered);

  const report = await page.evaluate(() => window.__qa!.report({ all: true }));
  expect(report.summary.checked).toBe(report.summary.frames);
  expect(report.frames.filter((f) => f.kind === "span").map((f) => `${f.frame} ${f.size.join("x")}`)).toEqual(["CpuMonitor 2x1 228x110", "CpuMonitor 4x2 464x228"]);

  const text = await page.evaluate(() => window.__qa!.copyForClaude("CpuMonitor 2x1"));
  expect(text.split("\n").slice(0, 3)).toEqual(["Widget QA · CpuMonitor 2x1 (cell 110, skin default)", `Link: ${qa.base}/?widget-qa&module=CpuMonitor&spans=2x1,4x2#CpuMonitor--2x1`, "Files: src/widgets/cpu-monitor/ (widget.ts, meta.ts, CpuMonitor.tsx, README.md)"]);
  // the widget's own button copies what its mounted frames found
  await page.locator("#CpuMonitor").getByRole("button", { name: "for Claude" }).click();
  await expect(page.locator("#CpuMonitor").getByRole("button", { name: "copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Widget QA · widget CpuMonitor · 1 widget · /);

  await page.evaluate(() => window.__qa!.set({ cell: 150 }));
  await expect(page).toHaveURL(/[?&]cell=150(&|#|$)/);
  expect(await page.evaluate(() => window.__qa!.state().cell)).toBe(150);
});
