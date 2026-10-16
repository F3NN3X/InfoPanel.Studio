/// <reference types="vitest/config" />
// The InfoPanel import lab: its own Vite root, never part of the app build.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
