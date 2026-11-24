import fs from "node:fs";
import path from "node:path";
import { makePack, manifest, saveConfig, test } from "../e2e/fixtures";
import { measurePage, writeResult } from "./measure";

// A pack's motion (L117) on a 20-widget kiosk page: the fixture (every effect at its busiest: tests/fixtures/packs/motion), every effect
// at its defaults, and a Cyberspec-like pack (`typical`: arrival, decode, a glitch on arrival, scramble, value, list and boot at their
// defaults), each with the fixture's animated page layer, at Full; `typical` without the layer; the same page at Full with no motion and no animated layer (`plain`),
// and at Off; and the built-in Cyberspec as it ships (`cyberspec`: its defaults, its script, its rolling numbers and page art held off by their switches).
// Report-only, like every perf spec: compare with the kiosk idle lines in tools/perf/budgets.json (kioskIdleWarn).
// MOTION_CASES (a JSON list of [name, pack, fx, Look values]; a pack `builtin:<id>` is a built-in Look) measures others.

const KINDS = ["CpuMonitor", "GpuMonitor", "MemoryUsage", "NetworkThroughput", "KpiTiles"];
const BUSY = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "packs", "motion", "motion.json"), "utf8"));
const TYPICAL = { arrival: { style: "clip" }, decode: {}, glitch: {}, scramble: { every: 6 }, value: {}, list: {}, boot: {} };
/** Each pack's motion, and whether it carries the animated layer. */
const PACKS: Record<string, { motion?: unknown; layer: boolean }> = {
  busy: { motion: BUSY, layer: true },
  defaults: { motion: Object.fromEntries(Object.keys(BUSY).map((k) => [k, {}])), layer: true },
  typical: { motion: TYPICAL, layer: true },
  "typical-still": { motion: TYPICAL, layer: false },
  plain: { layer: false },
};
const CASES: [string, string, string, Record<string, string>?][] = JSON.parse(process.env.MOTION_CASES ?? "null") ?? [
  ["busy", "busy", "full"],
  ["defaults", "defaults", "full"],
  ["typical", "typical", "full"],
  ["typical-still", "typical-still", "full"],
  ["plain", "plain", "full"],
  ["off", "busy", "off"],
  ["cyberspec", "builtin:cyberspec", "full"],
];

test("kiosk-motion", async ({ browser, scratch }) => {
  test.setTimeout(600_000);
  for (const [name, { motion, layer }] of Object.entries(PACKS)) {
    makePack(path.join(scratch.dataDir, "packs"), `motion-${name}`, (dir) => {
      const file = path.join(dir, "pack.json");
      const pack = JSON.parse(fs.readFileSync(file, "utf8"));
      // the fixture's animated SVG as the last page layer: it moves at Full and is held still at Off
      fs.copyFileSync(path.join("tests", "fixtures", "packs", "motion", "orbit.svg"), path.join(dir, "assets", "orbit.svg"));
      const layers = layer ? [...pack.stage.layers.slice(0, 2), { image: "orbit.svg", animated: true }] : pack.stage.layers;
      fs.writeFileSync(file, JSON.stringify({ ...pack, stage: { ...pack.stage, layers }, ...(motion ? { motion } : null) }));
    });
  }
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const light = config.profiles.find((p: { id: string }) => p.id === manifest.profiles.light);
  // 20 cards, 2x2 each, on a 10 x 8 grid
  const placements = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, module: KINDS[i % KINDS.length], colStart: (i % 5) * 2 + 1, rowStart: Math.floor(i / 5) * 2 + 1, colSpan: 2, rowSpan: 2, visible: true }));
  const screen = ([name, pack, fx, values]: (typeof CASES)[number]) => ({ ...light, id: `perf-motion-${name}`, name, width: 1920, height: 1080, cols: 10, rows: 8, pages: [{ id: "main", name: "Main", placements }], performance: { fx }, widgetTheme: { values: { lookId: pack.startsWith("builtin:") ? pack.slice(8) : `motion-${pack}`, ...values } } });
  config.profiles = [...config.profiles, ...CASES.map(screen)];
  if (!(await saveConfig(scratch.base, config)).ok) throw new Error("the config was not saved");
  const cases: Record<string, unknown> = {};
  for (const [name] of CASES) cases[`motion-${name}`] = await measurePage(browser, `${scratch.base}/?kiosk=1&profile=perf-motion-${name}`, manifest.kioskZoneSelector, { width: 1920, height: 1080 });
  writeResult("kiosk-motion", { cases });
});
