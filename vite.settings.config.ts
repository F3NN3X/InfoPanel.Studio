import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// The desktop app's settings window (settings.html + src/settings/): built into src-tauri/pages/app/, which
// Tauri serves next to the static pages (start.html) and git ignores. `npm run desktop:web` runs it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset base: the page loads from the app's local origin (http://tauri.localhost/app/).
  base: "./",
  // None of the studio's public/ files (backgrounds, favicon) belong in the settings window.
  publicDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "src-tauri/pages/app",
    emptyOutDir: true,
    // The CSP has no data: fonts; every asset stays a file.
    assetsInlineLimit: 0,
    rollupOptions: { input: path.resolve(__dirname, "settings.html") },
  },
});
