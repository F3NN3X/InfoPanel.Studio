import { FIXTURE_NAMES } from "@/dev/fixtures/types";
import { CHECKS } from "./checks";
import { expect, openFixture, shoot, test } from "./harness";

// The Edit v3 reference states (SPEC §18): each fixture opens in Edit, and its reference checklist waits, skipped with
// the phase that enables it, until that phase builds the UI. A phase turns its lines on in the same change.

/** The fixtures on Desk panel (src/dev/fixtures/one-editor.ts); the others are on Neon Rig. */
const DESK = new Set<string>(["screen", "alt", "export", "layersG"]);

const fixtureTab = (name: string) => (["addw", "hover"].includes(name) ? "Add" : "Layers");

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
      test(check.text, async () => {
        test.skip(true, `Phase ${check.phase} of Edit v3 builds this`);
      });
    }
  });
}
