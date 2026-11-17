import { startScratch } from "../../tools/perf/scratch.mjs";
import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// Agent approvals from the panel (pinned layer P8): a Claude Code permission request, posted as the hook posts it, shows on
// this PC's kiosk with the whole command; Deny answers deny and a full hold answers allow, both back to the waiting hook, and
// each answer is logged. A server with AGENT_APPROVALS=claude; nothing runs anywhere, the hook here is this test.

const W = 1024;
const H = 600;
const COMMAND = `npm run build && npm run verify -- --feature dev-fixtures ${"&& echo the rest of a long command ".repeat(6)}`;
const config = {
  version: 20,
  activeProfile: "desk",
  profiles: [
    {
      id: "desk",
      name: "Desk",
      width: W,
      height: H,
      cols: 1,
      rows: 1,
      fit: "fill",
      padding: 12,
      gap: 12,
      pages: [{ id: "agents", name: "Agents", placements: [{ id: "a", module: "CodingAgents", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { view: "sessions" } }] }],
    },
  ],
};

/** Posts a permission request as `ips-agent permission claude` does; resolves with the server's answer to the hook. */
function hook(base: string, session: string): Promise<unknown> {
  const body = { hook_event_name: "PermissionRequest", session_id: session, cwd: "E:\\work\\InfoPanel.Studio", tool_name: "Bash", tool_input: { command: COMMAND } };
  return fetch(`${base}/api/agents/permission?agent=claude`, { method: "POST", headers: { "Content-Type": "application/json", "X-Agent-Event": "1" }, body: JSON.stringify(body) }).then((r) => r.json());
}

test("a permission request shows on the kiosk in full, and Deny or a full hold answers the waiting hook", async ({ page }) => {
  const scratch = await startScratch({ env: { AGENT_APPROVALS: "claude" } });
  try {
    const { errors } = watchErrors(page);
    expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
    await settled(page, "[data-page-grid] > *");
    const prompt = page.locator("[data-agent-prompt]");

    // Deny
    const denied = hook(scratch.base, "one");
    await expect(prompt).toBeVisible({ timeout: 10_000 });
    await expect(prompt.getByRole("status")).toHaveText("Claude Code wants to run a command");
    await expect(prompt.getByRole("textbox", { name: "The command" })).toHaveValue(COMMAND);
    await expect(prompt.getByText(/^Answer here for \d+ s, then in the terminal\.$/)).toBeVisible();
    // the session's card has the same answers and the same command
    await expect(page.locator("[data-agent-card]")).toHaveCount(1);
    await prompt.getByRole("button", { name: "Deny" }).click();
    expect(await denied).toEqual({ behavior: "deny" });
    await expect(prompt).toHaveCount(0);

    // Hold to allow: a lift before 0.6 s answers nothing, a full hold allows
    const allowed = hook(scratch.base, "two");
    await expect(prompt).toBeVisible({ timeout: 10_000 });
    const hold = prompt.getByRole("button", { name: /^Hold to allow/ });
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(800);
    await expect(prompt).toBeVisible();
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    expect(await allowed).toEqual({ behavior: "allow" });
    await expect(prompt).toHaveCount(0);

    // both answers are in this PC's log
    const log = (await (await fetch(`${scratch.base}/api/agents/requests/log`, { headers: { "X-Agent-Answer": "1" } })).json()) as { entries: { answer: string; text: string }[] };
    expect(log.entries.map((e) => e.answer)).toEqual(["deny", "allow"]);
    expect(log.entries[0].text).toBe(COMMAND);
    expect(errors).toEqual([]);
  } finally {
    scratch.stop();
  }
});
