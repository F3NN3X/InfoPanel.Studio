import { startScratch } from "../../tools/perf/scratch.mjs";
import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// The Keys widget and the action runner on the kiosk (pinned layer P7): a key's tap, double tap and hold, a folder, the
// hold-to-confirm card and the runner's answers, over a real server with ACTION_RUNNER=on. Nothing is ever started: test
// mode is on, and every command names a program no machine has, so even a run that got past test mode would start nothing.

const W = 1024;
const H = 600;
const NOTES = "ips-e2e-no-such-program.exe notes.txt";
const LOCK = "ips-e2e-no-such-program.exe /lock";
const CALC = "ips-e2e-no-such-program.exe /calc";
const keys = [
  { id: "notes", name: "Notes", icon: { from: "set", name: "file-text" }, touch: { tap: { op: "run", command: NOTES } } },
  { id: "lock", name: "Lock PC", icon: { from: "set", name: "lock" }, touch: { doubleTap: { op: "run", command: LOCK, confirm: true } } },
  { id: "next", name: "Next", icon: { from: "set", name: "zap" }, touch: { hold: { op: "page", to: "next" } } },
  { id: "apps", name: "Apps", icon: { from: "set", name: "folder" }, keys: [{ id: "calc", name: "Calc", touch: { tap: { op: "run", command: CALC } } }] },
];
const config = {
  version: 20,
  activeProfile: "desk",
  profiles: [
    {
      id: "desk",
      name: "Desk",
      width: W,
      height: H,
      cols: 4,
      rows: 2,
      fit: "fill",
      padding: 12,
      gap: 12,
      pages: [
        { id: "one", name: "One", placements: [{ id: "k", module: "Keys", colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 2, visible: true, keys }] },
        { id: "two", name: "Two", placements: [{ id: "c", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true }] },
      ],
    },
  ],
};

const write = { "Content-Type": "application/json", "X-Dashboard-Control": "1" };

test("a key's tap, double tap and hold run their actions, and a command asks the runner, held to confirm where set", async ({ page }) => {
  const scratch = await startScratch({ env: { ACTION_RUNNER: "on" } });
  try {
    const { errors } = watchErrors(page);
    expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
    // two commands approved on this PC, the folder's one not; test mode on
    const approved = await fetch(`${scratch.base}/api/actions`, { method: "PUT", headers: write, body: JSON.stringify({ approve: [NOTES, LOCK], testMode: true }) });
    expect(((await approved.json()) as { testMode: boolean }).testMode).toBe(true);
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
    await settled(page, "[data-page-grid] > *");
    const main = page.locator("main");
    await expect(main).toHaveAttribute("aria-label", "One");
    const key = (name: RegExp) => page.getByRole("button", { name });
    const note = page.locator("[data-action-note]");

    // a tap runs its command: in test mode the panel says what would run
    await key(/^Notes/).click();
    await expect(note).toHaveText(`Test mode: would run ${NOTES}`);

    // a double tap on a command held to confirm opens the card; an early lift runs nothing, a full hold runs it
    const lock = (await key(/^Lock PC/).boundingBox())!;
    await page.mouse.dblclick(lock.x + lock.width / 2, lock.y + lock.height / 2);
    const card = page.getByRole("dialog", { name: "Run this command?" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("textbox", { name: "The command" })).toHaveValue(LOCK);
    const hold = card.getByRole("button", { name: /^Hold to run/ });
    const at = (await hold.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect(card).toHaveCount(0);
    await expect(note).toHaveText(`Test mode: would run ${LOCK}`);

    // a folder opens; its command was not approved, so the runner refuses it and the panel says why
    await key(/^Apps/).click();
    await key(/^Calc/).click();
    await expect(note).toContainText("isn't approved");
    await key(/^Back/).click();

    // the keyboard: Enter on a key is its tap
    await key(/^Notes/).focus();
    await page.keyboard.press("Enter");

    // a hold on a key runs its hold: the next page
    const next = (await key(/^Next/).boundingBox())!;
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect(main).toHaveAttribute("aria-label", "Two");

    // every run is in the log: three checked in test mode, one refused
    const log = (await (await fetch(`${scratch.base}/api/actions/log`)).json()) as { entries: { outcome: string; command?: string; reason?: string }[] };
    expect(log.entries.map((e) => [e.outcome, e.command, e.reason ?? ""])).toEqual([
      ["dry", NOTES, ""],
      ["dry", LOCK, ""],
      ["refused", CALC, "unapproved"],
      ["dry", NOTES, ""],
    ]);
    // the refused run's 403 (its response and the browser's line for it) is the runner's answer, not a load failure
    const refused = errors.filter((e) => e.includes("/api/actions/run") || e.includes("status of 403"));
    expect(refused).toHaveLength(2);
    expect(errors.filter((e) => !refused.includes(e))).toEqual([]);
  } finally {
    scratch.stop();
  }
});
