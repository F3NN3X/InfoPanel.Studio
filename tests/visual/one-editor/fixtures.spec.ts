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

/** A Layers row by its name. */
const layersRow = (page: Page, name: string) => page.getByTestId("layers-row").filter({ hasText: name }).first();

/** Start an HTML5 drag on a row and hover `target` at a fraction of its height; `release` drops it there. */
async function dragRow(page: Page, from: Locator, target: Locator, f: number, release = false) {
  const a = (await from.boundingBox())!;
  const b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 40, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + b.height * f, { steps: 6 });
  await page.mouse.move(b.x + 62, b.y + b.height * f, { steps: 2 });
  if (release) await page.mouse.up();
}

/** Drag a box from its centre by (dx, dy) screen px. */
async function dragBy(page: Page, target: Locator, dx: number, dy: number) {
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx / 2, b.y + b.height / 2 + dy / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}

/** The lines built so far, by fixture and line text; each runs on its fixture, opened in Edit. */
const BUILT: Partial<Record<FixtureName, Record<string, (page: Page) => Promise<void>>>> = {
  screen: {
    [CHECKS.screen[2].text]: async (page) => {
      const tabs = page.getByRole("radiogroup", { name: "Left panel" });
      await expect(tabs.getByRole("radio")).toHaveText(["Layers", "Add"]);
      const layers = page.getByRole("region", { name: "Layers" });
      await expect(layers.locator("> div").first()).toHaveText(/^Layerstop first/);
    },
    // Each row: a 14 px chevron slot, a 20 px icon tile (a widget's in the accent), name, kind word, lock and eye.
    [CHECKS.screen[3].text]: async (page) => {
      const rows = page.getByTestId("layers-row");
      await expect(rows).toHaveCount(5);
      for (const row of await rows.all()) {
        const [slot, tile] = await row.locator("> *").evaluateAll((els) => els.slice(0, 2).map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, cls: e.className })));
        expect(slot.w).toBe(14);
        expect([tile.w, tile.h]).toEqual([20, 20]);
        expect(tile.cls).toContain("text-ui-accent");
        await expect(row).toContainText("widget");
        await expect(row.getByRole("button", { name: /^Lock / })).toHaveCount(1);
        await expect(row.getByRole("button", { name: /^Hide / })).toHaveCount(1);
        expect(await row.textContent()).not.toMatch(/\d×\d/);
      }
      await expect(page.getByTestId("layers-row").first()).toHaveText(/Coding Agents/);
    },
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
    [CHECKS.profile[2].text]: async (page) => {
      await expect(layersRow(page, "Temps")).toHaveAttribute("aria-expanded", "true");
      const cpu = layersRow(page, "CPU temp");
      await expect(cpu).toHaveAttribute("data-depth", "1");
      await expect(cpu).toContainText("item");
      await expect(cpu.getByLabel("Placed freely (Alt)")).toBeVisible();
      await expect(cpu.getByTestId("layers-row-status")).toBeVisible();
    },
    // NEON RIG has letter spacing (studio-only, v15 `$.letterSpacing`): approximated, every other part as is.
    [CHECKS.profile[3].text]: async (page) => {
      await expect(page.getByTestId("export-pill")).toHaveText("Export check7 as is1 approximated");
      await expect(page.getByTestId("canvas-badge")).toHaveCount(8);
      await expect(page.locator('[data-testid="canvas-badge"][data-status="ok"]')).toHaveCount(7);
      await expect(page.locator('[data-testid="canvas-badge"][data-status="approx"]')).toHaveCount(1);
    },
    // The canvas editor draws the page's 8 × 5 cells; CPU temp is where the import put it, placed freely. A Sensor is
    // a text item: its drawn height is its line's (the platform's font metrics), not the stored Height, so the
    // selection is checked against the stored X, Y and Width and the height the item is drawn at.
    [CHECKS.profile[1].text]: async (page) => {
      await expect(page.locator("[data-cell-lines] rect")).toHaveCount(40);
      const selection = page.locator("[data-selected-path]");
      const { h, ...at } = (await profileBox(page, selection))!;
      expect(at).toEqual({ x: 32, y: 96, w: 224 });
      const drawn = (await profileBox(page, page.locator(`[data-path="${await selection.first().getAttribute("data-selected-path")}"]`)))!;
      expect(h).toBeGreaterThan(0);
      expect(h).toBe(drawn.h);
      await expect(page.getByTestId("snap-label")).toHaveText("Snap: cells · Alt frees items");
    },
  },
  addw: {
    // Neon Rig is made for InfoPanel: after Recently used, InfoPanel items and Elements come before the widgets.
    [CHECKS.addw[0].text]: async (page) => {
      const tiles = page.getByTestId("add-tile");
      await expect(tiles.first()).toBeVisible();
      const sections = await page.getByRole("listbox").locator("> section").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      expect(sections).toEqual(["RECENTLY USED", "INFOPANEL ITEMS", "ELEMENTS", "STUDIO WIDGETS"]);
      // Every tile shows its status once the check has loaded.
      await expect(page.locator('[data-testid="add-tile"]:not([data-status])')).toHaveCount(0);
      expect(await tiles.count()).toBeGreaterThan(30);
      await expect(page.locator('[data-testid="add-tile"]:not(:has(span[aria-label]))')).toHaveCount(0);
      await shoot(page, "addw-tiles");
    },
    // The fixture opens with the add's toast; a real add raises it too. Change goes to the On InfoPanel choice, and
    // Undo takes the widget away in one step.
    [CHECKS.addw[2].text]: async (page) => {
      const toast = page.getByTestId("add-toast");
      await expect(toast).toContainText("Weather added. On InfoPanel export it becomes a picture with its live values on top.");
      await expect(toast.getByRole("button")).toHaveText(["Undo", "Change"]);
      await shoot(page, "addw-toast");
      const pics = page.locator('[data-testid="canvas-badge"][data-status="pic"]');
      await expect(pics).toHaveCount(1);
      await page.getByTestId("add-tile").filter({ hasText: "Weather" }).first().click();
      await expect(pics).toHaveCount(2);
      await expect(toast).toContainText("Weather added. On InfoPanel export it becomes a picture");
      await toast.getByRole("button", { name: "Change" }).click();
      await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="on-infopanel"]')))).toBe(true);
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect(pics).toHaveCount(1);
    },
    [CHECKS.addw[4].text]: async (page) => {
      await page.getByRole("radio", { name: "Layers" }).click();
      const first = page.getByTestId("layers-row").first();
      await expect(first).toHaveText(/Weather/);
      await expect(first).toHaveAttribute("data-kind", "widget");
      await expect(page.locator('[data-testid="layers-row"][data-kind="item"]')).not.toHaveCount(0);
    },
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
    // Title text is in the Overlay group: a click selects the group, a double-click the part inside (SPEC §10.3 note).
    [CHECKS.alt[0].text]: async (page) => {
      const title = page.locator('[data-part-id="title"]');
      await title.dblclick();
      await altDrag(page, title, 60, 40, async () => {
        await expect(page.getByTestId("alt-hint")).toHaveText("AltPlacing freely · release Alt to snap to cells");
        await expect(page.locator("[data-cell-lines]")).toHaveCSS("opacity", "0.35");
      });
      await expect(page.getByTestId("alt-hint")).toHaveCount(0);
    },
    [CHECKS.alt[1].text]: async (page) => {
      await page.locator('[data-part-id="title"]').dblclick();
      await altDrag(page, page.locator('[data-part-id="title"]'), 60, 40, async () => {
        await expect(page.getByTestId("alt-readout")).toHaveText(/^X \d+ {2}Y \d+ {2}W 140 {2}H 36 · free$/);
        await expect(page.locator("[data-item-parts] .border-dashed")).toHaveCount(1);
      });
    },
    // Dropped with Alt over the CPU gauge: stored in px (data-free), moved by exactly the drag; then Alt released
    // mid-drag snaps it to a cell's box.
    [CHECKS.alt[2].text]: async (page) => {
      const title = page.locator('[data-part-id="title"]');
      await title.dblclick();
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
      await title.dblclick();
      await expect(title).toHaveAttribute("data-selected", "");
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
  layersF: {
    [CHECKS.layersF[0].text]: async (page) => {
      const rows = page.getByTestId("layers-row");
      // Layers is its own chunk: wait for its rows before reading them.
      await expect(rows.first()).toBeVisible();
      const names = await rows.evaluateAll((els) => els.map((e) => [e.textContent?.match(/^[A-Za-z ]+?(?=group|widget|item|element)/)?.[0].trim(), e.getAttribute("data-depth"), e.getAttribute("data-kind")]));
      const at = names.findIndex((n) => n[0] === "Right column");
      expect(names.slice(at, at + 3)).toEqual([["Right column", "0", "group"], ["Weather", "1", "widget"], ["Fan gauge", "1", "item"]]);
    },
    [CHECKS.layersF[1].text]: async (page) => {
      const last = page.getByTestId("layers-row").last();
      await expect(last).toHaveText(/^Panel card/);
      await expect(last).toHaveAttribute("data-kind", "element");
      // Drawn first, so under the Temps items.
      const under = await page.evaluate(() => {
        const card = document.querySelector('[data-canvas-edit-layer] ~ * [data-path="0"], [data-path="0"]');
        const temp = document.querySelector('[data-path="1.0"]');
        return Boolean(card && temp && card.compareDocumentPosition(temp) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(under).toBe(true);
    },
    [CHECKS.layersF[2].text]: async (page) => {
      await layersRow(page, "Fan gauge").click({ button: "right" });
      const menu = page.getByTestId("layer-menu");
      await expect(menu.getByRole("menuitem")).toHaveText([
        /^Bring to front/, /^Bring forward/, /^Send backward/, /^Send to back/,
        /^Group selection/, /^Ungroup/, /^Move to group/,
        /^Snap to grid/, /^Lock/, /^Hide/,
        /^Rename/, /^Duplicate/, /^Delete/, /^Save to Library/,
      ]);
      await menu.getByRole("menuitem", { name: /^Move to group/ }).click();
      await expect(menu.locator("[data-sub] [role=menuitem]")).toHaveText(["Header", "Right column", "Temps", "New group"]);
      await shoot(page, "layersF-menu");
    },
    // A 2 px line between rows; an outline on a group's middle; the drop lands inside, on top.
    [CHECKS.layersF[3].text]: async (page) => {
      const load = layersRow(page, "CPU load");
      await dragRow(page, load, layersRow(page, "Clock"), 0.15);
      await expect(layersRow(page, "Clock")).toHaveAttribute("data-drop", "above");
      const line = layersRow(page, "Clock").locator("span.bg-ui-accent");
      expect((await line.boundingBox())!.height).toBe(2);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await dragRow(page, load, layersRow(page, "Right column"), 0.5);
      await expect(layersRow(page, "Right column")).toHaveAttribute("data-drop", "inside");
      await page.mouse.up();
      const after = page.getByTestId("layers-row");
      const names = await after.evaluateAll((els) => els.map((e) => e.getAttribute("data-depth") + (e.textContent ?? "").slice(0, 12)));
      const at = names.findIndex((n) => n.startsWith("0Right column"));
      expect(names[at + 1]).toMatch(/^1CPU load/);
    },
    [CHECKS.layersF[4].text]: async (page) => {
      await layersRow(page, "Temps").click();
      await expect(page.getByTestId("group-chip")).toHaveText("Temps · group");
      await expect(page.locator("[data-selected-path]")).toHaveCount(1);
      await expect(layersRow(page, "CPU temp")).toHaveClass(/bg-ui-accent\/7/);
      await shoot(page, "layersF-group");
    },
    [CHECKS.layersF[5].text]: async (page) => {
      const load = layersRow(page, "CPU load");
      await load.getByRole("button", { name: "Hide CPU load" }).click();
      await expect(load).toHaveAttribute("data-hidden", "");
      await expect(load).toHaveCSS("opacity", "0.45");
      await load.getByRole("button", { name: "Show CPU load" }).click();
      await load.getByRole("button", { name: "Lock CPU load" }).click();
      await expect(load).toHaveAttribute("data-locked", "");
      await expect(load.getByRole("button", { name: "Unlock CPU load" })).toBeVisible();
      // A drag on the locked item leaves it where it is.
      const drawn = page.locator('[data-path="2"]');
      const before = await profileBox(page, drawn);
      await dragBy(page, drawn, 40, 30);
      expect(await profileBox(page, drawn)).toEqual(before);
    },
  },
  layersG: {
    // Refused while the bottom row is full (a toast says so); with room, both gauges move one row down.
    [CHECKS.layersG[0].text]: async (page) => {
      await expect(layersRow(page, "Gauges")).toContainText("group · 2");
      await layersRow(page, "Gauges").click();
      const box = page.locator('[data-group-box="gauges"]');
      const cpu = page.locator('[data-zone-id="cpu"]');
      const gpu = page.locator('[data-zone-id="gpu"]');
      const [c0, g0] = [(await cpu.boundingBox())!, (await gpu.boundingBox())!];
      const row = c0.height / 2;
      await dragBy(page, box, 0, row);
      await expect(page.getByText("Not enough room to move the group.")).toBeVisible();
      expect(await cpu.boundingBox()).toEqual(c0);
      await layersRow(page, "Clock").click();
      await layersRow(page, "Weather").click({ modifiers: ["Control"] });
      await layersRow(page, "Coding Agents").click({ modifiers: ["Control"] });
      await page.keyboard.press("Delete");
      await expect(page.locator("[data-zone-id]")).toHaveCount(2);
      await layersRow(page, "Gauges").click();
      await dragBy(page, box, 0, row);
      await expect.poll(async () => Math.round((await cpu.boundingBox())!.y - c0.y)).toBe(Math.round(row));
      expect(Math.round((await gpu.boundingBox())!.y - g0.y)).toBe(Math.round(row));
      expect([(await cpu.boundingBox())!.x, (await gpu.boundingBox())!.x]).toEqual([c0.x, g0.x]);
    },
    [CHECKS.layersG[1].text]: async (page) => {
      await expect(page.getByTestId("layers-row").first()).toBeVisible();
      const names = await page.getByTestId("layers-row").evaluateAll((els) => els.map((e) => (e.getAttribute("data-kind") === "group" ? e.textContent?.replace(/group.*$/, "") : null)).filter(Boolean));
      expect(names).toEqual(["Overlay", "Gauges"]);
      const title = (await page.locator('[data-part-id="title"]').boundingBox())!;
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-part-id]")?.getAttribute("data-part-id") ?? null, [title.x + title.width / 2, title.y + title.height / 2]);
      expect(top).toBe("title");
    },
    [CHECKS.layersG[3].text]: async (page) => {
      await layersRow(page, "Overlay").click();
      await expect(page.getByTestId("group-chip")).toHaveText("Overlay · group");
      await expect(page.locator('[data-group-box="overlay"]')).toBeVisible();
      await expect(layersRow(page, "Title text")).toHaveClass(/bg-ui-accent\/7/);
      await expect(layersRow(page, "Accent glow")).toHaveClass(/bg-ui-accent\/7/);
      await expect(page.getByTestId("inspector-kind")).toHaveText("Group · 1 item, 1 element");
      await expect(page.getByTestId("inspector-layer")).toBeVisible();
      await shoot(page, "layersG-group");
    },
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
  hover: {
    // The fixture shows the Widgets segment: rows of three 64 px tiles, a widget's size top-left, its status top-right.
    [CHECKS.hover[0].text]: async (page) => {
      const grid = page.locator("[data-add-grid]").nth(1);
      const boxes = await grid.getByTestId("add-tile").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: r.height })));
      expect(boxes.every((b) => b.h === 64)).toBe(true);
      expect(boxes.filter((b) => b.top === boxes[0].top)).toHaveLength(Math.min(3, boxes.length));
      const weather = page.getByTestId("add-tile").filter({ hasText: "Weather" }).first();
      await expect(weather.locator("span.font-ui-mono")).toHaveText(/^\d+×\d+$/);
      await expect(weather).toHaveAttribute("data-status", "pic");
      await expect(weather.locator('span[aria-label="Becomes a picture"]')).toBeVisible();
    },
    [CHECKS.hover[1].text]: async (page) => {
      const list = page.getByRole("listbox");
      await expect(list.locator("> section > div").first()).toHaveText("RECENTLY USED");
      await expect(list.getByText("STUDIO WIDGETS", { exact: false })).toBeVisible();
      await expect(list.getByText("System", { exact: true })).toBeVisible();
      // A tile holds its name and size only.
      const weather = page.getByTestId("add-tile").filter({ hasText: "Weather" }).first();
      expect((await weather.textContent())?.replace(/\d+×\d+/, "")).toBe("Weather");
    },
    // The fixture opens Weather's card; Esc closes it. A rest on another tile opens its card within 300 ms (acceptance
    // 20), beside the panel and aligned to the tile's row; moving to the next tile switches at once.
    [CHECKS.hover[2].text]: async (page) => {
      const card = page.getByTestId("add-preview");
      await expect(card).toContainText("Weather");
      await page.keyboard.press("/");
      await page.keyboard.press("Escape");
      await expect(card).toHaveCount(0);
      // Recently used: Weather, then Custom gauge.
      const recent = page.getByRole("listbox").locator("> section").first().getByTestId("add-tile");
      const t = (await recent.nth(1).boundingBox())!;
      // Timed in the page: from the pointer entering the tile to the card being there.
      await page.evaluate(() => {
        const w = window as unknown as { hoverAt?: number; cardAt?: number };
        document.addEventListener("mouseover", (e) => (w.hoverAt ??= (e.target as Element).closest('[data-testid="add-tile"]') ? performance.now() : undefined), true);
        new MutationObserver(() => (w.cardAt ??= document.querySelector('[data-testid="add-preview"]') ? performance.now() : undefined)).observe(document.body, { childList: true, subtree: true });
      });
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
      await expect(card).toHaveCount(0);
      await expect(card).toContainText("Custom gauge");
      const delay = await page.evaluate(() => {
        const w = window as unknown as { hoverAt: number; cardAt: number };
        return w.cardAt - w.hoverAt;
      });
      expect(delay).toBeGreaterThanOrEqual(240);
      expect(delay).toBeLessThanOrEqual(300);
      // Where it is placed (its box slides in 4 px as it appears, so its style, not its box).
      const c = await card.evaluate((e) => ({ x: Number.parseFloat(e.style.left), y: Number.parseFloat(e.style.top) }));
      const panel = (await page.locator("aside", { has: page.getByRole("radiogroup", { name: "Left panel" }) }).boundingBox())!;
      expect(c.x).toBeCloseTo(panel.x + panel.width + 8, 1);
      expect(c.y).toBeCloseTo(t.y - 4, 1);
      await recent.nth(0).hover();
      await expect(card).toContainText("Weather", { timeout: 100 });
      // The arrow keys move the card with the highlight.
      await page.keyboard.press("/");
      await page.keyboard.press("ArrowDown");
      await expect(card).toBeVisible();
    },
    [CHECKS.hover[3].text]: async (page) => {
      const card = page.getByTestId("add-preview");
      await expect(card).toContainText("WeatherInfo · Studio widget");
      await expect(card).toContainText("Always sits on the grid; uses your theme, colours and fonts.");
      await expect(card).toContainText("Adapts down to 1×1");
      await expect(card).toContainText("On InfoPanel: becomes a picture");
      await shoot(page, "hover-card");
      // An InfoPanel item and an element, on the InfoPanel items segment.
      await page.getByRole("radio", { name: "InfoPanel items" }).click();
      for (const [name, category, note] of [["Bar", "InfoPanel item · Data", "InfoPanel item"], ["Card", "Element", "Studio element"]]) {
        // Scrolling the list closes the card (§9.5): bring the tile into view first, then rest on it.
        const tile = page.getByTestId("add-tile").filter({ hasText: new RegExp(`^${name}$`) }).first();
        await tile.scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        await tile.hover();
        await expect(card).toContainText(`${name}${category}`);
        await expect(card).toContainText("Snaps to cells; hold Alt to place it freely, even on top of widgets.");
        await expect(card).toContainText(`any size${note}`);
        await expect(card).toContainText("On InfoPanel:");
        await expect(card.locator("[data-ip-canvas]")).toBeVisible();
        // The new part is drawn inside the stage, not off it.
        const stage = await card.locator("[data-ip-canvas]").boundingBox();
        const part = await card.locator('[data-ip-canvas] [data-path="0"]').boundingBox();
        expect(stage && part).toBeTruthy();
        if (stage && part) {
          expect(part.x).toBeGreaterThanOrEqual(stage.x);
          expect(part.y).toBeGreaterThanOrEqual(stage.y);
          expect(part.x + part.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
          expect(part.y + part.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
        }
      }
      await page.waitForTimeout(200);
      await shoot(page, "hover-item");
    },
    [CHECKS.hover[4].text]: async (page) => {
      const card = page.getByTestId("add-preview");
      await expect(card).toContainText("Click to add · drag to place");
      await expect(card).toHaveCSS("pointer-events", "none");
      await expect(page.getByText("Hover for details")).toBeVisible();
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

// SPEC §7.4, §9.3, acceptance 19 (DECISIONS after phase 3): on a screen for Studio panels Add lists the widgets first,
// and an InfoPanel item from Add, clicked or dropped, becomes an item placement on the page (no free area), selected.
test("one-editor/screen: Add puts InfoPanel items on the page as item placements", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await page.getByRole("radio", { name: "Add" }).click();
  const sections = () => page.getByRole("listbox").locator("> section").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(await sections()).toEqual(["STUDIO WIDGETS", "INFOPANEL ITEMS", "ELEMENTS"]);
  await page.getByRole("radio", { name: "InfoPanel items" }).click();
  expect(await sections()).toEqual(["INFOPANEL ITEMS", "ELEMENTS"]);
  const items = page.locator('[data-testid="canvas-part"][data-kind="item"]');
  await page.getByTestId("add-tile").filter({ hasText: /^Text$/ }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute("data-selected", "");
  await expect(items.first()).not.toHaveAttribute("data-free");
  await page.getByTestId("add-tile").filter({ hasText: /^Card$/ }).dragTo(page.locator("[data-studio-page]"), { targetPosition: { x: 100, y: 100 } });
  await expect(page.locator('[data-testid="canvas-part"][data-kind="element"]')).toHaveCount(1);
  await expect(page.locator("[data-zone-id]")).toHaveCount(5);
  // Recently used now leads, with both.
  await page.getByRole("radio", { name: "All" }).first().click();
  expect((await sections())[0]).toBe("RECENTLY USED");
});

// DECISIONS after phase 4: right-click on a widget on the canvas opens the layer menu, the zone menu's other rows under it.
test("one-editor/screen: right-click on a widget opens the layer menu", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await page.locator('[data-zone-id="clock"]').click({ button: "right" });
  const menu = page.getByTestId("layer-menu");
  const rows = menu.getByRole("menuitem");
  await expect(rows.first()).toHaveText(/^Bring to front/);
  await expect(rows.filter({ hasText: /^Change widget/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^Duplicate/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^Delete/ })).toHaveCount(1);
  await shoot(page, "screen-widget-menu");
});

// SPEC §10.3 note (DECISIONS after phase 4): a click on a part in a group selects the outermost group, a double-click the
// part inside; a widget's too.
test("one-editor/layersG: a click selects the group, a double-click the part", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "layersG");
  // The gauge's lower half: Accent glow covers its top row, and once selected the group's box covers it all.
  const b = (await page.locator('[data-zone-id="cpu"]').boundingBox())!;
  const at = { x: b.x + 30, y: b.y + b.height - 30 };
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId("group-chip")).toHaveText("Gauges · group");
  await expect(layersRow(page, "Gauges")).toHaveAttribute("data-selected", "");
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.getByTestId("group-chip")).toHaveCount(0);
  await expect(layersRow(page, "CPU gauge")).toHaveAttribute("data-selected", "");
  await page.locator('[data-part-id="title"]').click();
  await expect(page.getByTestId("group-chip")).toHaveText("Overlay · group");
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
