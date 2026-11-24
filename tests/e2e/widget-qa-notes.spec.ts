import type { Page } from "@playwright/test";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The Widget QA notes queue (src/widgets/widget-qa/notes.ts, inspector/NoteEditor.tsx, inspector/NotesQueue.tsx): a frame's note
// edited in the inspector, its status (open or fixed) under the frame, in the widget's header, the list's mark and Copy for Claude,
// and the queue the list's entry opens. This page is a build (the app's debug server), which has no repo to write to: every action
// copies JSON for notes.json. The dev server's writer is tests/widgets/widget-qa/notes-dev.test.ts's.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

/** Notes in place of the built file (as report.mjs passes the repo's): one open, one fixed, and a widget whose only note is fixed. */
const SEEDED = {
  CodingAgents: { "1x1": "Room for a sparkline.", "2x1": { text: "Count beside the label.", status: "fixed" } },
  CpuMonitor: { "*": { text: "Whole widget.", status: "fixed" } },
};
const open = async (page: Page, query: string, notes?: object) => {
  if (notes) await page.addInitScript((n) => (window.__qaNotes = n as typeof window.__qaNotes), notes);
  await page.goto(`${qa.base}/?widget-qa&${query}`);
  await page.waitForFunction(() => window.__qa);
};
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const list = (page: Page) => page.locator('aside[aria-label="Widget list"]');
// the system clipboard gives Windows line ends back
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"));

test("a frame's note in the inspector: edit it, set its status, and on a build copy the widget's notes as JSON", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "module=CodingAgents&spans=1x1,4x2");
  await page.locator("#CodingAgents--1x1 [data-qa-box]").click();
  const note = inspector(page).getByRole("group", { name: "Note", exact: true });
  await expect(note).toContainText("Room for a sparkline of today's tokens.");
  await expect(note).toContainText("Open: in the notes queue.");
  await note.getByRole("button", { name: "Edit" }).click();
  const box = note.getByRole("textbox", { name: "Note for CodingAgents 1x1" });
  await expect(box).toHaveValue("Room for a sparkline of today's tokens.");
  await box.fill("A sparkline fits now.");
  await note.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Fixed" }).click();
  await expect(note).toContainText("A build has no repo to write to");
  await note.getByRole("button", { name: "Copy JSON" }).click();
  await expect(note.getByRole("status")).toContainText("paste them over its entry in src/widgets/widget-qa/notes.json");
  expect(JSON.parse(await clipboard(page))).toEqual({
    CodingAgents: { "1x1": { text: "A sparkline fits now.", status: "fixed" }, "2x1": "Room for a sparkline of today's tokens beside the session count." },
  });
  // nothing was written: the note is as the build has it
  await expect(note).toContainText("Room for a sparkline of today's tokens.");
  // a frame with no note takes a new one; Esc in the box puts the editor away and leaves the inspector open
  await page.locator("#CodingAgents--4x2 [data-qa-box]").click();
  await expect(note).toContainText("No note for CodingAgents 4x2.");
  await note.getByRole("button", { name: "Add a note" }).click();
  await note.getByRole("textbox", { name: "Note for CodingAgents 4x2" }).fill("Too empty.");
  await page.keyboard.press("Control+Enter");
  expect(JSON.parse(await clipboard(page)).CodingAgents["4x2"]).toBe("Too empty.");
  await note.getByRole("button", { name: "Add a note" }).click();
  await page.keyboard.press("Escape");
  await expect(note.getByRole("textbox")).toHaveCount(0);
  await expect(inspector(page)).toBeVisible();
  // a draft left open does not follow the selection to another frame
  await note.getByRole("button", { name: "Add a note" }).click();
  await note.getByRole("textbox", { name: "Note for CodingAgents 4x2" }).fill("A draft.");
  await page.locator("#CodingAgents--1x1 [data-qa-box]").click();
  await expect(note).toContainText("Room for a sparkline of today's tokens.");
  await expect(note.getByRole("textbox")).toHaveCount(0);
  // Copy as fixed and Copy without it, without opening the editor
  await note.getByRole("button", { name: "Copy as fixed" }).click();
  await expect.poll(async () => JSON.parse(await clipboard(page)).CodingAgents["1x1"]).toEqual({ text: "Room for a sparkline of today's tokens.", status: "fixed" });
  await note.getByRole("button", { name: "Copy without it" }).click();
  await expect.poll(async () => Object.keys(JSON.parse(await clipboard(page)).CodingAgents)).toEqual(["2x1"]);
});

test("statuses: a fixed note is dimmed under its frame, counted in the header, marked in the list and said in Copy for Claude", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "module=CodingAgents,CpuMonitor&spans=1x1,2x1", SEEDED);
  await expect(page.locator("#CodingAgents--1x1")).toContainText("Room for a sparkline.");
  await expect(page.locator("#CodingAgents--2x1")).toContainText("Fixed: Count beside the label.");
  await expect(page.locator("section#CodingAgents [data-qa-ui]").first()).toContainText("2 notes (1 fixed)");
  await expect(list(page).locator('[data-qa-row="CodingAgents"]').getByRole("img")).toHaveAccessibleName("1 open note, 1 fixed");
  await expect(list(page).locator('[data-qa-row="CpuMonitor"]').getByRole("img")).toHaveAccessibleName("its note is fixed");
  const text = await page.evaluate(() => window.__qa!.copyForClaude("CodingAgents 2x1"));
  expect(text).toContain('Note (fixed): "Count beside the label."');
  // the report counts only the open note as something to look at; __qa.notes() is the queue
  const report = await page.evaluate(() => window.__qa!.report({ module: "CodingAgents", notes: true }));
  expect(report.summary).toMatchObject({ withNotes: 2, openNotes: 1 });
  expect(report.notes?.map((n) => `${n.module} ${n.key} ${n.status}`)).toEqual(["CodingAgents 1x1 open"]);
  expect(await page.evaluate(() => window.__qa!.notes("all").map((n) => n.status))).toEqual(["open", "fixed", "fixed"]);
});

test("the notes queue: the list's entry opens it, it filters by status, a row selects its frame, and it copies for Claude", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "module=CodingAgents,CpuMonitor&spans=1x1,2x1", SEEDED);
  const entry = list(page).getByRole("button", { name: /^Notes queue/ });
  await expect(entry).toContainText("1 open");
  await entry.click();
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "1 open · 2 fixed" })).toBeVisible();
  const rows = panel.getByRole("list", { name: "Notes" }).getByRole("button");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("CodingAgents 1x1");
  const show = panel.getByRole("radiogroup", { name: "Show notes" });
  await show.getByRole("radio", { name: "Fixed 2" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("CpuMonitor (widget)");
  await show.getByRole("radio", { name: "All 3" }).click();
  await expect(rows).toHaveCount(3);
  await show.getByRole("radio", { name: "Open 1" }).click();
  await panel.getByRole("button", { name: "Copy for Claude" }).click();
  await expect.poll(() => clipboard(page)).toMatch(/^Widget QA · notes queue · 1 open note \(cell 110, skin default\)\n/);
  expect(await clipboard(page)).toContain("Reproduce: node tools/qa/report.mjs --module CodingAgents --spans 1x1");
  // Clear fixed, on a build: the file without the fixed notes
  await panel.getByRole("button", { name: "Copy without the fixed" }).click();
  await expect.poll(async () => JSON.parse(await clipboard(page))).toEqual({ CodingAgents: { "1x1": "Room for a sparkline." } });
  // a row selects its frame
  await rows.first().click();
  await expect(panel.getByRole("heading", { name: "CodingAgents 1x1" })).toBeVisible();
});
