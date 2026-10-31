/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * Vitest renders the widgets with renderToString, which cannot wait for a widget's chunk (`src/widgets/lazy-widget.tsx`):
 * there each registry group loads its widgets before it exports. A top-level await in the group files themselves would
 * make Rollup split the kiosk entry into a chunk per module it shares with a widget.
 */
const loadWidgetsInTests = (): Plugin => ({
  name: "load-widgets-in-tests",
  transform(code, id) {
    if (!/\/src\/widgets\/registry\/(a|b|c|d|e|history|time)\.ts$/.test(id.replace(/\\/g, "/"))) return;
    const group = /^export const (GROUP_\w+|TIME_WIDGETS)\b/m.exec(code)?.[1];
    return group ? `${code}\nawait (await import("@/widgets/lazy-widget")).loadAll(${group});\n` : undefined;
  },
});

// `vite build --mode stats` (npm run build:stats): an unminified build in .cache/dist-stats with the ticker's debug stats
// (window.__tickerStats, src/lib/ticker.ts) for the perf specs; release builds leave them out.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "test" ? [loadWidgetsInTests()] : [])],
  // Relative asset base: the build works from any path it is served at.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
  ...(mode === "stats" ? { define: { "import.meta.env.VITE_TICKER_STATS": JSON.stringify("1") } } : {}),
  // `vite build --mode fixtures` (npm run build:fixtures): a build in .cache/dist-fixtures that serves
  // ?fixture=one-editor/<name> (src/dev/fixtures) for the Edit v3 specs; release builds leave the fixtures out.
  ...(mode === "fixtures" ? { define: { "import.meta.env.VITE_DEV_FIXTURES": JSON.stringify("1") } } : {}),
  build: {
    ...(mode === "stats" ? { outDir: ".cache/dist-stats", emptyOutDir: true, minify: false } : {}),
    ...(mode === "fixtures" ? { outDir: ".cache/dist-fixtures", emptyOutDir: true } : {}),
    // dist/.vite/manifest.json, read by tools/perf/bundle-report.mjs (the server never serves dot folders).
    manifest: true,
    // Vite's generic 500 kB note fires on sensor-store and studio-view; the real size gate is the gzip budgets in
    // tools/perf/budgets.json, so this only catches a chunk that grows well past today's.
    chunkSizeWarningLimit: 700,
    // The studio, and the Help page its rail opens in a browser tab (served as /help.html).
    rollupOptions: { input: [path.resolve(__dirname, "index.html"), path.resolve(__dirname, "help.html")] },
  },
  // Agent worktrees live under .claude/; their copies of the tests are not ours.
  // lab/ has its own Vitest config (npm run lab:test).
  test: {
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
    // tests/server runs against the ips-server binary: `npm run test:server`.
    exclude: [...configDefaults.exclude, ".claude/**", "lab/**", ...(process.env.SERVER_SUITE ? [] : ["tests/server/**"])],
    // Component tests opt into a DOM per file (`// @vitest-environment happy-dom`); the setup is a no-op in Node.
    setupFiles: ["tests/setup/dom-setup.ts"],
    // Worker threads start faster than forked processes: about 7.5 s against 10 s for the suite.
    pool: "threads",
  },
  server: {
    port: 5173,
    // The config store and image proxy live in the dashboard server
    // (ips-server, `npm start`); forward them so dev and the built pages
    // share one config.
    proxy: {
      "/api": "http://127.0.0.1:3922",
      "/events/config": "http://127.0.0.1:3922",
      "/events/control": "http://127.0.0.1:3922",
      "/events/extras": "http://127.0.0.1:3922",
    },
  },
}));
