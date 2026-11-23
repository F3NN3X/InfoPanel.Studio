import fs from "node:fs";
import path from "node:path";
import { makePack, manifest, saveConfig, test } from "../e2e/fixtures";
import { measurePage, writeResult } from "./measure";

// A pack's motion (L117) on a 20-widget kiosk page: the fixture (every effect at its busiest: tests/fixtures/packs/motion) and every effect
// at its defaults, at Full, against the same page at Off. Report-only, like every perf spec: compare with the kiosk idle lines in
// tools/perf/budgets.json (kioskIdleWarn). MOTION_CASES (a JSON list of [name, pack, fx, Look values]) measures others.

const KINDS = ["CpuMonitor", "GpuMonitor", "MemoryUsage", "NetworkThroughput", "KpiTiles"];
const BUSY = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "packs", "motion", "motion.json"), "utf8"));
const PACKS: Record<string, unknown> = { busy: BUSY, defaults: Object.fromEntries(Object.keys(BUSY).map((k) => [k, {}])) };
const CASES: [string, string, string, Record<string, string>?][] = JSON.parse(process.env.MOTION_CASES ?? "null") ?? [
  ["busy", "busy", "full"],
  ["defaults", "defaults", "full"],
  ["off", "busy", "off"],
];

test("kiosk-motion", async ({ browser, scratch }) => {
  test.setTimeout(600_000);
  for (const [name, motion] of Object.entries(PACKS)) {
    makePack(path.join(scratch.dataDir, "packs"), `motion-${name}`, (dir) => {
      const file = path.join(dir, "pack.json");
      fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), motion }));
    });
  }
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const light = config.profiles.find((p: { id: string }) => p.id === manifest.profiles.light);
  // 20 cards, 2x2 each, on a 10 x 8 grid
  const placements = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, module: KINDS[i % KINDS.length], colStart: (i % 5) * 2 + 1, rowStart: Math.floor(i / 5) * 2 + 1, colSpan: 2, rowSpan: 2, visible: true }));
  const screen = ([name, pack, fx, values]: (typeof CASES)[number]) => ({ ...light, id: `perf-motion-${name}`, name, width: 1920, height: 1080, cols: 10, rows: 8, pages: [{ id: "main", name: "Main", placements }], performance: { fx }, widgetTheme: { values: { lookId: `motion-${pack}`, ...values } } });
  config.profiles = [...config.profiles, ...CASES.map(screen)];
  if (!(await saveConfig(scratch.base, config)).ok) throw new Error("the config was not saved");
  const cases: Record<string, unknown> = {};
  for (const [name] of CASES) cases[`motion-${name}`] = await measurePage(browser, `${scratch.base}/?kiosk=1&profile=perf-motion-${name}`, manifest.kioskZoneSelector, { width: 1920, height: 1080 });
  writeResult("kiosk-motion", { cases });
});
