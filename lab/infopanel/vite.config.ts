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

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss(), infopanelData(), gaugeLibrary(path.join(__dirname, "gauges")), fontProxy(path.join(__dirname, "fonts")), assetStore(path.join(__dirname, "asset-store"))],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  server: { port: 5174, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
