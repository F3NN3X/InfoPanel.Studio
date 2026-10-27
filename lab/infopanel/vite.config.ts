/// <reference types="vitest/config" />
// The InfoPanel import lab: its own Vite root, never part of the app build.
// It imports the app's widget components (native mode, L5) through "@/", with the
// app's Tailwind CSS, read-only: the app itself is not changed by the lab.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { assetStore } from "./asset-store-plugin.ts";
import { fontProxy } from "./font-proxy-plugin.ts";
import { gaugeLibrary } from "./gauge-library-plugin.ts";
import { infopanelData } from "./local-data-plugin.ts";

// `npm run lab:build` builds the page as dist/lab/, which ips-server serves at /lab/ in debug mode only. The dev-server
// plugins below (corpus, installed profiles, gauge library, asset store, font proxy) are dev-only: the built page works
// on the files the user opens.
export default defineConfig(({ command }) => ({
  root: __dirname,
  base: command === "build" ? "./" : "/",
  plugins: [react(), tailwindcss(), infopanelData(), gaugeLibrary(path.join(__dirname, "gauges")), fontProxy(path.join(__dirname, "fonts")), assetStore(path.join(__dirname, "asset-store"))],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  build: { outDir: path.resolve(__dirname, "../../dist/lab"), emptyOutDir: true },
  server: { port: 5174, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
}));
