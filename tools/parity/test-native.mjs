// npm run test:server: builds the ips-server binary, then runs the server suite (tests/server) against it. Extra
// arguments go to Vitest. The suite is left out of a plain `vitest run` (it needs the binary); SERVER_SUITE=1 puts it back.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (cmd, args, options) => spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options }).status ?? 1;

const built = run("cargo", ["build", "-p", "ips-server"], { cwd: path.join(ROOT, "src-tauri") });
if (built !== 0) process.exit(built);
process.exit(run("npx", ["vitest", "run", "tests/server", ...process.argv.slice(2)], { cwd: ROOT, env: { ...process.env, SERVER_SUITE: "1" } }));
