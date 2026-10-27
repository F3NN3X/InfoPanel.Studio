import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The fixtures build (`vite build --mode fixtures`, .cache/dist-fixtures) the specs serve; always rebuilt so a spec never
// runs on a stale one. The release build has no fixtures (src/main.tsx).
setup("build the fixtures build", () => {
  setup.setTimeout(120_000);
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--mode", "fixtures"], { cwd: ROOT, stdio: "pipe" });
});
