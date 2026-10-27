import { defineConfig } from "@playwright/test";

// The e2e and perf harness (docs/performance.md, "The harness"). Every spec starts its own scratch server on a copy
// of tests/fixtures/perf/data (tools/perf/scratch.mjs); none touches the real data folder. Vitest stays the unit runner.
// The perf projects run one worker at a time (the npm scripts pass --workers=1) so runs don't share the CPU.
export default defineConfig({
  outputDir: ".cache/playwright",
  reporter: [["list"]],
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 2,
  projects: [
    {
      name: "e2e",
      testDir: "tests/e2e",
      testMatch: "*.spec.ts",
      timeout: 30_000,
      use: { browserName: "chromium", headless: true },
    },
    {
      // Builds the fixtures build the one-editor specs serve.
      name: "one-editor-build",
      testDir: "tests/visual/one-editor",
      testMatch: "build.setup.ts",
    },
    {
      // The Edit v3 fixtures (src/dev/fixtures) on the fixtures build: npm run test:one-editor.
      name: "one-editor",
      testDir: "tests/visual/one-editor",
      testMatch: "*.spec.ts",
      dependencies: ["one-editor-build"],
      timeout: 30_000,
      use: { browserName: "chromium", headless: true },
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
