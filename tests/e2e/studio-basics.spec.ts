import fs from "node:fs";
import path from "node:path";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// The studio loads, Design shows the fixture's zones, an inspector edit saves with Ctrl+S, and undo reverts it. B28: a recipe's
// zone resizes no smaller than the recipe's Smallest, and past its Largest the inspector says so without clamping (D5).

test("Design: select, edit, save and undo", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  // A returning browser: its local copy (src/lib/layout.ts) already names the fake Data API. A fresh one renders
  // the defaults, and reaches for the default Data API, until the server's config arrives.
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  // Six zones; the seventh, a free area, is a group of InfoPanel items since v15 (Edit v3), drawn as one items layer.
  await expect(page.locator("[data-zone-id]")).toHaveCount(6);
  await expect(page.locator("[data-items-layer]")).toHaveCount(1);

  await page.locator('[data-zone-id="perf-statusbar"]').click();
  const name = page.getByLabel("Widget name");
  await name.fill("Edited zone");
  await name.press("Enter");
  await page.keyboard.press("Control+s");

  await expect
    .poll(async () => (await (await fetch(`${scratch.base}/api/config`)).text()).includes("Edited zone"), { timeout: 5000 })
    .toBe(true);

  // Undo (outside the text field, so it is the studio's history, not the input's).
  await page.locator('[data-zone-id="perf-statusbar"]').click();
  await expect(name).toHaveValue("Edited zone");
  await page.keyboard.press("Control+z");
  // The fixture's zone has no name.
  await expect(name).toHaveValue("");
  expect(errors).toEqual([]);
});

test("B28: a recipe's zone resizes down to the recipe's Smallest and no further, and says when it is past its Largest", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  // the CPU card fixture runs from 2×2 to 4×3, placed at 3×3 on a 6×4 grid
  const dir = path.join("tests/fixtures/recipes", "cpu-card");
  const files = ["manifest.json", "recipe.json"].map((p) => ({ path: p, data: fs.readFileSync(path.join(dir, p)).toString("base64") }));
  const res = await fetch(`${scratch.base}/api/widgets`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dashboard-Widget": "1" }, body: JSON.stringify({ files }) });
  expect(res.ok).toBe(true);
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const zone = { id: "cpu", module: "recipe:cpu-card", colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 3, visible: true };
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", cols: 6, rows: 4, pages: [{ id: "main", name: "Main", placements: [zone] }] };
  expect((await saveConfig(scratch.base, { ...config, activeProfile: "desk", profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${scratch.base}/?studio=1&profile=desk`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  const placed = page.locator('[data-zone-id="cpu"]');
  await expect(placed.locator('[data-recipe="recipe:cpu-card"]')).toBeVisible();
  await placed.click();
  /** Drags the zone's corner handle by (dx, dy) screen px. */
  const dragCorner = async (dx: number, dy: number) => {
    const knob = (await placed.locator('[data-resize-handle="se"]').boundingBox())!;
    const [x, y] = [knob.x + knob.width / 2, knob.y + knob.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(x + (dx * k) / 8, y + (dy * k) / 8);
    await page.mouse.up();
  };
  const spans = async () => {
    const saved = await (await fetch(`${scratch.base}/api/config`)).json();
    const z = saved.profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements[0];
    return [z.colSpan, z.rowSpan];
  };
  // dragged far up and left, past 1×1: it stops at its Smallest, 2×2
  const box = (await placed.boundingBox())!;
  await dragCorner(-box.width, -box.height);
  await page.keyboard.press("Control+s");
  await expect.poll(spans, { timeout: 5000 }).toEqual([2, 2]);
  await placed.click();
  await expect(page.getByRole("region", { name: "Place on grid" }).getByRole("textbox", { name: "W", exact: true })).toHaveValue("2");
  await expect(page.locator("[data-past-largest]")).toHaveCount(0);
  // dragged out to 5×4, past its Largest (4×3): it follows, and the inspector says so
  await dragCorner(box.width, box.height);
  await page.keyboard.press("Control+s");
  await expect.poll(spans, { timeout: 5000 }).toEqual([5, 4]);
  await placed.click();
  await expect(page.locator("[data-past-largest]")).toContainText("Past the largest size this widget is made for (4×3)");
  expect(errors).toEqual([]);
});
