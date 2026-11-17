import os from "node:os";
import { defineConfig } from "@playwright/test";
import { playwrightScope, quarantinedFiles } from "./tools/ci/quarantine.mjs";

// Specs held out of the gating runs (tests/quarantine.json, _docs/TESTING.md); QUARANTINE=only runs just those.
const quarantined: string[] = quarantinedFiles(process.cwd());
const quarantineOnly = process.env.QUARANTINE === "only";

// The e2e and perf harness (_docs/performance.md, "The harness"). Every spec starts its own scratch server on a copy
// of tests/fixtures/perf/data (tools/perf/scratch.mjs); none touches the real data folder. Vitest stays the unit runner.
// The perf projects run one worker at a time (the npm scripts pass --workers=1) so runs don't share the CPU.
// Each spec has its own scratch server and port, so specs run side by side: 2 workers fit CI's 4 vCPU runner, and a dev
// machine takes a quarter of its cores (8 on 32 threads). PW_WORKERS overrides both.
const workers = Number(process.env.PW_WORKERS) || (process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 4)));
export default defineConfig({
  outputDir: ".cache/playwright",
  reporter: [["list"]],
  forbidOnly: !!process.env.CI,
  workers,
  projects: [
    {
      name: "e2e",
      // its own folder: a later run (CI runs test:e2e, then test:one-editor) empties only the folders of the projects it runs
      outputDir: ".cache/playwright/e2e",
      testDir: "tests/e2e",
      testMatch: "*.spec.ts",
      ...playwrightScope(quarantined, "tests/e2e", quarantineOnly),
      timeout: 30_000,
      use: { browserName: "chromium", headless: true },
    },
    {
      // Builds the fixtures build the one-editor specs serve.
      name: "one-editor-build",
      // its own folder: a later run (CI runs test:e2e, then test:one-editor) empties only the folders of the projects it runs
      outputDir: ".cache/playwright/one-editor",
      testDir: "tests/visual/one-editor",
      testMatch: "build.setup.ts",
    },
    {
      // The Edit v3 fixtures (src/dev/fixtures) on the fixtures build: npm run test:one-editor.
      name: "one-editor",
      // its own folder: a later run (CI runs test:e2e, then test:one-editor) empties only the folders of the projects it runs
      outputDir: ".cache/playwright/one-editor",
      testDir: "tests/visual/one-editor",
      testMatch: "*.spec.ts",
      ...playwrightScope(quarantined, "tests/visual/one-editor", quarantineOnly),
      dependencies: ["one-editor-build"],
      timeout: 30_000,
      use: { browserName: "chromium", headless: true },
    },
    {
      // The Classic look's pixels per widget kind and material (baselines/ beside the spec). Windows only: the images carry
      // this platform's text rendering. Run by `verify:full` (the `look-visual` check), never in CI.
      name: "look-visual",
      testDir: "tests/visual/look",
      testMatch: "*.spec.ts",
      timeout: 180_000,
      snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2 } },
      use: { browserName: "chromium", headless: true, timezoneId: "UTC", locale: "en-US", deviceScaleFactor: 1, reducedMotion: "reduce" },
      ...(process.platform === "win32" ? {} : { testIgnore: "**" }),
    },
    {
      name: "perf-kiosk",
      testDir: "tests/perf",
      testMatch: ["kiosk-*.perf.ts", "server-*.perf.ts"],
      timeout: 15 * 60_000,
      use: { browserName: "chromium", headless: true, viewport: { width: 1920, height: 550 } },
    },
    {
      name: "perf-studio",
      testDir: "tests/perf",
      testMatch: "studio-*.perf.ts",
      timeout: 15 * 60_000,
      use: { browserName: "chromium", headless: process.env.HEADED !== "1", viewport: { width: 1440, height: 860 } },
    },
    {
      // Attaches to the desktop debug build's WebView2 over CDP (INFOPANEL_STUDIO_CDP_PORT); Windows only.
      name: "desktop",
      testDir: "tests/desktop",
      testMatch: "*.desktop.ts",
      timeout: 15 * 60_000,
      ...(process.platform === "win32" ? {} : { testIgnore: "**" }),
    },
  ],
});
