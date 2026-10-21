import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORY_MAX, NOTIFICATION_KEY, act, activeAlerts, createAlerts, emptyAlertsState, evaluate, isQuiet, keysOf, prefixOf, quieten, takeEvents } from "../../server/alerts.mjs";
import { createControl } from "../../server/control.mjs";

const T0 = 1_000_000;

const sensor = (over = {}, source = {}) => ({
  id: "r1",
  name: "GPU temp",
  enabled: true,
  severity: "critical",
  source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0, ...source },
  cooldownSeconds: 0,
  outputs: {},
  ...over,
});
const notif = (over = {}, source = {}) => ({
  id: "n1",
  name: "Notify",
  enabled: true,
  severity: "info",
  source: { kind: "notification", ...source },
  cooldownSeconds: 0,
  outputs: { display: { seconds: 5 } },
  ...over,
});
const cfg = (rules, extra = {}) => ({ enabled: true, rules, defaults: { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 8 }, ...extra });
const temp = (value, unit = "°C") => ({ "gpu.temp": { value, unit } });
const note = (over = {}) => ({
  [NOTIFICATION_KEY]: { text: JSON.stringify({ id: "1", app: "Discord", title: "Hi", body: "hello there", time: 1, ...over }) },
});

/** Run readings through evaluate at the given times; returns the final state and all events. */
function run(alerts, steps, state = emptyAlertsState()) {
  const events = [];
  for (const [at, readings] of steps) {
    const r = evaluate(state, alerts, readings, at);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
const fired = (events) => events.filter((e) => e.type === "fire");
const cleared = (events) => events.filter((e) => e.type === "clear");

describe("evaluate: thresholds", () => {
  const cases = [
    [">", 80, 81, 80],
    [">=", 80, 80, 79],
    ["<", 20, 19, 20],
    ["<=", 20, 20, 21],
    ["=", 50, 50, 51],
    ["!=", 50, 51, 50],
  ];
  it("every operator fires on the matching value and not the other", () => {
    for (const [op, value, hit, miss] of cases) {
      const alerts = cfg([sensor({}, { op, value })]);
      expect(fired(run(alerts, [[T0, temp(miss)]]).events), op).toHaveLength(0);
      expect(fired(run(alerts, [[T0, temp(hit)]]).events), op).toHaveLength(1);
    }
  });

  it("compares text for = and != when the value is a string", () => {
    const eq = cfg([sensor({}, { op: "=", value: "Offline", key: "net.state" })]);
    expect(fired(run(eq, [[T0, { "net.state": { text: "offline" } }]]).events)).toHaveLength(1);
    const ne = cfg([sensor({}, { op: "!=", value: "online", key: "net.state" })]);
    expect(fired(run(ne, [[T0, { "net.state": { text: "Online" } }]]).events)).toHaveLength(0);
  });

  it("contains matches text case-insensitively", () => {
    const alerts = cfg([sensor({}, { op: "contains", value: "ERROR", key: "log.last" })]);
    expect(fired(run(alerts, [[T0, { "log.last": { text: "disk error 5" } }]]).events)).toHaveLength(1);
    expect(fired(run(alerts, [[T0, { "log.last": { text: "all fine" } }]]).events)).toHaveLength(0);
  });

  it("does nothing while the sensor has no reading", () => {
    const { events, state } = run(cfg([sensor()]), [[T0, {}]]);
    expect(events).toEqual([]);
    expect(state.active).toEqual([]);
  });

  it("fires once and stays active while the condition holds", () => {
    const { events, state } = run(cfg([sensor()]), [[T0, temp(90)], [T0 + 1000, temp(91)], [T0 + 2000, temp(92)]]);
    expect(fired(events)).toHaveLength(1);
    expect(state.active).toHaveLength(1);
  });

  it("clears when the condition stops holding", () => {
    const { events, state } = run(cfg([sensor()]), [[T0, temp(90)], [T0 + 1000, temp(70)]]);
    expect(cleared(events)).toHaveLength(1);
    expect(state.active).toEqual([]);
    expect(state.history[0].endedAt).toBe(T0 + 1000);
  });
});

describe("evaluate: duration", () => {
  const alerts = cfg([sensor({}, { forSeconds: 5 })]);
  it("fires only after the condition held for forSeconds", () => {
    let r = run(alerts, [[T0, temp(90)], [T0 + 4999, temp(90)]]);
    expect(fired(r.events)).toHaveLength(0);
    r = run(alerts, [[T0 + 5000, temp(90)]], r.state);
    expect(fired(r.events)).toHaveLength(1);
  });
  it("restarts the wait when the condition drops in between", () => {
    const r = run(alerts, [[T0, temp(90)], [T0 + 3000, temp(70)], [T0 + 4000, temp(90)], [T0 + 8000, temp(90)]]);
    expect(fired(r.events)).toHaveLength(0);
    expect(fired(run(alerts, [[T0 + 9000, temp(90)]], r.state).events)).toHaveLength(1);
  });
});

describe("evaluate: hysteresis", () => {
  it("> rules clear only at or below clearBelow", () => {
    const alerts = cfg([sensor({}, { clearBelow: 75 })]);
    let r = run(alerts, [[T0, temp(85)], [T0 + 1000, temp(78)]]);
    expect(r.state.active).toHaveLength(1);
    r = run(alerts, [[T0 + 2000, temp(75)]], r.state);
    expect(r.state.active).toEqual([]);
  });
  it("< rules clear only at or above the level", () => {
    const alerts = cfg([sensor({}, { op: "<", value: 20, key: "gpu.temp", clearBelow: 30 })]);
    let r = run(alerts, [[T0, temp(10)], [T0 + 1000, temp(25)]]);
    expect(r.state.active).toHaveLength(1);
    r = run(alerts, [[T0 + 2000, temp(30)]], r.state);
    expect(r.state.active).toEqual([]);
  });
  it("does not fire between the threshold and the clear level once cleared", () => {
    const alerts = cfg([sensor({}, { clearBelow: 75 })]);
    const r = run(alerts, [[T0, temp(85)], [T0 + 1000, temp(70)], [T0 + 2000, temp(78)]]);
    expect(fired(r.events)).toHaveLength(1);
  });
});

describe("evaluate: cooldown", () => {
  const alerts = cfg([sensor({ cooldownSeconds: 60 })]);
  it("does not refire within the cooldown after a clear, then fires", () => {
    let r = run(alerts, [[T0, temp(90)], [T0 + 1000, temp(70)], [T0 + 2000, temp(90)], [T0 + 60_999, temp(90)]]);
    expect(fired(r.events)).toHaveLength(1);
    r = run(alerts, [[T0 + 61_000, temp(90)]], r.state);
    expect(fired(r.events)).toHaveLength(1);
  });
});

describe("evaluate: changes", () => {
  const alerts = cfg([sensor({ outputs: { display: { seconds: 5 } } }, { op: "changes", key: "media.track" })]);
  const track = (text) => ({ "media.track": { text } });
  it("seeds on the first reading, fires on a change, ignores repeats", () => {
    const r = run(alerts, [[T0, track("a")], [T0 + 1000, track("a")], [T0 + 2000, track("b")], [T0 + 3000, track("b")]]);
    expect(fired(r.events)).toHaveLength(1);
    expect(fired(r.events)[0].alert.value).toBe("b");
  });
  it("is a one-shot that expires after the display seconds", () => {
    let r = run(alerts, [[T0, track("a")], [T0 + 1000, track("b")]]);
    expect(r.state.active).toHaveLength(1);
    r = run(alerts, [[T0 + 5999, track("b")]], r.state);
    expect(r.state.active).toHaveLength(1);
    r = run(alerts, [[T0 + 6000, track("b")]], r.state);
    expect(r.state.active).toEqual([]);
    expect(cleared(r.events)[0].reason).toBe("expired");
  });
  it("respects the cooldown", () => {
    const withCooldown = cfg([sensor({ cooldownSeconds: 60, outputs: { display: { seconds: 5 } } }, { op: "changes", key: "media.track" })]);
    const r = run(withCooldown, [[T0, track("a")], [T0 + 1000, track("b")], [T0 + 10_000, track("c")]]);
    expect(fired(r.events)).toHaveLength(1);
  });
});

describe("evaluate: missing", () => {
  const alerts = cfg([sensor({ cooldownSeconds: 0 }, { op: "missing", key: "plugins.x.fps", forSeconds: 30 })]);
  const fps = { "plugins.x.fps": { value: 60 } };
  it("stays quiet for a key it has never seen", () => {
    expect(fired(run(alerts, [[T0, {}], [T0 + 60_000, {}]]).events)).toHaveLength(0);
  });
  it("fires once the seen key has been gone for forSeconds, and clears when it is back", () => {
    let r = run(alerts, [[T0, fps], [T0 + 1000, {}], [T0 + 30_999, {}]]);
    expect(fired(r.events)).toHaveLength(0);
    r = run(alerts, [[T0 + 31_000, {}], [T0 + 32_000, {}]], r.state);
    expect(fired(r.events)).toHaveLength(1);
    expect(fired(r.events)[0].alert.text).toBe("Stopped reporting");
    r = run(alerts, [[T0 + 40_000, fps]], r.state);
    expect(cleared(r.events)).toHaveLength(1);
    expect(r.state.active).toEqual([]);
  });
  it("restarts the wait when the key comes back in between", () => {
    const r = run(alerts, [[T0, fps], [T0 + 1000, {}], [T0 + 20_000, fps], [T0 + 21_000, {}], [T0 + 40_000, {}]]);
    expect(fired(r.events)).toHaveLength(0);
  });
  it("does not refire a dismissed one until the key returns", () => {
    let r = run(alerts, [[T0, fps], [T0 + 1000, {}], [T0 + 31_000, {}]]);
    const id = r.state.active[0].alert.id;
    r = { state: act(r.state, { id, action: "dismiss" }, alerts, {}, T0 + 32_000).state };
    r = run(alerts, [[T0 + 33_000, {}], [T0 + 90_000, {}]], r.state);
    expect(fired(r.events)).toHaveLength(0);
    r = run(alerts, [[T0 + 91_000, fps], [T0 + 92_000, {}], [T0 + 122_000, {}]], r.state);
    expect(fired(r.events)).toHaveLength(1);
  });
});

describe("evaluate: disabled", () => {
  it("fires nothing for a disabled rule", () => {
    expect(run(cfg([sensor({ enabled: false })]), [[T0, temp(99)]]).events).toEqual([]);
  });
  it("fires nothing when alerts are off", () => {
    expect(run(cfg([sensor()], { enabled: false }), [[T0, temp(99)]]).events).toEqual([]);
  });
  it("clears an active alert when its rule is disabled, removed or alerts turn off", () => {
    const on = run(cfg([sensor()]), [[T0, temp(99)]]);
    expect(run(cfg([sensor({ enabled: false })]), [[T0 + 1000, temp(99)]], on.state).state.active).toEqual([]);
    expect(run(cfg([]), [[T0 + 1000, temp(99)]], on.state).state.active).toEqual([]);
    expect(run(cfg([sensor()], { enabled: false }), [[T0 + 1000, temp(99)]], on.state).state.active).toEqual([]);
  });
});

describe("evaluate: notifications", () => {
  const seed = [[T0, note({ id: "0" })]];
  it("baselines the latest notification and fires on a new id", () => {
    const alerts = cfg([notif()]);
    const r = run(alerts, [...seed, [T0 + 1000, note({ id: "0" })], [T0 + 2000, note({ id: "1" })], [T0 + 3000, note({ id: "1" })]]);
    expect(fired(r.events)).toHaveLength(1);
    expect(fired(r.events)[0].alert).toMatchObject({ app: "Discord", title: "Discord", name: "Notify", text: "Hi\nhello there" });
  });
  it("titles the alert with the app, its text is the notification's title then body, and templates still work", () => {
    const [plain] = fired(run(cfg([notif()]), [...seed, [T0 + 1000, note({ id: "1", body: "" })]]).events);
    expect(plain.alert).toMatchObject({ title: "Discord", text: "Hi" });
    const custom = notif({ outputs: { display: { text: "{app}: {title}" } } });
    const [old] = fired(run(cfg([custom]), [...seed, [T0 + 1000, note({ id: "1" })]]).events);
    expect(old.alert).toMatchObject({ title: "Discord", text: "Discord: Hi" });
  });
  it("a test notification looks like a real one from the app Test", () => {
    const r = act(emptyAlertsState(), { ruleId: "n1", action: "test" }, cfg([notif()]), {}, T0);
    expect(r.state.active[0].alert).toMatchObject({ title: "Test", name: "Notify", text: "Test notification", test: true });
  });
  it("does not fire a stale notification that was there at start", () => {
    expect(fired(run(cfg([notif()]), [[T0, note({ id: "9" })]]).events)).toHaveLength(0);
  });
  it("fires the first notification that arrives after an empty start", () => {
    const r = run(cfg([notif()]), [[T0, { "gpu.temp": { value: 1 } }], [T0 + 1000, note({ id: "1" })]]);
    expect(fired(r.events)).toHaveLength(1);
  });
  it("filters by apps (case-insensitive), exclude and match", () => {
    const hit = (source, over) => fired(run(cfg([notif({}, source)]), [...seed, [T0 + 1000, note({ id: "1", ...over })]]).events).length;
    expect(hit({ apps: ["discord"] }, {})).toBe(1);
    expect(hit({ apps: ["Slack"] }, {})).toBe(0);
    expect(hit({ apps: [] }, {})).toBe(1);
    expect(hit({ exclude: ["DISCORD"] }, {})).toBe(0);
    expect(hit({ match: "HELLO" }, {})).toBe(1);
    expect(hit({ match: "invoice" }, {})).toBe(0);
    expect(hit({ match: "hi" }, { body: "" })).toBe(1);
  });
  it("treats malformed input as nothing", () => {
    const bad = (text) => ({ [NOTIFICATION_KEY]: { text } });
    const r = run(cfg([notif()]), [[T0, bad("{")], [T0 + 1000, bad("[]")], [T0 + 2000, bad(JSON.stringify({ app: "x" }))], [T0 + 3000, { [NOTIFICATION_KEY]: { value: 3 } }]]);
    expect(r.events).toEqual([]);
  });
  it("expires after its seconds, or stays until acknowledged at 0", () => {
    const timed = run(cfg([notif()]), [...seed, [T0 + 1000, note({ id: "1" })], [T0 + 6000, {}]]);
    expect(timed.state.active).toEqual([]);
    const sticky = cfg([notif({ outputs: { display: { seconds: 0 } } })]);
    let r = run(sticky, [...seed, [T0 + 1000, note({ id: "1" })], [T0 + 600_000, {}]]);
    expect(r.state.active).toHaveLength(1);
    r = act(r.state, { id: r.state.active[0].alert.id, action: "ack" }, sticky, {}, T0 + 700_000);
    expect(r.state.active).toEqual([]);
  });
});

describe("evaluate: several conditions", () => {
  const multi = (extra = {}, conditions) =>
    sensor({}, {
      key: undefined,
      op: undefined,
      value: undefined,
      conditions: conditions ?? [
        { key: "cpu.temp", op: ">", value: 95, clearBelow: 90 },
        { key: "gpu.temp", op: ">", value: 85 },
      ],
      ...extra,
    });
  const both = (cpu, gpu) => ({ "cpu.temp": { value: cpu, unit: "°C", name: "CPU temp" }, "gpu.temp": { value: gpu, unit: "°C" } });

  it("fires when any one condition holds and names the sensor with its value", () => {
    const alerts = cfg([multi()]);
    expect(fired(run(alerts, [[T0, both(60, 60)]]).events)).toHaveLength(0);
    const cpu = fired(run(alerts, [[T0, both(96, 60)]]).events);
    expect(cpu).toHaveLength(1);
    expect(cpu[0].alert).toMatchObject({ text: "CPU temp 96°C" });
    const gpu = fired(run(alerts, [[T0, both(60, 86)]]).events);
    expect(gpu[0].alert.text).toBe("temp 86°C");
    const bothHot = fired(run(alerts, [[T0, both(97, 90)]]).events);
    expect(bothHot).toHaveLength(1);
    expect(bothHot[0].alert.text).toBe("CPU temp 97°C, temp 90°C");
  });

  it("times each condition on its own against the shared forSeconds", () => {
    const alerts = cfg([multi({ forSeconds: 5 })]);
    const r = run(alerts, [
      [T0, both(96, 60)],
      [T0 + 3000, both(60, 86)], // cpu dropped before 5 s; gpu just started
      [T0 + 7000, both(60, 86)], // gpu has held 4 s
    ]);
    expect(fired(r.events)).toHaveLength(0);
    expect(fired(run(alerts, [[T0 + 8000, both(60, 86)]], r.state).events)).toHaveLength(1);
  });

  it("clears only when no condition is on, each with its own hysteresis", () => {
    const alerts = cfg([multi()]);
    let r = run(alerts, [[T0, both(96, 60)], [T0 + 1000, both(92, 60)]]);
    expect(r.state.active).toHaveLength(1); // 92 is above the 90 clear level
    r = run(alerts, [[T0 + 2000, both(92, 86)]], r.state); // gpu joins while active
    r = run(alerts, [[T0 + 3000, both(89, 86)]], r.state);
    expect(r.state.active).toHaveLength(1); // cpu cleared, gpu still on
    r = run(alerts, [[T0 + 4000, both(89, 80)]], r.state);
    expect(cleared(r.events)).toHaveLength(1);
    expect(r.state.active).toEqual([]);
  });

  it("keeps working for a rule saved with the single key, op and value", () => {
    const legacy = cfg([sensor({}, { clearBelow: 75 })]);
    const r = run(legacy, [[T0, temp(85)], [T0 + 1000, temp(78)]]);
    expect(r.state.active).toHaveLength(1);
    expect(fired(r.events)[0].alert.text).toBe("85°C");
    expect(keysOf(legacy)).toEqual(["gpu.temp"]);
    expect(run(legacy, [[T0 + 2000, temp(74)]], r.state).state.active).toEqual([]);
  });

  it("subscribes to every condition's key and skips blank ones", () => {
    const alerts = cfg([multi({}, [{ key: "a.x", op: ">", value: 1 }, { key: "", op: ">", value: 1 }, { key: "b.y", op: "<", value: 1 }])]);
    expect(keysOf(alerts)).toEqual(["a.x", "b.y"]);
  });

  it("a missing condition fires beside a threshold one, and a changes condition is a one-shot", () => {
    const alerts = cfg([multi({}, [{ key: "a.x", op: ">", value: 10 }, { key: "b.y", op: "missing", value: 0 }])]);
    const r = run(alerts, [[T0, { "a.x": { value: 1 }, "b.y": { value: 1 } }], [T0 + 1000, { "a.x": { value: 1 } }]]);
    expect(fired(r.events)).toHaveLength(1);
    expect(fired(r.events)[0].alert.text).toBe("y stopped reporting");
    const ch = cfg([multi({}, [{ key: "a.x", op: "changes", value: 0 }, { key: "a.z", op: ">", value: 10 }])]);
    const c = run(ch, [[T0, { "a.x": { value: 1 } }], [T0 + 1000, { "a.x": { value: 2 } }]]);
    expect(fired(c.events)).toHaveLength(1);
    expect(c.state.active[0].oneShot).toBe(true);
  });

  it("a test shows the conditions that have a reading", () => {
    const r = act(emptyAlertsState(), { ruleId: "r1", action: "test" }, cfg([multi()]), both(70, 71), T0);
    expect(r.state.active[0].alert).toMatchObject({ test: true, text: "CPU temp 70°C, temp 71°C" });
  });
});

describe("act", () => {
  const alerts = cfg([sensor()]);
  const live = () => run(alerts, [[T0, temp(90)]]).state;
  it("acknowledges: flagged, still active, history records it", () => {
    const s = live();
    const id = s.active[0].alert.id;
    const r = act(s, { id, action: "ack" }, alerts, {}, T0 + 500);
    expect(r.state.active[0].alert.acknowledged).toBe(true);
    expect(r.state.history[0].acknowledgedAt).toBe(T0 + 500);
    // Still holds: nothing fires again.
    expect(fired(run(alerts, [[T0 + 1000, temp(95)]], r.state).events)).toHaveLength(0);
  });
  it("dismisses: removed now, not refired while the condition holds, refires after it drops", () => {
    const s = live();
    const r = act(s, { id: s.active[0].alert.id, action: "dismiss" }, alerts, {}, T0 + 500);
    expect(r.state.active).toEqual([]);
    expect(r.state.history[0]).toMatchObject({ dismissed: true, endedAt: T0 + 500 });
    let next = run(alerts, [[T0 + 1000, temp(95)]], r.state);
    expect(fired(next.events)).toHaveLength(0);
    next = run(alerts, [[T0 + 2000, temp(50)], [T0 + 3000, temp(95)]], next.state);
    expect(fired(next.events)).toHaveLength(1);
  });
  it("refuses unknown alerts, rules and actions", () => {
    expect(act(live(), { id: "nope", action: "ack" }, alerts, {}, T0).error).toBeTruthy();
    expect(act(live(), { ruleId: "nope", action: "test" }, alerts, {}, T0).error).toBeTruthy();
    expect(act(live(), { action: "boom" }, alerts, {}, T0).error).toBeTruthy();
  });
  it("tests: fires a one-shot of the rule even when disabled, marked test, not quiet", () => {
    const off = cfg([sensor({ enabled: false, outputs: { display: { seconds: 3 } } })], {
      quietHours: { from: "00:00", to: "23:59", minSeverity: "critical" },
    });
    const r = act(emptyAlertsState(), { ruleId: "r1", action: "test" }, off, temp(66), T0);
    expect(r.state.active).toHaveLength(1);
    expect(r.state.active[0].alert).toMatchObject({ test: true, value: 66, text: "66°C" });
    expect(r.state.active[0].alert.quiet).toBeUndefined();
    expect(r.state.history[0].test).toBe(true);
    // The test alert expires on its own even though the rule is disabled.
    expect(evaluate(r.state, off, {}, T0 + 2999).state.active).toHaveLength(1);
    expect(evaluate(r.state, off, {}, T0 + 3000).state.active).toEqual([]);
  });
});

describe("alert shape and text", () => {
  it("resolves the display over the defaults and carries outputs", () => {
    const rule = sensor({
      profiles: ["desk"],
      outputs: {
        display: { style: "overlay", seconds: 0 },
        page: { page: "game", returnAfter: true },
        highlight: { zones: ["z1"] },
      },
    });
    const [alert] = fired(run(cfg([rule]), [[T0, temp(91.26)]]).events).map((e) => e.alert);
    expect(alert).toMatchObject({
      ruleId: "r1",
      name: "GPU temp",
      severity: "critical",
      value: 91.26,
      unit: "°C",
      startedAt: T0,
      acknowledged: false,
      display: { style: "overlay", position: "top-right", backdrop: "none", size: "m", seconds: 0 },
      page: { page: "game", returnAfter: true },
      highlight: { zones: ["z1"], key: "gpu.temp" },
      profiles: ["desk"],
    });
  });
});

describe("quiet hours", () => {
  const at = (h, m) => new Date(2026, 0, 5, h, m).getTime();
  const quiet = { from: "23:00", to: "07:00", minSeverity: "critical" };
  it("covers a window that wraps midnight, below the minimum severity only", () => {
    expect(isQuiet(quiet, "warning", at(23, 30))).toBe(true);
    expect(isQuiet(quiet, "warning", at(2, 0))).toBe(true);
    expect(isQuiet(quiet, "warning", at(6, 59))).toBe(true);
    expect(isQuiet(quiet, "warning", at(7, 0))).toBe(false);
    expect(isQuiet(quiet, "warning", at(12, 0))).toBe(false);
    expect(isQuiet(quiet, "critical", at(2, 0))).toBe(false);
  });
  it("covers a same-day window and ignores bad ones", () => {
    const day = { from: "09:00", to: "17:00", minSeverity: "warning" };
    expect(isQuiet(day, "info", at(10, 0))).toBe(true);
    expect(isQuiet(day, "info", at(18, 0))).toBe(false);
    expect(isQuiet({ from: "x", to: "y", minSeverity: "critical" }, "info", at(10, 0))).toBe(false);
    expect(isQuiet({ from: "10:00", to: "10:00", minSeverity: "critical" }, "info", at(10, 0))).toBe(false);
    expect(isQuiet(undefined, "info", at(10, 0))).toBe(false);
  });
  it("records quiet alerts in history flagged quiet and in the active list as quiet", () => {
    const alerts = cfg([sensor({ severity: "warning" })], { quietHours: quiet });
    const r = run(alerts, [[at(2, 0), temp(95)]]);
    expect(r.state.active[0].alert.quiet).toBe(true);
    expect(r.state.history[0].quiet).toBe(true);
    const loud = run(cfg([sensor({ severity: "critical" })], { quietHours: quiet }), [[at(2, 0), temp(95)]]);
    expect(loud.state.active[0].alert.quiet).toBeUndefined();
  });
});

describe("mute", () => {
  it("makes new fires quiet whatever the severity, still in the history", () => {
    const r = evaluate(emptyAlertsState(), cfg([sensor({ severity: "critical" })]), temp(95), T0, true);
    expect(r.state.active[0].alert.quiet).toBe(true);
    expect(r.state.history[0].quiet).toBe(true);
    expect(fired(r.events)).toHaveLength(1);
  });
  it("quietens the active alerts and their history, tests excepted, and is a no-op when none change", () => {
    const alerts = cfg([sensor()]);
    const s = run(alerts, [[T0, temp(95)]]).state;
    const withTest = act(s, { ruleId: "r1", action: "test" }, alerts, temp(95), T0).state;
    const q = quieten(withTest);
    expect(q.active.map((e) => e.alert.quiet)).toEqual([true, undefined]);
    expect(q.history.filter((h) => h.quiet)).toHaveLength(1);
    expect(quieten(q)).toBe(q);
  });
  it("never quietens a test alert fired while muted", () => {
    const alerts = cfg([sensor()]);
    const r = act(emptyAlertsState(), { ruleId: "r1", action: "test" }, alerts, temp(95), T0);
    expect(r.state.active[0].alert.quiet).toBeUndefined();
  });
  it("mutes through the engine: the route action quietens active alerts and returns mutedUntil", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-mute-"));
    let at = T0;
    const control = createControl({ file: path.join(dir, "control.json"), readConfig: () => null, now: () => at, tickMs: 0 });
    const config = { alerts: cfg([sensor()]) };
    const engine = createAlerts({ file: path.join(dir, "alerts.json"), readConfig: () => config, control, now: () => at, connect: () => ({ close() {} }), tickMs: 0 });
    try {
      engine.feed({ sensors: temp(95) });
      expect(engine.alerts()[0].quiet).toBeUndefined();
      const done = engine.act({ action: "mute", minutes: 5 });
      expect(done.mutedUntil).toBe(T0 + 300_000);
      expect(done.alerts[0].quiet).toBe(true);
      expect(control.get().alerts[0].quiet).toBe(true);
      expect(engine.act({ action: "mute", minutes: 1441 }).error).toBeTruthy();
      expect(engine.act({ action: "mute", minutes: 0 }).mutedUntil).toBeNull();
      expect(engine.alerts()[0].quiet).toBe(true); // unmuting doesn't un-quiet
    } finally {
      engine.stop();
      control.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("history", () => {
  it("is newest first and capped at 200", () => {
    const alerts = cfg([sensor({ outputs: { display: { seconds: 1 } } }, { op: "changes", key: "k.v" })]);
    const steps = [];
    for (let i = 0; i < HISTORY_MAX + 30; i++) steps.push([T0 + i * 10_000, { "k.v": { value: i } }]);
    const r = run(alerts, steps);
    expect(r.state.history).toHaveLength(HISTORY_MAX);
    expect(r.state.history[0].startedAt).toBeGreaterThan(r.state.history[1].startedAt);
    expect(r.state.history[0].text).toContain(String(HISTORY_MAX + 29));
  });
});

describe("helpers", () => {
  it("lists the keys of the enabled rules and the notification feed", () => {
    const alerts = cfg([sensor(), sensor({ id: "r2", enabled: false }, { key: "cpu.temp" }), notif()]);
    expect(keysOf(alerts).sort()).toEqual(["gpu.temp", NOTIFICATION_KEY]);
    expect(keysOf(cfg([sensor()], { enabled: false }))).toEqual([]);
    expect(keysOf(undefined)).toEqual([]);
  });

  it("subscribes to nothing for a rule without a sensor, and never fires it", () => {
    const alerts = cfg([sensor({}, { key: "" })]);
    expect(keysOf(alerts)).toEqual([]);
    const r = evaluate(emptyAlertsState(), alerts, temp(99), 0);
    expect(activeAlerts(r.state)).toEqual([]);
  });
  it("takes the stream prefix up to the last dot", () => {
    expect(prefixOf("gpu.temp")).toBe("gpu.");
    expect(prefixOf("a.b.c")).toBe("a.b.");
    expect(prefixOf("plain")).toBe("plain");
  });
  it("splits SSE events and keeps the unfinished rest", () => {
    const { data, rest } = takeEvents(': hi\n\ndata: {"a":1}\n\ndata: x\r\ndata: y\r\n\r\ndata: {"b"');
    expect(data).toEqual(['{"a":1}', "x\ny"]);
    expect(rest).toBe('data: {"b"');
  });
});

describe("createAlerts", () => {
  const dirs = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-"));
    dirs.push(d);
    return d;
  };
  const page = (id) => ({ id, name: id, placements: [] });

  function setup(initial, extra = {}) {
    const dir = tmp();
    let config = initial;
    let clock = T0;
    const streams = [];
    const connect = vi.fn((url, onEvent) => {
      const stream = { url, onEvent, closed: false, close: () => (stream.closed = true) };
      streams.push(stream);
      return stream;
    });
    const control = createControl({ file: path.join(dir, "control.json"), readConfig: () => config, tickMs: 0 });
    const file = path.join(dir, "alerts.json");
    const engine = createAlerts({ file, readConfig: () => config, control, now: () => clock, connect, tickMs: 0, saveMs: 0, ...extra });
    return {
      engine, control, streams, connect, file,
      setConfig(next) { config = next; control.configChanged(); engine.configChanged(); },
      at(ms) { clock = ms; },
    };
  }
  const base = (alerts) => ({
    activeProfile: "auto",
    profiles: [{ id: "desk", pages: [page("main"), page("game")] }],
    ...(alerts ? { alerts } : {}),
  });

  it("subscribes one stream per distinct prefix with the configured base URL", () => {
    const h = setup({ ...base(cfg([sensor(), sensor({ id: "r2" }, { key: "gpu.power" }), sensor({ id: "r3" }, { key: "cpu.temp" }), notif()])), dataApiUrl: "http://10.0.0.5:3921/" });
    expect(h.streams.map((s) => s.url).sort()).toEqual([
      "http://10.0.0.5:3921/events?prefix=cpu.&interval=1000",
      "http://10.0.0.5:3921/events?prefix=gpu.&interval=1000",
      "http://10.0.0.5:3921/events?prefix=plugins.InfoPanel.Notifications.windows.&interval=1000",
    ]);
    h.engine.stop();
  });

  it("resubscribes only when the key set changes", () => {
    const h = setup(base(cfg([sensor()])));
    h.setConfig(base(cfg([sensor({ name: "renamed" })])));
    expect(h.connect).toHaveBeenCalledTimes(1);
    h.setConfig(base(cfg([sensor(), sensor({ id: "r2" }, { key: "cpu.temp" })])));
    expect(h.connect).toHaveBeenCalledTimes(2);
    h.setConfig(base(cfg([sensor({ id: "r2" }, { key: "cpu.temp" })])));
    expect(h.streams.find((s) => s.url.includes("gpu.")).closed).toBe(true);
    expect(h.streams.find((s) => s.url.includes("cpu.")).closed).toBe(false);
    h.engine.stop();
  });

  it("evaluates feed batches and publishes the active list through the control state", () => {
    const h = setup(base(cfg([sensor()])));
    const seen = [];
    h.control.subscribe((s) => seen.push(s.alerts.length));
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    expect(h.control.get().alerts).toHaveLength(1);
    h.streams[0].onEvent({ sensors: temp(91), removed: [] });
    expect(seen).toEqual([1]);
    h.streams[0].onEvent({ sensors: temp(60), removed: [] });
    expect(h.control.get().alerts).toEqual([]);
    h.engine.stop();
  });

  it("merges partial batches and drops removed keys", () => {
    const h = setup(base(cfg([sensor({}, { op: "<", value: 5 })])));
    h.streams[0].onEvent({ sensors: { "gpu.temp": { value: 50 }, "gpu.other": { value: 1 } }, removed: [] });
    h.streams[0].onEvent({ sensors: { "gpu.other": { value: 2 } }, removed: ["gpu.temp"] });
    expect(h.control.get().alerts).toEqual([]);
    h.engine.stop();
  });

  it("acknowledges and dismisses through act and returns the active list", () => {
    const h = setup(base(cfg([sensor()])));
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    const [a] = h.engine.alerts();
    expect(h.engine.act({ id: a.id, action: "ack" }).alerts[0].acknowledged).toBe(true);
    expect(h.control.get().alerts[0].acknowledged).toBe(true);
    expect(h.engine.act({ id: a.id, action: "dismiss" }).alerts).toEqual([]);
    expect(h.engine.act({ id: a.id, action: "ack" }).error).toBeTruthy();
    h.engine.stop();
  });

  it("switches the page on fire and returns on clear only if still there", () => {
    const rule = sensor({ outputs: { page: { page: "game", returnAfter: true } } });
    const h = setup(base(cfg([rule])));
    h.streams[0].onEvent({ sensors: temp(50), removed: [] });
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    expect(h.control.get().profiles.desk.page).toBe("game");
    h.streams[0].onEvent({ sensors: temp(50), removed: [] });
    expect(h.control.get().profiles.desk.page).toBe("main");

    // Someone moved the profile in the meantime: leave it.
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    h.control.dispatch({ type: "page", profile: "desk", page: "main" });
    h.control.dispatch({ type: "page", profile: "desk", page: "game" });
    h.control.dispatch({ type: "page", profile: "desk", page: "main" });
    h.streams[0].onEvent({ sensors: temp(50), removed: [] });
    expect(h.control.get().profiles.desk.page).toBe("main");
    h.engine.stop();
  });

  it("stays on the alert page without returnAfter, and skips unknown pages and quiet alerts", () => {
    const stay = setup(base(cfg([sensor({ outputs: { page: { page: "game" } } })])));
    stay.streams[0].onEvent({ sensors: temp(90), removed: [] });
    stay.streams[0].onEvent({ sensors: temp(50), removed: [] });
    expect(stay.control.get().profiles.desk.page).toBe("game");
    const bad = setup(base(cfg([sensor({ outputs: { page: { page: "nope" } } })])));
    bad.streams[0].onEvent({ sensors: temp(90), removed: [] });
    expect(bad.control.get().profiles.desk.page).toBe("main");
    expect(bad.control.get().alerts).toHaveLength(1);
    const quietNow = new Date(2026, 0, 5, 2, 0).getTime();
    const q = setup(base(cfg([sensor({ severity: "info", outputs: { page: { page: "game" } } })], { quietHours: { from: "23:00", to: "07:00", minSeverity: "critical" } })));
    q.at(quietNow);
    q.streams[0].onEvent({ sensors: temp(90), removed: [] });
    expect(q.control.get().profiles.desk.page).toBe("main");
    for (const h of [stay, bad, q]) h.engine.stop();
  });

  it("targets the page output at the named profile", () => {
    const config = { ...base(cfg([sensor({ outputs: { page: { profile: "strip", page: "alt" } } })])), profiles: [{ id: "desk", pages: [page("main")] }, { id: "strip", pages: [page("main"), page("alt")] }] };
    const h = setup(config);
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    expect(h.control.get().profiles.strip.page).toBe("alt");
    expect(h.control.get().profiles.desk.page).toBe("main");
    h.engine.stop();
  });

  it("persists history (not active alerts) and reloads it with open entries closed", () => {
    const h = setup(base(cfg([sensor()])));
    h.streams[0].onEvent({ sensors: temp(90), removed: [] });
    h.engine.stop();
    const saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
    expect(saved.history).toHaveLength(1);
    expect(saved.active).toBeUndefined();
    const again = setup(base(cfg([sensor()])), {});
    fs.copyFileSync(h.file, again.file);
    const reloaded = createAlerts({ file: again.file, readConfig: () => base(), control: again.control, now: () => T0 + 5000, connect: again.connect, tickMs: 0 });
    expect(reloaded.alerts()).toEqual([]);
    expect(reloaded.history()[0]).toMatchObject({ ruleId: "r1", endedAt: T0 + 5000 });
    reloaded.stop();
    again.engine.stop();
  });

  it("survives a missing or broken alerts.json", () => {
    const h = setup(base());
    fs.writeFileSync(h.file, "{broken");
    const e = createAlerts({ file: h.file, readConfig: () => base(), control: h.control, connect: h.connect, tickMs: 0 });
    expect(e.history()).toEqual([]);
    e.stop();
  });

  it("evaluates on the tick so durations and one-shot expiry advance without new data", () => {
    vi.useFakeTimers();
    try {
      const h = setup(base(cfg([sensor({}, { forSeconds: 3 })])), { tickMs: 1000 });
      h.streams[0].onEvent({ sensors: temp(90), removed: [] });
      expect(h.control.get().alerts).toEqual([]);
      h.at(T0 + 3000);
      vi.advanceTimersByTime(1000);
      expect(h.control.get().alerts).toHaveLength(1);
      h.engine.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

