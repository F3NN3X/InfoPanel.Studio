#!/usr/bin/env node
// CI: runs the commands the plan chose for the e2e job (`e2e_cmds`, a JSON array in $COMMANDS), each one even when an
// earlier one failed, and exits 1 if any did. Without $COMMANDS (the release): the whole e2e and one-editor suites.
// $SHARD ("i/n", a matrix job's part): the e2e specs split n ways, this job's i-th; the other commands run in part 1 only.
// Node built-ins only.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_COMMANDS = ["npm run test:e2e", "npm run test:one-editor"];

/** The commands in `text` (a JSON array of strings), or the defaults when it is empty. */
export function parseCommands(text) {
  if (!text?.trim()) return DEFAULT_COMMANDS;
  const commands = JSON.parse(text);
  if (!Array.isArray(commands) || commands.some((command) => typeof command !== "string")) throw new Error("COMMANDS must be a JSON array of strings");
  return commands;
}

const E2E = /^(npm run test:e2e|npx playwright test --project=e2e)(\s|$)/;

/** `commands` for part `shard` ("i/n") of a split run: the e2e spec commands with Playwright's --shard, the rest in part 1 only. */
export function shardCommands(commands, shard) {
  if (!shard) return commands;
  const m = /^(\d+)\/(\d+)$/.exec(shard);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) throw new Error(`SHARD must be i/n, got ${shard}`);
  return commands.flatMap((command) => {
    if (!E2E.test(command)) return m[1] === "1" ? [command] : [];
    return [command.startsWith("npm run") ? `${command} -- --shard=${shard}` : `${command} --shard=${shard}`];
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const failed = [];
  for (const command of shardCommands(parseCommands(process.env.COMMANDS), process.env.SHARD)) {
    console.log(`\n== ${command.length > 160 ? `${command.slice(0, 159)}…` : command}`);
    if (spawnSync(command, { shell: true, stdio: "inherit" }).status !== 0) failed.push(command);
  }
  if (failed.length) console.error(`\n${failed.length} command(s) failed:\n${failed.map((command) => `  ${command.slice(0, 160)}`).join("\n")}`);
  process.exit(failed.length ? 1 : 0);
}
