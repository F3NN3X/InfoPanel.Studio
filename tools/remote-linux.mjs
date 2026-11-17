#!/usr/bin/env node
// The Linux e2e checks CI runs, on a Linux machine of your own over ssh, so a Linux-only failure shows before a push.
//   npm run verify:linux                 the e2e and one-editor suites, as CI's e2e job runs them
//   npm run verify:linux -- <args>       `playwright test <args>` instead (a spec, --grep, --repeat-each ...)
// The machine: IPS_LINUX_HOST, or `git config --local ips.linuxHost user@host`. It needs ssh (key login) and Docker.
// What happens:
//   1. The image (tools/linux/Dockerfile: the Playwright image at package.json's version, plus Rust) is built there once
//      per Playwright version.
//   2. The checkout's files (tracked and untracked, not ignored; uncommitted changes included) go there, and files deleted
//      here are removed there (tools/linux/prune.mjs). node_modules, the Rust target and the cargo cache stay between runs.
//   3. In the container: npm ci when package-lock.json changed, the build, the app pages, ips-server, then the specs, on
//      PW_WORKERS workers (default 8: at 16 the save specs pass their 5 s waits only on a quiet machine).
//   4. The Playwright report comes back to .cache/linux/playwright.
// Exit code: the specs' (or the step that failed). Node built-ins only.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A word for a POSIX shell, single-quoted. */
export const sh = (word) => `'${String(word).replaceAll("'", `'\\''`)}'`;

/** The commands run in the container: install when the lockfile changed, build, then the specs (`args`, or CI's two suites). */
export function innerScript(args) {
  const specs = args.length
    ? `npx playwright test ${args.map(sh).join(" ")}`
    : "npx playwright test --project=e2e; a=$?; npx playwright test --project=one-editor; b=$?; exit $(( a > b ? a : b ))";
  return [
    "set -e",
    'stamp="node_modules/.lock-$(sha256sum package-lock.json | cut -c1-16)"',
    '[ -f "$stamp" ] || { npm ci --no-audit --no-fund --loglevel=error; touch "$stamp"; }',
    "npm run --silent build > .cache/linux-build.log 2>&1 || { tail -40 .cache/linux-build.log; exit 1; }",
    "npm run --silent desktop:settings > /dev/null",
    "(cd src-tauri && cargo build -q -p ips-server)",
    "set +e",
    specs,
  ].join("\n");
}

function hostOf() {
  if (process.env.IPS_LINUX_HOST) return process.env.IPS_LINUX_HOST;
  try {
    return execFileSync("git", ["config", "--get", "ips.linuxHost"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const ssh = (host, command, opts = {}) => spawnSync("ssh", ["-o", "BatchMode=yes", host, command], { stdio: "inherit", ...opts });

/** `producer`'s stdout piped into ssh `command`'s stdin; resolves with the exit codes. */
function pipe(producer, host, command, cwd) {
  return new Promise((resolve) => {
    const a = spawn(producer[0], producer.slice(1), { cwd, stdio: ["ignore", "pipe", "inherit"] });
    const b = spawn("ssh", ["-o", "BatchMode=yes", host, command], { stdio: ["pipe", "inherit", "inherit"] });
    a.stdout.pipe(b.stdin);
    let codes = [];
    const done = () => codes.length === 2 && resolve(codes);
    a.on("close", (c) => {
      codes = [c, ...codes];
      done();
    });
    b.on("close", (c) => {
      codes = [...codes, c];
      done();
    });
  });
}

async function main() {
  const host = hostOf();
  if (!host) {
    console.error("verify:linux: no Linux machine set. Set IPS_LINUX_HOST, or run: git config --local ips.linuxHost user@host");
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const pw = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/@playwright/test/package.json"), "utf8")).version;
  const image = `ips-linux:pw${pw}`;
  const dir = `ips-linux/${path.basename(ROOT)}`;
  const t0 = Date.now();
  const step = (name) => console.log(`verify:linux: ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);

  step(`image ${image} on ${host}`);
  const built = ssh(host, `docker image inspect ${image} >/dev/null 2>&1 || docker build -q -t ${image} --build-arg PW_VERSION=${pw} -`, {
    input: fs.readFileSync(path.join(ROOT, "tools/linux/Dockerfile")),
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (built.status !== 0) process.exit(built.status ?? 1);

  step("sync");
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && fs.existsSync(path.join(ROOT, f)));
  // The list goes along in the tar, so prune.mjs there knows which files this checkout still has.
  const listName = ".sync-files";
  fs.writeFileSync(path.join(ROOT, listName), files.join("\n"));
  try {
    const [tarCode, sshCode] = await pipe(["tar", "-cf", "-", "-T", listName, listName], host, `mkdir -p ~/${dir} && cd ~/${dir} && tar -xf - && node tools/linux/prune.mjs ${listName}`, ROOT);
    if (tarCode !== 0 || sshCode !== 0) process.exit(tarCode || sshCode || 1);
  } finally {
    fs.rmSync(path.join(ROOT, listName), { force: true });
  }

  step("build and run");
  const workers = process.env.PW_WORKERS || "8";
  const run = ssh(
    host,
    `cd ~/${dir} && mkdir -p .cache && docker run --rm --init --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 -e PW_WORKERS=${sh(workers)} -e CARGO_HOME=/work/.cache/cargo -v "$PWD":/work -w /work ${image} bash -c ${sh(innerScript(args))}`,
  );

  step("report");
  const out = path.join(ROOT, ".cache/linux/playwright");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const back = spawnSync("ssh", ["-o", "BatchMode=yes", host, `cd ~/${dir}/.cache/playwright 2>/dev/null && tar -cf - . || true`], { maxBuffer: 1 << 30 });
  if (back.stdout?.length) spawnSync("tar", ["-xf", "-", "-C", out], { input: back.stdout });
  step(`done: exit ${run.status}, report in .cache/linux/playwright`);
  process.exit(run.status ?? 1);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
