import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { DEFAULT_DATA_API, manifest, test } from "../e2e/fixtures";
import { type Sample, summarize, writeResult } from "./measure";

// The server's own footprint with real clients: two kiosks and a studio open (their config, control and extras
// streams), 60 s, the process RSS sampled every 5 s. Also records GET /api/server/stats.
const DURATION_MS = Number(process.env.PERF_SERVER_MS) || 60_000;
const EVERY_MS = 5000;

/** Resident and private MB of a process (Windows: PowerShell; Linux: /proc). */
function memory(pid: number): { rssMB: number; privateMB: number } {
  if (process.platform === "win32") {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$p = Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.PrivateMemorySize64)"`], { encoding: "utf8" });
    const [ws, priv] = out.trim().split(" ").map(Number);
    return { rssMB: ws / 1048576, privateMB: priv / 1048576 };
  }
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  const kb = (field: string) => Number(new RegExp(`${field}:\\s+(\\d+)`).exec(status)?.[1] ?? Number.NaN);
  return { rssMB: kb("VmRSS") / 1024, privateMB: (kb("RssAnon") || kb("VmData")) / 1024 };
}

test("server-idle", async ({ browser, scratch }) => {
  test.setTimeout(DURATION_MS + 120_000);
  const pages = await Promise.all(
    [`/?kiosk=1&profile=${manifest.profiles.heavy}`, `/?kiosk=1&profile=${manifest.profiles.light}`, "/?studio=1"].map(async (path) => {
      const page = await browser.newPage();
      await page.route(DEFAULT_DATA_API, (route) => route.abort("connectionrefused"));
      await page.goto(scratch.base + path);
      return page;
    })
  );
  const startStats = await (await fetch(`${scratch.base}/api/server/stats`)).json();
  const samples: Sample[] = [];
  for (let at = 0; at <= DURATION_MS; at += EVERY_MS) {
    samples.push(memory(scratch.pid));
    if (at < DURATION_MS) await new Promise((r) => setTimeout(r, EVERY_MS));
  }
  const endStats = await (await fetch(`${scratch.base}/api/server/stats`)).json();
  for (const page of pages) await page.close();
  writeResult("server-idle", {
    cases: { server: summarize(samples) },
    first: samples[0],
    last: samples[samples.length - 1],
    stats: { start: startStats, end: endStats },
  });
});
