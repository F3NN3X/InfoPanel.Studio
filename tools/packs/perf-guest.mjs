// The perf run's child process (tools/packs/themely-check.mjs `perfRun`): node tools/packs/perf-guest.mjs <guest.mjs> <script.js> <seconds>
// drives a pack's script through the sandbox's guest for <seconds> of frames at Full (30 a second) and Calm (15) with fixture signals,
// and prints the report as JSON.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const issue = (severity, rule, message) => ({ severity, rule, message });
// the caps of src/looks/pack-script/limits.ts
const limits = { GUEST_MS: 2, COMMANDS_MAX: 2000 };

/** The nth percentile (nearest rank) of a sorted list. */
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
const round = (n) => Math.round(n * 1000) / 1000;

/** The fixture the perf run feeds a script: 20 cards on a 1920 x 1080 screen, values that drift, some in warning, texts boxed. */
function fixtureSignals(level, i) {
  const cards = Array.from({ length: 20 }, (_, n) => {
    const value = (Math.sin(i / 40 + n) + 1) / 2;
    const x = (n % 5) * 380 + 10;
    const y = Math.floor(n / 5) * 260 + 10;
    return { x, y, w: 360, h: 240, value: Math.round(value * 100) / 100, state: value > 0.9 ? "crit" : value > 0.75 ? "warn" : "ok", texts: [{ x: x + 12, y: y + 12, w: 120, h: 28, n: 6 }, { x: x + 12, y: y + 60, w: 200, h: 80, n: 3 }] };
  });
  return { level, width: 1920, height: 1080, cards };
}

const [guestFile, scriptFile, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg) || 60;
const { createGuest, loadQuickJS } = await import(pathToFileURL(guestFile).href);
const source = readFileSync(scriptFile, "utf8");
const quickjs = await loadQuickJS();
const levels = {};
const issues = [];
let started = true;
for (const [level, fps] of [["full", 30], ["calm", 15]]) {
  const guest = createGuest(quickjs, source, { seed: 1, level });
  if ("fault" in guest) {
    issues.push(issue("error", "perf-start", `the script did not start: ${guest.fault}`));
    started = false;
    break;
  }
  const frames = Math.round(seconds * fps);
  const ms = [];
  const commands = [];
  let cut = 0;
  let faults = 0;
  let heap = 0;
  for (let i = 0; i < frames; i++) {
    const result = guest.frame((i * 1000) / fps, i % Math.round(fps / 4) === 0 ? fixtureSignals(level, i) : undefined);
    ms.push(result.ms);
    commands.push(Array.isArray(result.commands) ? result.commands.length : 0);
    if (result.interrupted) cut++;
    if (result.fault) faults++;
    if (i % 30 === 0) heap = Math.max(heap, guest.heap());
  }
  heap = Math.max(heap, guest.heap());
  guest.dispose();
  ms.sort((a, b) => a - b);
  commands.sort((a, b) => a - b);
  const p95 = percentile(ms, 95);
  levels[level] = { frames, p95Ms: round(p95), p95Ms4x: round(p95 * 4), p95Ms6x: round(p95 * 6), maxMs: round(ms[ms.length - 1]), cutOff: cut, faults, commandsP95: percentile(commands, 95), commandsMax: commands[commands.length - 1], heapBytes: heap };
  if (cut) issues.push(issue("error", "perf-cut", `${cut} of ${frames} frames at ${level} were cut off at ${limits.GUEST_MS} ms`));
  if (faults) issues.push(issue("error", "perf-fault", `the guest faulted at ${level}`));
  if (p95 * 6 > limits.GUEST_MS) issues.push(issue("warn", "perf-slow", `at ${level} the 95th percentile frame is ${round(p95)} ms, ${round(p95 * 6)} ms on a CPU 6 times slower (the budget is ${limits.GUEST_MS} ms)`));
  if (commands[commands.length - 1] >= limits.COMMANDS_MAX) issues.push(issue("warn", "perf-commands", `a frame at ${level} reached the ${limits.COMMANDS_MAX} command cap`));
}
const failed = !started || issues.some((i) => i.severity === "error");
console.log(JSON.stringify({ status: failed ? "failed" : "passed", seconds, throttle: "estimated: the guest's time scaled by 4 and 6, not a throttled CPU", levels, issues }));
