// npm run test:server:native: builds the ips-server binary, then runs the server suite (tests/server) against it
// (SERVER_IMPL=native; the cases tests/server/native-pending.mjs lists are skipped). Extra arguments go to Vitest.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (cmd, args, options) => spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options }).status ?? 1;

const built = run("cargo", ["build", "-p", "ips-server"], { cwd: path.join(ROOT, "src-tauri") });
if (built !== 0) process.exit(built);
process.exit(run("npx", ["vitest", "run", "tests/server", ...process.argv.slice(2)], { cwd: ROOT, env: { ...process.env, SERVER_IMPL: "native" } }));
