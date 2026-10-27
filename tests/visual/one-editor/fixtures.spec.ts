import type { Locator, Page } from "@playwright/test";
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

/** A box on Neon Rig's canvas in its own px (800 wide), from the canvas editor's layer. */
async function profileBox(page: Page, part: Locator) {
  const layer = (await page.locator("[data-canvas-edit-layer]").boundingBox())!;
  const b = await part.first().boundingBox();
  const k = 800 / layer.width;
  return b && { x: Math.round((b.x - layer.x) * k), y: Math.round((b.y - layer.y) * k), w: Math.round(b.width * k), h: Math.round(b.height * k) };
}

/** Drag a part by (dx, dy) screen px with Alt held; `during` runs before the release. */
async function altDrag(page: Page, part: Locator, dx: number, dy: number, during?: () => Promise<void>) {
  const b = (await part.boundingBox())!;
  const [x, y] = [b.x + Math.min(10, b.width / 2), b.y + Math.min(10, b.height / 2)];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await during?.();
  await page.mouse.up();
  await page.keyboard.up("Alt");
}

/** The lines built so far, by fixture and line text; each runs on its fixture, opened in Edit. */
const BUILT: Partial<Record<FixtureName, Record<string, (page: Page) => Promise<void>>>> = {
  screen: {
    // The grid's lines are on; a widget dragged onto another stays where it was (Q3: refuse).
    [CHECKS.screen[1].text]: async (page) => {
      await expect(page.locator("[data-cell-lines]")).toBeVisible();
      await expect(page.getByTestId("snap-label")).toHaveText("Snap: cells · Alt frees items");
      const weather = page.locator('[data-zone-id="weather"]');
      const before = (await weather.boundingBox())!;
      await page.mouse.move(before.x + before.width / 2, before.y + 20);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width * 1.6, before.y + 25, { steps: 6 });
      await page.mouse.up();
      expect(await weather.boundingBox()).toEqual(before);
    },
  },
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
    // The canvas editor draws the page's 8 × 5 cells; CPU temp is where the import put it, placed freely.
    [CHECKS.profile[1].text]: async (page) => {
      await expect(page.locator("[data-cell-lines] rect")).toHaveCount(40);
      expect(await profileBox(page, page.locator("[data-selected-path]"))).toEqual({ x: 32, y: 96, w: 224, h: 46 });
      await expect(page.getByTestId("snap-label")).toHaveText("Snap: cells · Alt frees items");
    },
  },
  addw: {
    // A Weather dropped from Add on the Weather already at COL 7 ROW 5 refuses the overlap (Q3) and takes the nearest
    // free cells: on the cell lines, selected, with the picture badge.
    [CHECKS.addw[1].text]: async (page) => {
      const layer = page.locator("[data-canvas-edit-layer]");
      const k = 800 / (await layer.boundingBox())!.width;
      await page.getByRole("option", { name: /^Weather/ }).first().dragTo(layer, { targetPosition: { x: 650 / k, y: 430 / k } });
      const b = (await profileBox(page, page.locator("[data-selected-path]")))!;
      expect([b.x % 100, b.y % 96]).toEqual([0, 0]);
      expect(b.x + b.w <= 600 || b.y + b.h <= 384).toBe(true);
      await expect(page.locator('[data-testid="canvas-badge"][data-status="pic"]')).toHaveCount(2);
    },
  },
  alt: {
    [CHECKS.alt[0].text]: async (page) => {
      const title = page.locator('[data-part-id="title"]');
      await altDrag(page, title, 60, 40, async () => {
        await expect(page.getByTestId("alt-hint")).toHaveText("AltPlacing freely · release Alt to snap to cells");
        await expect(page.locator("[data-cell-lines]")).toHaveCSS("opacity", "0.35");
      });
      await expect(page.getByTestId("alt-hint")).toHaveCount(0);
    },
    [CHECKS.alt[1].text]: async (page) => {
      await altDrag(page, page.locator('[data-part-id="title"]'), 60, 40, async () => {
        await expect(page.getByTestId("alt-readout")).toHaveText(/^X \d+ {2}Y \d+ {2}W 140 {2}H 36 · free$/);
        await expect(page.locator("[data-item-parts] .border-dashed")).toHaveCount(1);
      });
    },
    // Dropped with Alt over the CPU gauge: stored in px (data-free), moved by exactly the drag; then Alt released
    // mid-drag snaps it to a cell's box.
    [CHECKS.alt[2].text]: async (page) => {
      const title = page.locator('[data-part-id="title"]');
      const before = (await title.boundingBox())!;
      await altDrag(page, title, 61, 37);
      await expect(title).toHaveAttribute("data-free", "");
      const after = (await title.boundingBox())!;
      expect([Math.round(after.x - before.x), Math.round(after.y - before.y)]).toEqual([61, 37]);
      const cpu = (await page.locator('[data-zone-id="cpu"]').boundingBox())!;
      expect(after.x > cpu.x && after.y > cpu.y && after.x < cpu.x + cpu.width && after.y < cpu.y + cpu.height).toBe(true);
      await altDrag(page, title, 20, 20, async () => {
        await page.keyboard.up("Alt");
        await expect(page.getByTestId("alt-hint")).toHaveCount(0);
      });
      await expect(title).not.toHaveAttribute("data-free");
    },
    // A widget dragged with Alt: the hint says it stays on the grid, and it lands on free cells (Weather onto Coding
    // agents is refused).
    [CHECKS.alt[3].text]: async (page) => {
      const weather = page.locator('[data-zone-id="weather"]');
      const before = (await weather.boundingBox())!;
      await altDrag(page, weather, before.width * 1.2, 7, async () => {
        await expect(page.getByTestId("alt-hint")).toHaveText("AltWidgets always sit on the grid");
      });
      expect(await weather.boundingBox()).toEqual(before);
    },
    [CHECKS.alt[5].text]: async (page) => {
      const title = page.locator('[data-part-id="title"]');
      await title.click();
      const at = async () => (await title.boundingBox())!;
      const zoom = (await page.locator("[data-studio-page]").boundingBox())!.width / 1024;
      let b = await at();
      await page.keyboard.press("Alt+ArrowRight");
      expect(Math.round(((await at()).x - b.x) / zoom)).toBe(1);
      b = await at();
      await page.keyboard.press("Alt+Shift+ArrowDown");
      expect(Math.round(((await at()).y - b.y) / zoom)).toBe(10);
      b = await at();
      await page.keyboard.press("ArrowRight");
      // A cell of the 4 × 3 page is 256 px wide.
      expect(Math.round(((await at()).x - b.x) / zoom)).toBe(256);
    },
  },
  layersG: {
    [CHECKS.layersG[2].text]: async (page) => {
      const glow = page.locator('[data-part-id="glow"]');
      await expect(glow).not.toHaveAttribute("data-free");
      await expect(page.locator('[data-part-id="title"]')).toHaveAttribute("data-free", "");
      // Columns 1–2 of row 1: the CPU gauge's top half.
      const cpu = (await page.locator('[data-zone-id="cpu"]').boundingBox())!;
      const g = (await glow.boundingBox())!;
      expect([Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.height * 2)]).toEqual([Math.round(cpu.x), Math.round(cpu.y), Math.round(cpu.width), Math.round(cpu.height)]);
    },
    [CHECKS.layersG[4].text]: async (page) => {
      const zones = await page.locator("[data-zone-id]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
      const overlap = (a: (typeof zones)[0], b: (typeof zones)[0]) => a.x + 1 < b.x + b.w && b.x + 1 < a.x + a.w && a.y + 1 < b.y + b.h && b.y + 1 < a.y + a.h;
      expect(zones.some((a, i) => zones.some((b, j) => i !== j && overlap(a, b)))).toBe(false);
      const title = (await page.locator('[data-part-id="title"]').boundingBox())!;
      expect(zones.some((z) => overlap(z, { x: title.x, y: title.y, w: title.width, h: title.height }))).toBe(true);
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
