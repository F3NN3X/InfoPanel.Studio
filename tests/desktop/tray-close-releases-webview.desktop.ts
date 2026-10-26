import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { writeResult } from "../perf/measure";
import { prepareApp, roleCounts } from "./app";

// Task 1.2: with releaseHiddenStudio after1m, a studio closed to the tray is destroyed after a minute: no WebView2
// processes are left, the server keeps serving kiosks and SSE, and Show (a second launch, which the single-instance
// plugin turns into show_main) rebuilds it with the flushed edit in place.

/** The command lines of this run's WebView2 browser processes (diagnostics). */
const webviewBrowsers = (tmp: string) =>
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | ? { $_.CommandLine -like '*${tmp.split("\\").pop()}*' -and $_.CommandLine -notmatch '--type=' } | % { $_.CommandLine }`], { encoding: "utf8" });

const WEBVIEW_ROLES = ["webview", "renderer", "gpu", "utility"] as const;

/** Reads SSE `data:` messages from a stream until `count` arrived or `timeoutMs` passed. */
async function sseMessages(url: string, count: number, timeoutMs: number, during?: () => Promise<void>): Promise<string[]> {
  const messages: string[] = [];
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let started = false;
  try {
    while (messages.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value);
      for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (block.startsWith("data: ")) messages.push(block.slice(6));
      }
      if (!started && messages.length > 0) {
        started = true;
        await during?.();
      }
    }
  } catch {
    // timed out
  }
  await reader.cancel().catch(() => {});
  return messages;
}

test("a studio closed to the tray is released after a minute and rebuilt on Show", async () => {
  test.setTimeout(5 * 60_000);
  const app = await prepareApp({ releaseHiddenStudio: "after1m" });
  try {
    app.launch();
    let { browser, page } = await app.studio(60_000);
    await page.locator('[aria-label="Edit"]').click();
    await page.locator('[data-zone-id="perf-statusbar"]').click();
    const name = page.getByLabel("Zone name");
    await name.fill("Desktop edit");
    await name.press("Enter");
    const before = roleCounts();
    expect(before.renderer).toBeGreaterThan(0);

    // Close to tray with the studio's own Close button (CloseRequested → close_main: flush, hide, suspend).
    await page.locator('[aria-label="Close"]').click();
    await browser.close().catch(() => {});
    // The release thread checks every 10 s (60 s + up to 10 s), then WebView2 takes a moment to exit.
    const hiddenAt = Date.now();
    await new Promise((r) => setTimeout(r, 60_000));
    await expect.poll(() => WEBVIEW_ROLES.reduce((n, role) => n + roleCounts()[role], 0), { timeout: 40_000, intervals: [2000] }).toBe(0);
    const releasedAfterMs = Date.now() - hiddenAt;
    const released = roleCounts();
    expect(released.app).toBe(1);
    expect(app.log()).toMatch(/studio released after 1m hidden/);

    // The flush saved the edit; the server still answers and still pushes config changes.
    const config = await (await fetch(`${app.base}/api/config`)).text();
    expect(config).toContain("Desktop edit");
    expect((await fetch(`${app.base}/?kiosk=1`)).status).toBe(200);
    const pushed = await sseMessages(`${app.base}/events/config`, 2, 5000, async () => {
      const res = await fetch(`${app.base}/api/config`, { method: "POST", headers: { "Content-Type": "application/json", "x-dashboard-config": "1" }, body: config });
      expect(res.status).toBe(200);
    });
    expect(pushed.length).toBe(2);

    // Show: a second launch reaches show_main through the single-instance plugin.
    const shownAt = Date.now();
    app.launch();
    ({ browser, page } = await app.studio(90_000).catch((err) => {
      throw new Error(`${err.message}\napp.log:\n${app.log().split("\n").slice(-15).join("\n")}\nprocesses: ${JSON.stringify(roleCounts())}\nwebview: ${webviewBrowsers(app.scratch.tmp)}`);
    }));
    await page.locator('[aria-label="Edit"]').waitFor();
    const interactiveMs = Date.now() - shownAt;
    await page.locator('[aria-label="Edit"]').click();
    await page.locator('[data-zone-id="perf-statusbar"]').click();
    await expect(page.getByLabel("Zone name")).toHaveValue("Desktop edit");
    const rebuiltMs = Number(/studio rebuilt \((\d+) ms\)/.exec(app.log())?.[1]);
    await browser.close().catch(() => {});

    writeResult("tray-close-releases-webview", { before, released, releasedAfterMs, interactiveMs, rebuiltMs });
    console.log(`released: ${JSON.stringify(released)}; rebuilt ${rebuiltMs} ms (log), interactive ${interactiveMs} ms`);
  } finally {
    app.stop();
  }
});
