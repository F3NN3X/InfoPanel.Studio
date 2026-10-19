/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset base: the build works from any path it is served at.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Agent worktrees live under .claude/; their copies of the tests are not ours.
  // lab/ has its own Vitest config (npm run lab:test).
  test: {
    exclude: [...configDefaults.exclude, ".claude/**", "lab/**"],
    // Component tests opt into a DOM per file (`// @vitest-environment happy-dom`); the setup is a no-op in Node.
    setupFiles: ["src/test/dom-setup.ts"],
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
});
