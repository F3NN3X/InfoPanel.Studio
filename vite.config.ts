/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { quarantinedFiles } from "./tools/ci/quarantine.mjs";

// Test files held out of the gating runs (tests/quarantine.json, _docs/TESTING.md); QUARANTINE=only runs just those.
const quarantined: string[] = quarantinedFiles(__dirname);
const quarantineOnly = process.env.QUARANTINE === "only";

/** The test files under `dir` whose source `wants` (a docblock comment near the top, a `vi.mock` call). */
const testFiles = (dir: string, wants: (source: string) => boolean): string[] =>
  readdirSync(path.join(__dirname, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return testFiles(rel, wants);
    return /\.test\.(ts|tsx|mjs)$/.test(entry.name) && wants(readFileSync(path.join(__dirname, rel), "utf8")) ? [rel] : [];
  });
/** Test files that opt into a DOM with `// @vitest-environment happy-dom` (a docblock comment near the top). */
const dom = testFiles("tests", (source) => /^\/\/ @vitest-environment happy-dom$/m.test(source.slice(0, 400))).filter((file) => !file.startsWith("tests/server/"));
/**
 * Node test files that `vi.mock` a module. Vitest 5 keeps a worker's module graph from one file to the next when `isolate` is
 * off, and a mock no longer reaches a module an earlier file already imported, so these run isolated.
 */
const mocking = testFiles("tests", (source) => /^\s*vi\.mock\(/m.test(source)).filter((file) => !dom.includes(file) && !file.startsWith("tests/server/"));

/**
 * Vitest renders the widgets with renderToString, which cannot wait for a widget's chunk (`src/widgets/lazy-widget.tsx`):
 * there each registry group loads its widgets before it exports, and `registry.ts` loads the folder widgets
 * (`src/widgets/<kebab-id>/`, in no group). A top-level await in those files themselves would make Rollup split the kiosk
 * entry into a chunk per module it shares with a widget.
 */
const loadWidgetsInTests = (): Plugin => ({
  name: "load-widgets-in-tests",
  transform(code, id) {
    const file = id.replace(/\\/g, "/");
    if (file.endsWith("/src/widgets/registry.ts")) return `${code}\nawait (await import("@/widgets/lazy-widget")).loadAll(TEMPLATE_MODULES.filter((m) => FOLDER_WIDGETS.some((w) => w.meta.id === m.id)));\n`;
    if (!/\/src\/widgets\/registry\/b\.ts$/.test(file)) return;
    const group = /^export const (GROUP_\w+|TIME_WIDGETS)\b/m.exec(code)?.[1];
    return group ? `${code}\nawait (await import("@/widgets/lazy-widget")).loadAll(${group});\n` : undefined;
  },
});

/**
 * The Widget QA page's WebPage demo frames `/assets/qa/webpage.html` (src/widgets/widget-qa/demo-settings.ts). The page is
 * served by the dev server and emitted by the fixtures and stats builds; a release build leaves it out.
 */
const QA_WEBPAGE = "assets/qa/webpage.html";
const qaWebPage = (mode: string): Plugin => ({
  name: "qa-webpage",
  configureServer(server) {
    server.middlewares.use(`/${QA_WEBPAGE}`, (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(readFileSync(path.resolve(__dirname, "src/dev/qa/webpage.html")));
    });
  },
  generateBundle() {
    if (mode !== "fixtures" && mode !== "stats") return;
    this.emitFile({ type: "asset", fileName: QA_WEBPAGE, source: readFileSync(path.resolve(__dirname, "src/dev/qa/webpage.html")) });
  },
});

// Which files a project runs: `include` is every test file (or just the quarantined ones with QUARANTINE=only), `exclude`
// leaves out tests/server (`npm run test:server`), agent worktrees under .claude/, lab/ (its own config) and the quarantine.
const scope = (kind: "node" | "mocking" | "dom") => {
  const all = quarantineOnly ? quarantined.filter((file) => /\.test\.(ts|tsx|mjs)$/.test(file)) : ["tests/**/*.test.{ts,tsx,mjs}"];
  const skip = [...configDefaults.exclude, ".claude/**", "lab/**", ...(process.env.SERVER_SUITE ? [] : ["tests/server/**"]), ...(quarantineOnly ? [] : quarantined)];
  if (kind === "node") return { include: all, exclude: [...skip, ...dom, ...mocking] };
  const only = kind === "dom" ? dom : mocking;
  return { include: quarantineOnly ? all.filter((file) => only.includes(file)) : only, exclude: skip };
};

// `vite build --mode stats` (npm run build:stats): an unminified build in .cache/dist-stats with the ticker's debug stats
// (window.__tickerStats, src/lib/ticker.ts) for the perf specs; release builds leave them out.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), qaWebPage(mode), ...(mode === "test" ? [loadWidgetsInTests()] : [])],
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
    // Component tests opt into a DOM per file (`// @vitest-environment happy-dom`); the setup is a no-op in Node.
    setupFiles: ["tests/setup/dom-setup.ts"],
    // Worker threads start faster than forked processes: about 7.5 s against 10 s for the suite.
    pool: "threads",
    // The default 5 s is shorter than the 10 s waits some DOM tests ask for, and a starved CI worker (Windows nightly, 2026-10-26) hit it.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Vitest hands a stylesheet import back as an empty string; the built-in packs' `pack.css?raw` must be the real text, so the lint tests see it.
    css: { include: [/\/pack\.css/] },
    // Each project starts as many workers as there are cores, so the three together oversubscribe; half the cores each ran the suite about 20% faster on a 32-thread PC.
    maxWorkers: Math.max(1, Math.ceil(availableParallelism() / 2)),
    // Three projects: the Node files share a worker's module graph (`isolate: false`, no fresh load per file); the Node files that mock a module and the DOM files keep a fresh one each.
    projects: [
      { extends: true, test: { name: "node", isolate: false, ...scope("node") } },
      { extends: true, test: { name: "mocking", ...scope("mocking") } },
      { extends: true, test: { name: "dom", ...scope("dom") } },
    ],
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
      "/events/weather": "http://127.0.0.1:3922",
    },
  },
}));
