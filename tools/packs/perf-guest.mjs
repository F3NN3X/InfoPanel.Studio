// The perf run's child process (tools/packs/themely-check.mjs `perfRun`): node tools/packs/perf-guest.mjs <guest.mjs> <script.js> <seconds>
// drives a pack's script through the sandbox's guest for <seconds> of frames at Full (30 a second) and Calm (15) with fixture signals,
// and prints the report as JSON. Each frame's commands also go through the host's checker (commands.mjs beside the guest), so the new
// drawing commands are covered: what it refuses, what a frame costs against the cost cap, and the checker's own time.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const issue = (severity, rule, message) => ({ severity, rule, message });
// the caps of src/looks/pack-script/limits.ts (WATCHDOG: the runtime falls back after `over` cut frames within `windowMs`)
const limits = { GUEST_MS: 2, COMMANDS_MAX: 2000, COST_MAX: 3000, WATCHDOG: { over: 3, windowMs: 10_000 } };

/** Whether the runtime's watchdog would end the script: `over` cut frames inside one window of frames. */
function watchdogTrips(cutFrames, fps) {
  const span = (limits.WATCHDOG.windowMs / 1000) * fps;
  return cutFrames.some((frame, k) => k + limits.WATCHDOG.over - 1 < cutFrames.length && cutFrames[k + limits.WATCHDOG.over - 1] - frame < span);
}

/** The nth percentile (nearest rank) of a sorted list. */
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
const round = (n) => Math.round(n * 1000) / 1000;

/** The fixture the perf run feeds a script: 20 cards on a 1920 x 1080 screen, values that drift, some in warning, texts boxed. */
function fixtureSignals(level, i) {
  const cards = Array.from({ length: 20 }, (_, n) => {
    const value = (Math.sin(i / 40 + n) + 1) / 2;
    // an event now and then: a card arrives, a value moves, a state changes (the host's `withEvents`, signals.ts)
    const event = i % 120 === 0 ? { arrived: n % 5 === 0, value: n % 2 ? "up" : "down", state: n % 3 === 0 ? "warn" : null } : undefined;
    const x = (n % 5) * 380 + 10;
    const y = Math.floor(n / 5) * 260 + 10;
    return { x, y, w: 360, h: 240, value: Math.round(value * 100) / 100, state: value > 0.9 ? "crit" : value > 0.75 ? "warn" : "ok", ...(event ? { event } : null), texts: [{ x: x + 12, y: y + 12, w: 120, h: 28, n: 6 }, { x: x + 12, y: y + 60, w: 200, h: 80, n: 3 }] };
  });
  return { level, width: 1920, height: 1080, cards };
}

const [guestFile, scriptFile, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg) || 60;
const { createGuest, loadQuickJS } = await import(pathToFileURL(guestFile).href);
const { checkCommands } = await import(pathToFileURL(join(dirname(guestFile), "commands.mjs")).href);
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
  const cutFrames = [];
  const costs = [];
  const checkMs = [];
  let refused = 0;
  let capped = 0;
  let signals;
  let faults = 0;
  let heap = 0;
  for (let i = 0; i < frames; i++) {
    const fresh = i % Math.round(fps / 4) === 0 ? fixtureSignals(level, i) : undefined;
    signals = fresh ?? signals;
    const result = guest.frame((i * 1000) / fps, fresh);
    ms.push(result.ms);
    commands.push(Array.isArray(result.commands) ? result.commands.length : 0);
    if (result.interrupted) cutFrames.push(i);
    else {
      const begin = performance.now();
      const checked = checkCommands(result.commands, { palette: 10, cards: signals?.cards ?? [] });
      checkMs.push(performance.now() - begin);
      costs.push(checked.cost);
      refused += checked.refused;
      if (checked.capped) capped++;
    }
    if (result.fault) faults++;
    if (i % 30 === 0) heap = Math.max(heap, guest.heap());
  }
  heap = Math.max(heap, guest.heap());
  guest.dispose();
  ms.sort((a, b) => a - b);
  commands.sort((a, b) => a - b);
  costs.sort((a, b) => a - b);
  checkMs.sort((a, b) => a - b);
  const p95 = percentile(ms, 95);
  levels[level] = { frames, p95Ms: round(p95), p95Ms4x: round(p95 * 4), p95Ms6x: round(p95 * 6), maxMs: round(ms[ms.length - 1]), cutOff: cutFrames.length, faults, commandsP95: percentile(commands, 95), commandsMax: commands[commands.length - 1], costP95: percentile(costs, 95), costMax: costs[costs.length - 1] ?? 0, checkP95Ms: round(percentile(checkMs, 95)), refused, cappedFrames: capped, heapBytes: heap };
  // A cut frame is dropped and the runtime carries on; only as many as end the script in the kiosk fail the run (a busy machine cuts
  // the odd frame of a good script, so counting every cut would fail it at random).
  if (watchdogTrips(cutFrames, fps)) issues.push(issue("error", "perf-cut", `at ${level} ${limits.WATCHDOG.over} frames within ${limits.WATCHDOG.windowMs / 1000} s were cut off at ${limits.GUEST_MS} ms, so the kiosk would stop the script`));
  else if (cutFrames.length) issues.push(issue("warn", "perf-cut", `${cutFrames.length} of ${frames} frames at ${level} were cut off at ${limits.GUEST_MS} ms (dropped; not enough to stop the script)`));
  if (faults) issues.push(issue("error", "perf-fault", `the guest faulted at ${level}`));
  if (p95 * 6 > limits.GUEST_MS) issues.push(issue("warn", "perf-slow", `at ${level} the 95th percentile frame is ${round(p95)} ms, ${round(p95 * 6)} ms on a CPU 6 times slower (the budget is ${limits.GUEST_MS} ms)`));
  if (refused) issues.push(issue("warn", "perf-refused", `${refused} commands at ${level} were refused by the host's check (out of shape: an unknown op, a colour or gradient that is not there, a number of the wrong kind)`));
  if (capped) issues.push(issue("warn", "perf-cost", `${capped} frames at ${level} passed the cost cap of ${limits.COST_MAX} (glow and gradients cost more than plain shapes) and were cut short`));
  if (commands[commands.length - 1] >= limits.COMMANDS_MAX) issues.push(issue("warn", "perf-commands", `a frame at ${level} reached the ${limits.COMMANDS_MAX} command cap`));
}
const failed = !started || issues.some((i) => i.severity === "error");
console.log(JSON.stringify({ status: failed ? "failed" : "passed", seconds, throttle: "estimated: the guest's time scaled by 4 and 6, not a throttled CPU", levels, issues }));
