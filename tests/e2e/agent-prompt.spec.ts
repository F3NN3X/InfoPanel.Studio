import fs from "node:fs";
import path from "node:path";
import { startScratch } from "../../tools/perf/scratch.mjs";
import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// Agent approvals from the panel (pinned layer P8, and the security review): a request is shown and answered only in
// InfoPanel Studio's own prompt window (app/agent-prompt.html), by IPC.
//
// - The prompt window, built by `npm run desktop:settings`, served as the app serves it, with the app's IPC stood in for:
//   everything the tool would get shows exactly, Deny is a tap, Allow a full hold, and each answer names the request that
//   was on screen. The answer's way into the server and back to the hook is covered over a real socket by
//   crates/ips-server/tests/routes_approvals.rs and ips-agent's forwarder tests.
// - The kiosk, on a real server with AGENT_APPROVALS=claude and a hook waiting: its card says where to answer and offers
//   nothing, and code on its page can't read or answer the request over HTTP, with the old header or without.

const APP = path.resolve("src-tauri/pages/app");
const ORIGIN = "http://tauri.localhost";
const W = 1024;
const H = 600;

/** What the tool would get, as ips-server's `request_text` sends it: a second line and a run of spaces a one-line box would hide. */
const TEXT = `echo harmless\nrm -rf ~/work      # ${"and a long tail ".repeat(12)}\n\ndescription: List the files`;
const r = (id: string, text: string) => ({ id, agent: "claude", session: "abc", project: "InfoPanel.Studio", tool: "Bash", text, left: 25_000 });

/** The app's side of the prompt window's IPC, in the page: requests to read, answers recorded, events sent on demand. */
function standInForTheApp(first: unknown) {
  const callbacks = new Map<number, (m: unknown) => void>();
  let next = 1;
  const page = window as unknown as Record<string, unknown>;
  page.__answers = [] as unknown[];
  page.__send = (payload: unknown) => {
    for (const cb of callbacks.values()) cb({ event: "agent-requests", id: 1, payload });
  };
  page.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "agent-prompt" }, currentWebview: { windowLabel: "agent-prompt", label: "agent-prompt" } },
    transformCallback: (cb: (m: unknown) => void) => {
      const id = next++;
      callbacks.set(id, cb);
      return id;
    },
    invoke: async (command: string, args: Record<string, unknown>) => {
      if (command === "agent_requests") return first;
      if (command === "agent_answer") {
        (page.__answers as unknown[]).push([args.id, args.behavior]);
        return true;
      }
      if (command === "plugin:event|listen") return 1;
      return null;
    },
  };
}

test("the prompt window shows everything exactly, and each answer goes to the request on screen", async ({ page }) => {
  const entry = path.join(APP, "agent-prompt.html");
  expect(fs.existsSync(entry), "build the app's pages first: npm run desktop:settings").toBe(true);
  const { errors } = watchErrors(page);
  await page.route(`${ORIGIN}/**`, (route) => {
    const file = path.join(APP, decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/app\//, "")));
    return file.startsWith(APP) && fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
  await page.addInitScript(standInForTheApp, { wait: 25_000, requests: [r("r1", TEXT), r("r2", "npm run build")] });
  await page.setViewportSize({ width: 600, height: 460 });
  await page.goto(`${ORIGIN}/app/agent-prompt.html`);
  const prompt = page.locator("[data-agent-prompt]");
  await expect(prompt).toHaveAttribute("data-agent-prompt", "r1");
  await expect(prompt.getByRole("status")).toHaveText("Claude Code wants to run a command");
  const box = prompt.getByRole("textbox", { name: "What it would run, in full" });
  await expect(box).toHaveValue(TEXT);
  // lines kept as they are: not wrapped (a wrapped line would read as two), so the long one scrolls sideways
  expect(await box.evaluate((el) => [getComputedStyle(el).whiteSpace, el.scrollWidth > el.clientWidth])).toEqual(["pre", true]);
  await expect(prompt.getByText(/^Answer here for \d+ s, then in the terminal\. 1 more waiting\.$/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("prompt-window.png") });

  await prompt.getByRole("button", { name: "Deny" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __answers: unknown[] }).__answers)).toEqual([["r1", "deny"]]);

  // the app moves on to r2: a lift before 0.6 s answers nothing; a full hold of Enter allows r2
  await page.evaluate((next) => (window as unknown as { __send: (p: unknown) => void }).__send({ wait: 25_000, requests: [next] }), r("r2", "npm run build"));
  await expect(prompt).toHaveAttribute("data-agent-prompt", "r2");
  const hold = prompt.getByRole("button", { name: /^Hold to allow/ });
  await hold.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(200);
  await page.keyboard.up("Enter");
  await page.waitForTimeout(800);
  await page.keyboard.down("Enter");
  await page.waitForTimeout(900);
  await page.keyboard.up("Enter");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __answers: unknown[] }).__answers)).toEqual([
    ["r1", "deny"],
    ["r2", "allow"],
  ]);
  expect(errors).toEqual([]);
});

const config = {
  version: 21,
  activeProfile: "desk",
  profiles: [
    {
      id: "desk",
      name: "Desk",
      width: W,
      height: H,
      cols: 2,
      rows: 1,
      fit: "fill",
      padding: 12,
      gap: 12,
      pages: [{ id: "agents", name: "Agents", placements: [{ id: "a", module: "CodingAgents", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, settings: { view: "sessions" } }] }],
    },
  ],
};

test("the kiosk can't read or answer a request: its card says where to answer", async ({ page }) => {
  const scratch = await startScratch({ env: { AGENT_APPROVALS: "claude" } });
  try {
    const { errors } = watchErrors(page);
    expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
    await settled(page, "[data-page-grid] > *");
    // a hook waiting, as `ips-agent permission claude` posts it
    const body = { hook_event_name: "PermissionRequest", session_id: "one", cwd: "E:\\work\\InfoPanel.Studio", tool_name: "Bash", tool_input: { command: "npm run build" } };
    const headers = { "Content-Type": "application/json", "X-Agent-Event": "1", "X-Agent-Nonce": "0123456789abcdef0123456789abcdef" };
    const held = fetch(`${scratch.base}/api/agents/permission?agent=claude`, { method: "POST", headers, body: JSON.stringify(body) }).catch(() => null);
    const card = page.locator("[data-agent-card]");
    await expect(card.getByText("Answer in InfoPanel Studio's prompt on this PC, or in the terminal.")).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("npm run build")).toHaveCount(0);
    // the page loaded clean; the refusals below are the point
    expect(errors).toEqual([]);

    // code on the kiosk's page (a widget's, say) asks for the request and answers it, with the old header and without
    const tried = await page.evaluate(async () => {
      const read = await fetch("/api/agents/requests", { headers: { "X-Agent-Answer": "1" } });
      const answer = (h: Record<string, string>) => fetch("/api/agents/answer", { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify({ id: "any", behavior: "allow" }) });
      return [read.status, (await answer({ "X-Agent-Answer": "1" })).status, (await answer({})).status, (await read.text()).includes("npm run build")];
    });
    expect(tried).toEqual([403, 403, 403, false]);
    // the request still waits, and its key was made in the scratch user folder, never the data folder
    await expect(card.getByText("Answer in InfoPanel Studio's prompt on this PC, or in the terminal.")).toBeVisible();
    expect(fs.existsSync(path.join(scratch.configDir, "agent-hook.key"))).toBe(true);
    expect(fs.existsSync(path.join(scratch.dataDir, "agent-hook.key"))).toBe(false);
    scratch.stop();
    await held;
  } finally {
    scratch.stop();
  }
});
