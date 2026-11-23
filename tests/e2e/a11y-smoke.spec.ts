import fs from "node:fs";
import path from "node:path";
import type AxeBuilder from "@axe-core/playwright";
import { expect, manifest, test } from "./fixtures";

// axe on the kiosk and the studio's views: no serious or critical WCAG A/AA violation beyond the ones each view is known
// to have today (measured 2026-11-22, Gate 1). A rule that newly fails anywhere fails the spec; fixing one means taking it
// off its view's list, never adding to a list to get to green (AGENTS.md). Automated checks find only some issues.
// The Gauges view is left out: axe's run there fails in Playwright's newPage (Target.createTarget), not on a rule.

/** The serious and critical rules each view fails today: accessibility debt, to shrink. */
const KNOWN: Record<string, string[]> = {
  Screens: ["label-content-name-mismatch", "target-size"],
  Edit: ["aria-required-children", "aria-required-parent", "label-content-name-mismatch", "nested-interactive", "target-size"],
  Theme: ["label-content-name-mismatch"],
  Library: ["aria-required-children", "label-content-name-mismatch", "target-size"],
  Widgets: ["label-content-name-mismatch"],
  "Alerts & Island": ["label-content-name-mismatch"],
  "Data sources": ["label-content-name-mismatch", "nested-interactive", "target-size"],
};

/** The ids of the serious and critical rules the page fails now. */
async function seriousRules(makeAxeBuilder: () => AxeBuilder): Promise<string[]> {
  const { violations } = await makeAxeBuilder().analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test("the kiosk has no serious or critical violation", async ({ page, scratch, makeAxeBuilder }) => {
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.heavy}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.heavy.length);
  expect(await seriousRules(makeAxeBuilder)).toEqual([]);
});

for (const [view, known] of Object.entries(KNOWN)) {
  test(`studio ${view}: no serious or critical violation beyond the known ones`, async ({ page, scratch, makeAxeBuilder }) => {
    const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
    await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
    await page.goto(`${scratch.base}/?studio=1`);
    const nav = page.getByRole("navigation", { name: "Studio views" });
    const button = nav.getByRole("button", view === "Edit" ? { name: /^Edit / } : { name: view, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await page.evaluate(() => document.fonts.ready);
    expect((await seriousRules(makeAxeBuilder)).filter((id) => !known.includes(id))).toEqual([]);
  });
}
