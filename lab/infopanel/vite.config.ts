/// <reference types="vitest/config" />
// The InfoPanel import lab: its own Vite root, never part of the app build.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { infopanelData } from "./local-data-plugin.ts";

export default defineConfig({
  root: __dirname,
  plugins: [react(), infopanelData()],
  server: { port: 5174, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
