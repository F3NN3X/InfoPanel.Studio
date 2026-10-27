import type { Page } from "@playwright/test";
import { FIXTURE_NAMES, type FixtureName } from "@/dev/fixtures/types";
import { CHECKS } from "./checks";
import { expect, openFixture, shoot, test } from "./harness";

// The Edit v3 reference states (SPEC §18): each fixture opens in Edit, and its reference checklist waits, skipped with
// the phase that enables it, until that phase builds the UI. A phase turns its lines on in the same change.

/** The fixtures on Desk panel (src/dev/fixtures/one-editor.ts); the others are on Neon Rig. */
const DESK = new Set<string>(["screen", "alt", "export", "layersG"]);

const fixtureTab = (name: string) => (["addw", "hover"].includes(name) ? "Add" : "Layers");

/** Open the Export check from its pill. Desk panel's: CPU and GPU gauge and Weather become pictures, Clock exports as is, Coding agents is left out. */
async function openExportCheck(page: Page) {
  await page.getByTestId("export-pill").click();
  const panel = page.getByTestId("export-check");
  await expect(panel).toBeVisible();
  return panel;
}

/** The lines built so far, by fixture and line text; each runs on its fixture, opened in Edit. */
const BUILT: Partial<Record<FixtureName, Record<string, (page: Page) => Promise<void>>>> = {
  profile: {
    [CHECKS.profile[0].text]: async (page) => {
      await expect(page.locator("header").getByText("Imported from InfoPanel", { exact: true })).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Pages" })).toBeVisible();
      await expect(page.getByTestId("made-for")).toContainText("InfoPanel too");
    },
    // NEON RIG has letter spacing (studio-only, v15 `$.letterSpacing`): approximated, every other part as is.
    [CHECKS.profile[3].text]: async (page) => {
      await expect(page.getByTestId("export-pill")).toHaveText("Export check7 as is1 approximated");
      await expect(page.getByTestId("canvas-badge")).toHaveCount(8);
      await expect(page.locator('[data-testid="canvas-badge"][data-status="ok"]')).toHaveCount(7);
      await expect(page.locator('[data-testid="canvas-badge"][data-status="approx"]')).toHaveCount(1);
    },
  },
  export: {
    [CHECKS.export[0].text]: async (page) => {
      await expect(page.getByTestId("made-for")).toContainText("InfoPanel too");
      await expect(page.getByTestId("export-pill")).toHaveText("Export check1 as is3 becomes a picture1 left out");
      await expect(page.getByTestId("canvas-badge")).toHaveCount(5);
    },
    [CHECKS.export[1].text]: async (page) => {
      const panel = await openExportCheck(page);
      await expect(panel.getByText("Live", { exact: true })).toBeVisible();
      await expect(panel.getByRole("region")).toHaveText([/^Left out · 1/, /^Becomes a picture · 3/, /^Exports as is · 1/]);
      await shoot(page, "export-open");
    },
    [CHECKS.export[2].text]: async (page) => {
      const panel = await openExportCheck(page);
      await expect(panel.getByText("This page will be converted when you export.")).toBeVisible();
      await expect(panel.getByRole("button", { name: "Review conversion…" })).toBeVisible();
    },
    [CHECKS.export[3].text]: async (page) => {
      let panel = await openExportCheck(page);
      await panel.getByRole("button", { name: /^Coding Agents/ }).click();
      await expect(panel).toBeHidden();
      await expect(page.locator('[data-zone-id="agents"] > .border-ui-accent')).toHaveCount(1);
      panel = await openExportCheck(page);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    },
    [CHECKS.export[4].text]: async (page) => {
      const panel = await openExportCheck(page);
      await expect(panel.getByRole("button", { name: "Export .infopanel" })).toBeVisible();
      await expect(panel.getByText("Export writes a copy. Your screen isn’t changed.")).toBeVisible();
    },
  },
};

// SPEC §19 test 21: Made for Studio panels hides the pill, every badge and the On InfoPanel lines (Weather is selected).
test("one-editor/screen: Made for Studio panels shows no Export check", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await expect(page.locator("[data-zone-id]")).toHaveCount(5);
  await expect(page.locator("header").getByText("Screen", { exact: true })).toBeVisible();
  await expect(page.getByTestId("made-for")).toContainText("Studio panels");
  await expect(page.getByText("Studio panels only · no export check")).toBeVisible();
  await expect(page.getByTestId("export-pill")).toHaveCount(0);
  await expect(page.getByTestId("canvas-badge")).toHaveCount(0);
  await expect(page.getByTestId("on-infopanel")).toHaveCount(0);
});

for (const name of FIXTURE_NAMES) {
  test.describe(`one-editor/${name}`, () => {
    test("opens in Edit with its content", async ({ page, scratch }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await openFixture(page, scratch.base, name);
      // Desk panel (a grid page) draws a zone per widget; Neon Rig (a Free page) opens its canvas editor, with the left panel on the fixture's tab.
      if (DESK.has(name)) await expect(page.locator("[data-zone-id]")).toHaveCount(5);
      else await expect(page.getByRole("radiogroup", { name: "Left panel" })).toBeVisible();
      await expect(page.getByRole("radio", { name: fixtureTab(name) })).toBeChecked();
      await page.waitForTimeout(500);
      await shoot(page, name);
      expect(errors).toEqual([]);
    });

    for (const check of CHECKS[name]) {
      const built = BUILT[name]?.[check.text];
      if (built) {
        test(check.text, async ({ page, scratch }) => {
          await openFixture(page, scratch.base, name);
          await built(page);
        });
        continue;
      }
      test(check.text, async () => {
        test.skip(true, `Phase ${check.phase} of Edit v3 builds this`);
      });
    }
  });
}
