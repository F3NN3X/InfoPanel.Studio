import type { Page } from "@playwright/test";
import { expect, manifest, test, watchErrors } from "./fixtures";

// Phase 5b: a recipe built in the Widgets page's builder, saved through /api/widgets as the user's own, added to a screen, and
// drawn by the kiosk. The fixture's screens are full, so the test adds an empty one first.

test("Build a recipe, save it, add it to a screen: the kiosk draws it", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  const put = await fetch(`${scratch.base}/api/config`, { method: "POST", headers: { "Content-Type": "application/json", "x-dashboard-config": "1" }, body: JSON.stringify({ ...config, profiles: [desk, ...config.profiles] }) });
  expect(put.ok).toBe(true);

  await page.goto(`${scratch.base}/?studio=1&profile=desk`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("button", { name: "New widget" }).click();
  const name = page.getByLabel("Widget name");
  await name.fill("Test card");
  await name.press("Enter");
  await page.locator('[data-add-block="ring"]').click();
  await page.getByRole("button", { name: "Change the data" }).click();
  const [key] = manifest.sensorKeys;
  await page.getByLabel("Search data points").fill(key.split(".")[1]);
  await page.locator(`button[role="option"][title="${key}"]`).click();
  await expect(page.locator("[data-validation]")).toContainText("No code · 2 blocks");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved Test card").first()).toBeVisible();
  const stored = await (await fetch(`${scratch.base}/api/widgets/recipe.test-card/recipe.json`)).json();
  expect(stored.root.children[0]).toMatchObject({ type: "ring", bind: { sensor: key } });
  // the server records it as made in Studio (Yours), whichever browser asks
  expect(await (await fetch(`${scratch.base}/api/widgets`)).json()).toEqual([expect.objectContaining({ id: "recipe:test-card", origin: "studio" })]);

  // the sidebar's Widgets goes back to browse, where the saved recipe is a card; a double-click opens it again
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.locator('[data-widget-card="recipe:test-card"]').dblclick();
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText("Added Test card to Desk").first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => (await (await fetch(`${scratch.base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module), { timeout: 5000 })
    .toEqual(["recipe:test-card"]);

  await page.goto(`${scratch.base}/?profile=desk`);
  await expect(page.locator('[data-recipe="recipe:test-card"]')).toBeVisible();
  expect(errors).toEqual([]);
});

// Builder audit Phase A: moving blocks between containers in Layers, undo per change, the validation list, and the import and
// export of a recipe that is open with edits.

/** The Widgets page on a fresh scratch server, a new recipe open in the builder. */
async function newWidget(page: Page, base: string) {
  await page.goto(`${base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("button", { name: "New widget" }).click();
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
/** Layers as "path name" lines, top first. */
const layers = async (page: Page) => (await page.locator("[data-layer]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-layer")} ${e.textContent?.trim()}`)));

/** Drags a Layers row onto another's middle (into a container) or its top edge (before it), by the mouse. */
async function drag(page: Page, from: string, to: string, where: "inside" | "above") {
  const a = (await layer(page, from).boundingBox())!;
  const b = (await layer(page, to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + (where === "inside" ? b.height / 2 : 3), { steps: 8 });
}

test("Layers moves a block into, out of and between Rows, Cards and Repeats, by drag and by keyboard; a refused drop says why", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  // card[ Row, Card, Repeat, Value ]
  for (const type of ["row", "card", "repeat"]) {
    await layer(page, "").click();
    await add(page, type);
  }
  await layer(page, "").click();
  await add(page, "value");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "1 Card", "2 Repeat · Locations", "3 Value"]);
  // by drag: the Value into the Row, then into the Card, then into the Repeat
  await drag(page, "3", "0", "inside");
  await page.mouse.up();
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Value", "1 Card", "2 Repeat · Locations"]);
  await drag(page, "0.0", "1", "inside");
  await page.mouse.up();
  expect(await layers(page)).toEqual([" New widget", "0 Row", "1 Card", "1.0 Value", "2 Repeat · Locations"]);
  await drag(page, "1.0", "2", "inside");
  await page.mouse.up();
  expect(await layers(page)).toEqual([" New widget", "0 Row", "1 Card", "2 Repeat · Locations", "2.0 Value"]);
  // by keyboard: Alt+← out of the Repeat, Alt+→ into the container just above (the Repeat again), Alt+↑ among its siblings
  await layer(page, "2.0").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "1 Card", "2 Repeat · Locations", "3 Value"]);
  await expect(layer(page, "3")).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "1 Value", "2 Card", "3 Repeat · Locations"]);
  await page.keyboard.press("Alt+ArrowRight");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Value", "1 Card", "2 Repeat · Locations"]);
  // refused: a Repeat into the Repeat, by drag (the reason at the drop line) and by keyboard (the reason under Layers)
  await layer(page, "0").click();
  await add(page, "repeat");
  expect(await layers(page)).toContain("0.1 Repeat · Locations");
  await drag(page, "0.1", "2", "inside");
  await expect(page.locator("[data-drop-why]")).toHaveText("A Repeat can't go inside another Repeat");
  await expect(layer(page, "2")).toHaveAttribute("data-drop", "refused");
  await page.mouse.up();
  expect(await layers(page)).toContain("0.1 Repeat · Locations");
  await expect(page.locator("[data-move-why]")).toHaveText("A Repeat can't go inside another Repeat");
  // out of the Row, down past the Card and the other Repeat, then into the container above it: that Repeat, refused
  await layer(page, "0.1").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Value", "1 Card", "2 Repeat · Locations", "3 Repeat · Locations"]);
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("[data-move-why]")).toHaveText("A Repeat can't go inside another Repeat");
  expect(await layers(page)).toContain("3 Repeat · Locations");
  expect(errors).toEqual([]);
});

test("undo: a ten-character name is one step, a slider drag is one step", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await add(page, "ring");
  const name = page.getByLabel("Name in Layers", { exact: true });
  await name.click();
  await name.pressSequentially("Big ring 1");
  // the stage and Layers show the draft while it is typed, with no undo step yet
  await expect(layer(page, "0")).toHaveText("Big ring 1");
  await name.press("Enter");
  const undo = page.getByRole("button", { name: "Undo (Ctrl+Z)" });
  await undo.click();
  await expect(layer(page, "0")).toHaveText("Ring");
  await page.getByRole("button", { name: "Redo (Ctrl+Shift+Z)" }).click();
  await expect(layer(page, "0")).toHaveText("Big ring 1");
  // the thickness slider, dragged across: one step back to 8 %
  const slider = page.getByLabel("Thickness", { exact: true });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.down();
  for (const f of [0.45, 0.6, 0.75, 0.9]) await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
  await page.mouse.up();
  const moved = await slider.inputValue();
  expect(Number(moved)).toBeGreaterThan(14);
  await undo.click();
  await expect(slider).toHaveValue("8");
  await undo.click();
  await expect(layer(page, "0")).toHaveText("Ring");
});

test("the validation list names each block by its Layers name, lists every problem, and a click selects the block", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await add(page, "ring");
  await page.getByLabel("Name in Layers", { exact: true }).fill("Big ring");
  await page.getByLabel("Name in Layers", { exact: true }).press("Enter");
  await page.getByLabel("Decimals", { exact: true }).fill("9");
  await page.getByLabel("Decimals", { exact: true }).press("Enter");
  await layer(page, "").click();
  await add(page, "value");
  await page.getByLabel("Decimals", { exact: true }).fill("7");
  await page.getByLabel("Decimals", { exact: true }).press("Enter");
  await expect(page.locator("[data-validation]")).toContainText("2 problems");
  const list = page.locator("[data-problems] button");
  // the errors first, then what the stage measures at its size: a 9-decimal value is too long for a ring at 3×2
  await expect(list).toHaveText(["Big ring · Decimals: from 0 to 4", "Value · Decimals: from 0 to 4", "At 3×2, Big ring is too small for its value"]);
  for (const text of await list.allTextContents()) expect(text).not.toMatch(/\$\.|children\[/);
  await list.nth(0).click();
  await expect(layer(page, "0")).toHaveAttribute("aria-current", "true");
  await expect(page.getByLabel("Decimals", { exact: true })).toHaveValue("9");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("Export saves an edited recipe first (B7); an import over it asks, shows both versions and keeps it yours (B8)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  const name = page.getByLabel("Widget name");
  await name.fill("GPU card");
  await name.press("Enter");
  await add(page, "label");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved GPU card").first()).toBeVisible();
  // an edit, then Export: saved as 1.0.1 first, and the file is what the server holds
  await name.fill("GPU card 2");
  await name.press("Enter");
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(file.suggestedFilename()).toBe("gpu-card-1.0.1.widget.zip");
  const listed = async () => (await (await fetch(`${scratch.base}/api/widgets`)).json()) as { id: string; name: string; version: string; origin: string }[];
  expect(await listed()).toEqual([expect.objectContaining({ id: "recipe:gpu-card", name: "GPU card 2", version: "1.0.1", origin: "studio" })]);
  await expect(page.getByText("Recipe · saved")).toBeVisible();
  const zip = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(zip);
  // a later save (1.0.2), then the 1.0.1 file imported over it: the page asks first, with both versions
  await name.fill("GPU card 3");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved GPU card 3").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  const ask = page.locator("[data-import-replace]");
  await expect(ask).toContainText("Installed: GPU card 3 1.0.2 (yours)");
  await expect(ask).toContainText("gpu-card-1.0.1.widget.zip: GPU card 2 1.0.1");
  await ask.getByRole("button", { name: "Keep the installed one" }).click();
  expect((await listed())[0]).toMatchObject({ name: "GPU card 3", version: "1.0.2" });
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await page.locator("[data-import-replace]").getByRole("button", { name: "Replace" }).click();
  await expect(page.getByText("Imported GPU card 2").first()).toBeVisible();
  expect(await listed()).toEqual([expect.objectContaining({ name: "GPU card 2", version: "1.0.1", origin: "studio" })]);
  // the same file again changes nothing, and says so
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await expect(page.getByText("GPU card 2 1.0.1 is installed already, with the same files").first()).toBeVisible();
  await expect(page.locator("[data-import-replace]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
