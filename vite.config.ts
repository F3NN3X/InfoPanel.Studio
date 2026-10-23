/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// `vite build --mode stats` (npm run build:stats): an unminified build in .cache/dist-stats with the ticker's debug stats
// (window.__tickerStats, src/lib/ticker.ts) for the perf specs; release builds leave them out.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Relative asset base: the build works from any path it is served at.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
  ...(mode === "stats" ? { define: { "import.meta.env.VITE_TICKER_STATS": JSON.stringify("1") } } : {}),
  build: {
    ...(mode === "stats" ? { outDir: ".cache/dist-stats", emptyOutDir: true, minify: false } : {}),
    // dist/.vite/manifest.json, read by tools/perf/bundle-report.mjs (the server never serves dot folders).
    manifest: true,
    // The studio, and the Help page its rail opens in a browser tab (served as /help.html).
    rollupOptions: { input: [path.resolve(__dirname, "index.html"), path.resolve(__dirname, "help.html")] },
  },
  // Agent worktrees live under .claude/; their copies of the tests are not ours.
  // lab/ has its own Vitest config (npm run lab:test).
  test: {
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
    exclude: [...configDefaults.exclude, ".claude/**", "lab/**"],
    // Component tests opt into a DOM per file (`// @vitest-environment happy-dom`); the setup is a no-op in Node.
    setupFiles: ["tests/setup/dom-setup.ts"],
    // Worker threads start faster than forked processes: about 7.5 s against 10 s for the suite.
    pool: "threads",
  },
  server: {
    port: 5173,
    // The config store and image proxy live in the dashboard server
    // (server.mjs, `npm start`); forward them so dev and the built pages
    // share one config.
    proxy: {
      "/api": "http://127.0.0.1:3922",
      "/events/config": "http://127.0.0.1:3922",
      "/events/control": "http://127.0.0.1:3922",
      "/events/extras": "http://127.0.0.1:3922",
    },
  },
}));
