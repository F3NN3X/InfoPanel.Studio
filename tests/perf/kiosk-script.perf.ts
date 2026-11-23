import fs from "node:fs";
import path from "node:path";
import { makePack, manifest, saveConfig, test } from "../e2e/fixtures";
import { measurePage, writeResult } from "./measure";

// A pack's effect script (the demo, tests/fixtures/packs/script/demo.js) on a 20-widget kiosk page at Full and Calm, against the
// same page at Off. Report-only, like every perf spec: compare with the kiosk idle lines in tools/perf/budgets.json (kioskIdleWarn).
// The page's task time is its main thread's; the guest runs in the worker. The trust and script routes are answered by a stand-in
// for `fetch` until the server lane's routes land (tests/e2e/pack-script.spec.ts does the same with page.route).

const KINDS = ["CpuMonitor", "GpuMonitor", "MemoryUsage", "NetworkThroughput", "KpiTiles"];
const ID = "script-perf";
const DEMO = fs.readFileSync(path.join("tests", "fixtures", "packs", "script", "demo.js"), "utf8");
const CASES = ["full", "calm", "off"] as const;

/** The server's answers for this pack, as the contract gives them. */
const ROUTES = `(() => {
  const real = window.fetch.bind(window);
  const source = ${JSON.stringify(DEMO)};
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/api/packs/${ID}/trust")) return Promise.resolve(Response.json({ state: "verified", hasScript: true, consent: "none", scriptRuns: true }));
    if (url.endsWith("/api/packs/${ID}/fx.js")) return Promise.resolve(new Response(source, { headers: { "Content-Type": "text/javascript" } }));
    return real(input, init);
  };
})();`;

test("kiosk-script", async ({ browser, scratch }) => {
  test.setTimeout(600_000);
  const dir = makePack(path.join(scratch.dataDir, "packs"), ID);
  const file = path.join(dir, "pack.json");
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...pack, script: { file: "fx.js" }, assets: [...pack.assets, { file: "fx.js", bytes: DEMO.length }] }));
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const light = config.profiles.find((p: { id: string }) => p.id === manifest.profiles.light);
  // 20 cards, 2x2 each, on a 10 x 8 grid
  const placements = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, module: KINDS[i % KINDS.length], colStart: (i % 5) * 2 + 1, rowStart: Math.floor(i / 5) * 2 + 1, colSpan: 2, rowSpan: 2, visible: true }));
  const screen = (fx: (typeof CASES)[number]) => ({ ...light, id: `perf-script-${fx}`, name: fx, width: 1920, height: 1080, cols: 10, rows: 8, pages: [{ id: "main", name: "Main", placements }], performance: { fx }, widgetTheme: { values: { lookId: ID } } });
  config.profiles = [...config.profiles, ...CASES.map(screen)];
  if (!(await saveConfig(scratch.base, config)).ok) throw new Error("the config was not saved");
  const cases: Record<string, unknown> = {};
  for (const fx of CASES) {
    cases[`script-${fx}`] = await measurePage(browser, `${scratch.base}/?kiosk=1&profile=perf-script-${fx}`, manifest.kioskZoneSelector, { width: 1920, height: 1080 }, async ({ page }) => {
      if (fx !== "off") await page.locator("canvas[data-fx-ready]").waitFor({ state: "attached", timeout: 15_000 });
    }, [ROUTES]);
  }
  writeResult("kiosk-script", { cases });
});
