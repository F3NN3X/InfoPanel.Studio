// Parity cases for the alert engine (tests/fixtures/parity/{alerts,alerts-live}.json): the rule helpers, then scripted
// reading sequences through `evaluate` / `act` / `quieten` with a fake clock (every operator, durations, hysteresis,
// cooldowns, `changes`, `missing`, notifications, several conditions with positional runtime state, tests, quiet hours,
// mute, the history cap), and through `createAlerts` with a fake stream and control store (the page outputs, the config
// hook, the mute route, alerts.json). Quiet hours read the local zone, so these are built with TZ=Europe/Oslo (the Rust
// side pins the same zone). Each step's events, the open alerts and the final state and history are compared.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NOTIFICATION_KEY, act, activeAlerts, conditionsOf, createAlerts, emptyAlertsState, evaluate, isQuiet, keysOf, prefixOf, quieten, rulesOf, takeEvents } from "../../server/alerts.mjs";
import { createControl } from "../../server/control.mjs";

const wire = (v) => JSON.parse(JSON.stringify(v ?? null));
const T0 = 1_000_000;

/** Runs `build` with the process's local zone set to Europe/Oslo. */
function inOslo(build) {
  const before = process.env.TZ;
  process.env.TZ = "Europe/Oslo";
  try {
    return build();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

const sensor = (over = {}, source = {}) => ({ id: "r1", name: "GPU temp", enabled: true, severity: "critical", source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0, ...source }, cooldownSeconds: 0, outputs: {}, ...over });
const notif = (over = {}, source = {}) => ({ id: "n1", name: "Notify", enabled: true, severity: "info", source: { kind: "notification", ...source }, cooldownSeconds: 0, outputs: { display: { seconds: 5 } }, ...over });
const cfg = (rules, extra = {}) => ({ enabled: true, rules, defaults: { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 8 }, ...extra });
const temp = (value, unit = "°C") => ({ "gpu.temp": { value, unit } });
const note = (over = {}) => ({ [NOTIFICATION_KEY]: { text: JSON.stringify({ id: "1", app: "Discord", title: "Hi", body: "hello there", time: 1, ...over }) } });
const multi = (conditions, over = {}, source = {}) => sensor(over, { key: undefined, op: undefined, value: undefined, conditions, ...source });

/* ---------------- helpers ---------------- */

function helperCases(cases) {
  const configs = [
    undefined, null, {}, { enabled: false, rules: [sensor()] }, { rules: "x" }, cfg([sensor(), sensor({ id: "r2" }, { key: "gpu.power" }), sensor({ id: "r3" }, { key: "cpu.temp" }), notif()]),
    cfg([sensor({ enabled: false }), notif({ enabled: false })]), cfg([multi([{ key: "a.b", op: ">", value: 1 }, { key: "  ", op: ">", value: 1 }, { key: "a.c", op: "missing" }, { op: ">" }, 5, null])]),
    cfg([{ id: "r", source: { kind: "sensor", key: "old.style", op: ">", value: 1 } }, { id: "s", source: { kind: "sensor" } }, { id: "t", source: { kind: "other" } }, { id: 5, source: { kind: "notification" } }, { source: { kind: "notification" } }, null, "x", { id: "u", source: [] }]),
    cfg([sensor({}, { key: "nodot" }), sensor({ id: "r2" }, { key: "x.y.z" }), sensor({ id: "r3" }, { key: ".lead" })]),
  ];
  for (const alerts of configs) {
    cases.push({ input: { fn: "keysOf", alerts }, output: keysOf(alerts) });
    cases.push({ input: { fn: "rulesOf", alerts }, output: wire(rulesOf(alerts).map((r) => r.id)) });
  }
  for (const source of [{ key: "a.b", op: ">" }, { conditions: [{ key: "a" }, { key: 5 }, null, "x", { key: "b" }] }, { conditions: "no", key: "z" }, { conditions: [], key: "z" }, {}, { key: 5 }]) {
    cases.push({ input: { fn: "conditionsOf", source }, output: wire(conditionsOf(source)) });
  }
  for (const key of ["gpu.temp", "nodot", "a.b.c", ".x", "x.", ""]) cases.push({ input: { fn: "prefixOf", key }, output: prefixOf(key) });
  for (const buffer of ["", "data: {\"a\":1}\n\n", "data: a\r\n\r\ndata: b\n\n", ": keep-alive\n\ndata:x\n\n", "data: a\ndata: b\n\n", "data:  two spaces\n\n", "event: x\nid: 1\n\ndata: y\n\nrest", "data: a\r\n\r", "data: a\n\n\n\ndata: b\n\n", "a\r\nb\n\n", "data: x\r\ndata: y\r\n\r\ndata: z", "data: cr\r\r\n\n", "\n\ndata: lead\n\n", "data:\n\n", "data\n\n"]) {
    cases.push({ input: { fn: "takeEvents", buffer }, output: wire(takeEvents(buffer)) });
  }
  const oslo = (s) => Date.parse(`${s}+01:00`);
  const windows = [{ from: "22:00", to: "07:00", minSeverity: "critical" }, { from: "09:00", to: "17:00", minSeverity: "warning" }, { from: "09:00", to: "09:00" }, { from: "9:00", to: "17:00" }, { from: "22:00" }, { from: "00:00", to: "24:00", minSeverity: "bogus" }, { from: "99:99", to: "98:98", minSeverity: "info" }, { from: "10:00", to: "09:00" }, "x", null, { from: "22:00", to: "07:00" }];
  const times = ["2026-01-15T23:30:00", "2026-01-15T06:59:00", "2026-01-15T07:00:00", "2026-01-15T12:00:00", "2026-01-15T22:00:00", "2026-01-15T09:00:00", "2026-01-15T17:00:00", "2026-01-15T00:00:00"];
  inOslo(() => {
    for (const quietHours of windows) {
      for (const severity of ["info", "critical", "odd"]) {
        for (const at of times.slice(0, quietHours?.from === "22:00" ? 5 : 3)) cases.push({ input: { fn: "isQuiet", quietHours, severity, now: oslo(at) }, output: isQuiet(quietHours, severity, oslo(at)) });
      }
    }
    // Daylight saving: 03:30 on the last Sunday of March is 01:30 UTC; the window is read on the local clock.
    for (const now of [Date.parse("2026-03-29T00:30:00Z"), Date.parse("2026-03-29T01:30:00Z"), Date.parse("2026-07-01T20:30:00Z"), Date.parse("2026-10-25T00:30:00Z")]) {
      cases.push({ input: { fn: "isQuiet", quietHours: { from: "02:00", to: "04:00", minSeverity: "critical" }, severity: "info", now }, output: isQuiet({ from: "02:00", to: "04:00", minSeverity: "critical" }, "info", now) });
    }
  });
}

/* ---------------- sequences ---------------- */

/**
 * A scripted run: each step is `{ at, readings?, alerts?, muted?, op?: "evaluate" | "act" | "quieten", action? }`. `readings` and
 * `alerts` stay in force until a step names them again. Output: per step the events, the error if any and the open ids; then the
 * final state. Events are written whole in `full` mode, as `[type, id, text, quiet, test, reason]` in `digest` mode; `brief` keeps only
 * the event types, counts and the history's ends.
 */
function sequence(label, alerts, steps, { mode = "digest" } = {}) {
  const input = { fn: "sequence", label, alerts, steps, mode };
  let state = emptyAlertsState();
  let current = alerts;
  let readings = {};
  const results = [];
  for (const step of steps) {
    if ("alerts" in step) current = step.alerts;
    if ("readings" in step) readings = step.readings;
    const op = step.op ?? "evaluate";
    let events = [];
    let error;
    if (op === "evaluate") {
      const r = evaluate(state, current, readings, step.at, step.muted === true);
      state = r.state;
      events = r.events;
    } else if (op === "act") {
      const r = act(state, step.action, current, readings, step.at);
      if (r.error) error = r.error;
      else {
        state = r.state;
        events = r.events;
      }
    } else {
      state = quieten(state);
    }
    const digest = (e) => [e.type, e.alert.id, e.alert.text, e.alert.quiet ?? false, e.alert.test ?? false, e.reason ?? null];
    const result = { events: mode === "full" ? events : mode === "brief" ? events.map((e) => e.type) : events.map(digest) };
    if (error) result.error = error;
    result.active = mode === "brief" ? state.active.length : activeAlerts(state).map((a) => a.id);
    results.push(result);
  }
  const finalState = mode === "brief"
    ? { open: state.active.length, history: state.history.length, first: state.history[0]?.id, last: state.history.at(-1)?.id }
    : { active: state.active, history: state.history };
  return { input: wire(input), output: wire({ steps: results, state: finalState }) };
}

const at = (n) => T0 + n * 1000;
const hold = (readings, ...times) => times.map((t) => ({ at: at(t), readings }));

function operatorCases(cases) {
  const readings = [{ value: 90, unit: "°C" }, { value: 80 }, { text: "42.5" }, { text: "Hot", name: "GPU hotspot" }, {}, { value: 0 }, { text: "" }];
  const conds = [
    [">", 80], [">=", 80], ["<", 80], ["<=", 80], [">", "80"], [">", ""], [">", null], [">", "abc"], ["weird", 50], [undefined, 50], ["=", 80], ["=", "80"], ["=", "hot"], ["=", ""], ["!=", 80], ["≠", 80], ["!=", "HOT"],
    ["contains", "ho"], ["contains", ""], ["contains", 42], ["=", true], [">", [3]], [">", 1e21],
  ];
  for (const [op, value] of conds) {
    // Each reading is followed by a gap, so the next one starts from the same place.
    const steps = readings.flatMap((r, i) => [{ at: at(i * 10), readings: { "gpu.temp": r } }, { at: at(i * 10 + 1), readings: {} }]);
    cases.push(sequence(`op ${String(op)} ${JSON.stringify(value)}`, cfg([sensor({}, { op, value })]), steps));
  }
}

function levelCases(cases) {
  const r = (over, source) => cfg([sensor(over, source)]);
  cases.push(sequence("fires once, stays active, clears", r(), [...hold(temp(90), 0, 1, 2), ...hold(temp(70), 3), ...hold(temp(95), 4)]));
  cases.push(sequence("no reading is unknown", r(), [...hold({}, 0), ...hold(temp(90), 1), ...hold({}, 2, 3), ...hold(temp(70), 4)]));
  cases.push(sequence("forSeconds: waits, restarts when it drops", r({}, { forSeconds: 3 }), [...hold(temp(90), 0, 2), ...hold(temp(70), 2.5), ...hold(temp(90), 3, 5, 6, 6.5, 7)]));
  cases.push(sequence("forSeconds fractional and negative", r({}, { forSeconds: 0.5 }), [...hold(temp(90), 0, 0.4, 0.5, 0.6)]));
  cases.push(sequence("forSeconds not a number counts as zero", r({}, { forSeconds: "3" }), hold(temp(90), 0)));
  cases.push(sequence("hysteresis > clears at or below clearBelow", r({}, { clearBelow: 70 }), [...hold(temp(90), 0), ...hold(temp(75), 1), ...hold(temp(70), 2), ...hold(temp(81), 3), ...hold(temp(75), 4), ...hold(temp(69), 5), ...hold(temp(75), 6)]));
  cases.push(sequence("hysteresis < clears at or above", r({}, { op: "<", value: 20, clearBelow: 30 }), [...hold(temp(10), 0), ...hold(temp(25), 1), ...hold(temp(30), 2), ...hold(temp(19), 3)]));
  cases.push(sequence("hysteresis with a text reading and a non-numeric level", r({}, { op: "=", value: "bad", clearBelow: 10 }), [...hold({ "gpu.temp": { text: "bad" } }, 0), ...hold({ "gpu.temp": { text: "ok" } }, 1)]));
  cases.push(sequence("cooldown blocks a refire after a clear", r({ cooldownSeconds: 10 }), [...hold(temp(90), 0), ...hold(temp(70), 1), ...hold(temp(90), 5, 10.9, 11, 12)]));
  cases.push(sequence("cooldown not a number is none", r({ cooldownSeconds: "10" }), [...hold(temp(90), 0), ...hold(temp(70), 1), ...hold(temp(90), 2)]));
  cases.push(sequence("severity invalid is warning, name missing is the id", cfg([sensor({ severity: "bogus", name: undefined })]), hold(temp(90), 0)));
  cases.push(sequence("severity not a string", cfg([sensor({ severity: 3 })]), hold(temp(90), 0)));
  cases.push(sequence("two rules, one key, duplicate id", cfg([sensor({ id: "a" }), sensor({ id: "b", name: "B" }, { op: "<", value: 95 }), sensor({ id: "a", name: "A2" }, { value: 85 })]), [...hold(temp(90), 0), ...hold(temp(70), 1)]));
  cases.push(sequence("single-key form", cfg([{ id: "old", name: "Old", severity: "info", source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, clearBelow: 70 }, outputs: {} }]), [...hold(temp(90), 0), ...hold(temp(75), 1), ...hold(temp(60), 2)]));
}

function changeCases(cases) {
  const c = (over) => cfg([sensor(over, { op: "changes", value: undefined })]);
  cases.push(sequence("changes: seeds, fires on a change, ignores repeats, then expires", c({ outputs: { display: { seconds: 2 } } }), [...hold(temp(50), 0), ...hold(temp(50), 1), ...hold(temp(51), 2), ...hold(temp(51), 3), ...hold(temp(51), 4), ...hold(temp(52), 5), ...hold(temp(52), 7.1)]));
  cases.push(sequence("changes: text, numeric text and numbers compare as numbers", c({}), [{ at: at(0), readings: { "gpu.temp": { text: "5" } } }, { at: at(1), readings: { "gpu.temp": { value: 5 } } }, { at: at(2), readings: { "gpu.temp": { text: "five" } } }, { at: at(3), readings: { "gpu.temp": { text: "five", value: 5 } } }, { at: at(4), readings: { "gpu.temp": { text: "FIVE" } } }]));
  cases.push(sequence("changes: a gap does not reseed", c({}), [...hold(temp(1), 0), ...hold({}, 1), ...hold(temp(1), 2), ...hold(temp(2), 3)]));
  cases.push(sequence("changes: cooldown blocks while the one-shot shows and after", c({ cooldownSeconds: 20, outputs: { display: { seconds: 3 } } }), [...hold(temp(1), 0), ...hold(temp(2), 1), ...hold(temp(3), 2), ...hold(temp(4), 5), ...hold(temp(5), 21), ...hold(temp(6), 22)]));
  cases.push(sequence("changes: stays until acknowledged at 0 seconds", c({ outputs: { display: { seconds: 0 } } }), [...hold(temp(1), 0), ...hold(temp(2), 1), ...hold(temp(2), 100), { at: at(101), op: "act", action: { action: "ack", id: `${at(1).toString(36)}-1` } }]));
}

function missingCases(cases) {
  const m = (over, source) => cfg([sensor(over, { op: "missing", value: undefined, ...source })]);
  cases.push(sequence("missing: quiet for a key never seen", m(), [...hold({}, 0, 5, 10), ...hold({ "other.x": { value: 1 } }, 11)]));
  cases.push(sequence("missing: fires after forSeconds gone, clears on return", m({}, { forSeconds: 2 }), [...hold(temp(1), 0), ...hold({}, 1, 2, 3, 4), ...hold(temp(1), 5), ...hold({}, 6)]));
  cases.push(sequence("missing: restarts the wait when the key returns", m({}, { forSeconds: 3 }), [...hold(temp(1), 0), ...hold({}, 1, 3), ...hold(temp(1), 3.5), ...hold({}, 4, 6, 7.5)]));
  cases.push(sequence("missing: a dismissed alert waits for the key to return", m(), [...hold(temp(1), 0), ...hold({}, 1), { at: at(2), op: "act", action: { action: "dismiss", id: `${at(1).toString(36)}-1` } }, ...hold({}, 3, 4), ...hold(temp(1), 5), ...hold({}, 6)]));
  cases.push(sequence("missing: text is the stopped-reporting line", m({}, {}), [...hold(temp(1), 0), ...hold({}, 1)]));
  cases.push(sequence("missing: a null reading counts as seen", m(), [...hold({ "gpu.temp": null }, 0), ...hold({}, 1)]));
}

function disabledCases(cases) {
  cases.push(sequence("disabled rule fires nothing", cfg([sensor({ enabled: false })]), hold(temp(90), 0)));
  cases.push(sequence("alerts off fires nothing", { ...cfg([sensor()]), enabled: false }, hold(temp(90), 0)));
  cases.push(sequence("clears an active alert when its rule is disabled", cfg([sensor()]), [...hold(temp(90), 0), { at: at(1), alerts: cfg([sensor({ enabled: false })]) }]));
  cases.push(sequence("clears an active alert when its rule is removed", cfg([sensor()]), [...hold(temp(90), 0), { at: at(1), alerts: cfg([]) }, { at: at(2), alerts: cfg([sensor()]) }]));
  cases.push(sequence("clears an active alert when alerts turn off, and refires when back", cfg([sensor()]), [...hold(temp(90), 0), { at: at(1), alerts: { ...cfg([sensor()]), enabled: false } }, { at: at(2), alerts: cfg([sensor()]) }]));
  cases.push(sequence("alerts missing entirely", undefined, [...hold(temp(90), 0), { at: at(1), op: "act", action: { action: "test", ruleId: "r1" } }]));
}

function notificationCases(cases) {
  const n = (over, source) => cfg([notif(over, source)]);
  cases.push(sequence("baselines the latest and fires on a new id", n(), [...hold(note(), 0), ...hold(note({ id: "2", title: "Yo", body: "again" }), 1), ...hold(note({ id: "2" }), 2), { at: at(7), readings: note({ id: "3" }) }]));
  cases.push(sequence("fires the first notification after an empty start", n(), [...hold({}, 0), ...hold({ "other.x": { value: 1 } }, 1), ...hold(note({ id: "9" }), 2)]));
  cases.push(sequence("filters: apps, exclude and match", cfg([notif({ id: "a" }, { apps: ["discord", 5, "Slack"] }), notif({ id: "b" }, { exclude: ["DISCORD"] }), notif({ id: "c" }, { match: "THERE" }), notif({ id: "d" }, { match: "nope" }), notif({ id: "e" }, { apps: [] })]), [...hold(note(), 0), ...hold(note({ id: "2" }), 1), ...hold(note({ id: "3", app: "Slack", body: "x" }), 2)]));
  cases.push(sequence("malformed input is nothing", n(), [...hold({ [NOTIFICATION_KEY]: { text: "{broken" } }, 0), ...hold({ [NOTIFICATION_KEY]: { text: "[1]" } }, 1), ...hold({ [NOTIFICATION_KEY]: { text: JSON.stringify({ title: "no id" }) } }, 2), ...hold({ [NOTIFICATION_KEY]: { text: JSON.stringify({ id: null }) } }, 3), ...hold({ [NOTIFICATION_KEY]: {} }, 4), ...hold({ [NOTIFICATION_KEY]: { text: 5 } }, 5), ...hold(note({ id: 7, app: null }), 6), ...hold(note({ id: 8 }), 7)]));
  cases.push(sequence("a numeric id compares as text", n(), [...hold(note({ id: 1 }), 0), ...hold(note({ id: "1" }), 1), ...hold(note({ id: 2 }), 2)]));
  cases.push(sequence("stays until acknowledged at 0 seconds, expires otherwise", cfg([notif({ id: "z", outputs: { display: { seconds: 0 } } }), notif({ id: "y", outputs: { display: { seconds: 4 } } })]), [...hold(note(), 0), ...hold(note({ id: "2" }), 1), ...hold(note({ id: "2" }), 4.9, 5, 100)]));
  cases.push(sequence("custom text uses every variable", n({ outputs: { display: { seconds: 5, text: "{app}|{title}|{body}|{name}|{value}|{unit}|{sensor}|{nope}|{app" } } }), [...hold(note(), 0), ...hold(note({ id: "2", body: "a\nb" }), 1)], { mode: "full" }));
  cases.push(sequence("cooldown blocks a second notification", n({ cooldownSeconds: 30 }), [...hold(note(), 0), ...hold(note({ id: "2" }), 1), ...hold(note({ id: "3" }), 2), ...hold(note({ id: "4" }), 31)]));
}

function multiCases(cases) {
  const two = [{ key: "gpu.temp", op: ">", value: 80 }, { key: "cpu.temp", op: ">", value: 90 }];
  const both = (g, c) => ({ "gpu.temp": { value: g, unit: "°C", name: "GPU" }, "cpu.temp": { value: c, unit: "%" } });
  cases.push(sequence("any one condition fires and names the sensors", cfg([multi(two)]), [...hold(both(70, 70), 0), ...hold(both(90, 70), 1), ...hold(both(90, 95), 2), ...hold(both(70, 95), 3), ...hold(both(70, 70), 4)]));
  cases.push(sequence("each condition is timed on its own against the shared forSeconds", cfg([multi(two, {}, { forSeconds: 2 })]), [...hold(both(90, 70), 0), ...hold(both(90, 95), 1), ...hold(both(90, 95), 2), ...hold(both(70, 95), 3), ...hold(both(70, 95), 4), ...hold(both(70, 70), 5)]));
  cases.push(sequence("clears only when no condition is on, each with its own hysteresis", cfg([multi([{ key: "gpu.temp", op: ">", value: 80, clearBelow: 60 }, { key: "cpu.temp", op: "<", value: 10, clearBelow: 20 }])]), [...hold(both(90, 50), 0), ...hold(both(70, 5), 1), ...hold(both(70, 15), 2), ...hold(both(70, 25), 3), ...hold(both(50, 25), 4)]));
  cases.push(sequence("a missing condition beside a threshold one, and a changes one-shot beside a level alert", cfg([multi([{ key: "gpu.temp", op: ">", value: 80 }, { key: "fan.rpm", op: "missing" }, { key: "cpu.temp", op: "changes" }])]), [...hold({ ...both(70, 1), "fan.rpm": { value: 1 } }, 0), ...hold(both(90, 2), 1), ...hold(both(90, 3), 2), ...hold(both(90, 3), 3)]));
  cases.push(sequence("conditions reordered mid-run keep their runtime by index", cfg([multi(two)]), [...hold(both(90, 70), 0), { at: at(1), alerts: cfg([multi([two[1], two[0]])]) }, ...hold(both(90, 70), 2), ...hold(both(70, 95), 3), { at: at(4), alerts: cfg([multi([two[0]])]) }, ...hold(both(70, 95), 5)]));
  cases.push(sequence("unknown holds the dismissed flag", cfg([multi(two)]), [...hold(both(90, 70), 0), { at: at(1), op: "act", action: { action: "dismiss", id: `${at(0).toString(36)}-1` } }, ...hold(both(90, 70), 2), ...hold({ "gpu.temp": { value: 70 } }, 3), ...hold(both(90, 70), 4), ...hold(both(70, 70), 5), ...hold(both(90, 70), 6)]));
  cases.push(sequence("a test shows the conditions that have a reading", cfg([multi(two)]), [{ at: at(0), readings: { "cpu.temp": { value: 12, unit: "%" } }, op: "act", action: { action: "test", ruleId: "r1" } }, { at: at(1), readings: {}, op: "act", action: { action: "test", ruleId: "r1" } }]));
  cases.push(sequence("text for several conditions: readout of text and numbers", cfg([multi([{ key: "a.x", op: "contains", value: "o" }, { key: "a.y", op: ">", value: 1 }, { key: "a.z", op: "missing" }])]), [...hold({ "a.z": { value: 1 } }, 0), ...hold({ "a.x": { text: "on" }, "a.y": { value: 2.26, unit: "W" } }, 1)]));
}

function actCases(cases) {
  const c = cfg([sensor(), notif()]);
  const id = (n, t = 0) => `${at(t).toString(36)}-${n}`;
  cases.push(sequence("acknowledge: flagged, still active, history records it, once", c, [...hold(temp(90), 0), { at: at(1), op: "act", action: { action: "ack", id: id(1) } }, { at: at(2), op: "act", action: { action: "ack", id: id(1) } }]));
  cases.push(sequence("dismiss: gone now, no refire while it holds, refires after it drops", c, [...hold(temp(90), 0), { at: at(1), op: "act", action: { action: "dismiss", id: id(1) } }, ...hold(temp(90), 2), ...hold(temp(70), 3), ...hold(temp(90), 4)]));
  cases.push(sequence("refusals", c, [{ at: at(0), op: "act", action: { action: "test", ruleId: "nope" } }, { at: at(0), op: "act", action: { action: "test" } }, { at: at(0), op: "act", action: { action: "boom" } }, { at: at(0), op: "act", action: {} }, { at: at(0), op: "act", action: null }, { at: at(0), op: "act", action: { action: "ack", id: "nope" } }, { at: at(0), op: "act", action: { action: "dismiss" } }, { at: at(0), op: "act", action: { action: "mute", minutes: 5 } }]));
  cases.push(sequence("tests: a one-shot of a disabled rule, marked test, never quiet, survive rule removal until they expire", cfg([sensor({ enabled: false }), notif({ id: "n2" })], { quietHours: { from: "00:00", to: "23:59", minSeverity: "critical" } }), [{ at: at(0), readings: temp(95), op: "act", action: { action: "test", ruleId: "r1" } }, { at: at(1), op: "act", action: { action: "test", ruleId: "n2" } }, { at: at(2), alerts: cfg([]) }, { at: at(9.1) }], { mode: "full" }));
  cases.push(sequence("a test does not touch the rule's cooldown or level state", cfg([sensor({ cooldownSeconds: 100 })]), [{ at: at(0), readings: temp(90), op: "act", action: { action: "test", ruleId: "r1" } }, ...hold(temp(90), 1), { at: at(2), op: "act", action: { action: "dismiss", id: `${at(1).toString(36)}-2` } }, ...hold(temp(70), 3)]));
  cases.push(sequence("test with a template, no reading", cfg([sensor({ outputs: { display: { text: "{sensor}: {value}{unit} ({name})" } } })]), [{ at: at(0), readings: {}, op: "act", action: { action: "test", ruleId: "r1" } }, { at: at(1), readings: { "gpu.temp": { value: 41.27, unit: "°C", name: "Core" } }, op: "act", action: { action: "test", ruleId: "r1" } }], { mode: "full" }));
}

function shapeCases(cases) {
  const full = sensor({ name: "GPU", profiles: ["desk", "wall"], outputs: { display: { style: "banner", position: "bottom", backdrop: 7, size: "l", seconds: 3, text: "{name} {value}{unit}" }, page: { page: "alerts", profile: "desk", returnAfter: true }, highlight: { zones: ["z1", "z2"] } } }, { op: "changes", value: undefined });
  cases.push(sequence("display over the defaults, the page, highlight and profiles outputs", cfg([full], { defaults: { style: "modal", position: "center", backdrop: "dim", size: "s", seconds: 12 } }), [...hold(temp(1), 0), ...hold(temp(2), 1)], { mode: "full" }));
  cases.push(sequence("display seconds: rule, then defaults, then 8; non-numbers ignored", cfg([sensor({ id: "a", outputs: { display: { seconds: "9" } } }, { op: "changes", value: undefined }), sensor({ id: "b", outputs: { display: { seconds: null } } }, { op: "changes", value: undefined })], { defaults: { seconds: 4 } }), [...hold(temp(1), 0), ...hold(temp(2), 1)], { mode: "full" }));
  cases.push(sequence("outputs of the wrong type are ignored", cfg([sensor({ profiles: [], outputs: { display: "x", page: { profile: "d" }, highlight: { zones: [] } } }), sensor({ id: "b", outputs: { page: "x", highlight: [] } }), sensor({ id: "c", outputs: "x" })]), hold(temp(90), 0), { mode: "full" }));
  cases.push(sequence("highlight carries the sensor key of a sensor rule only", cfg([sensor({ outputs: { highlight: {} } }), notif({ id: "n", outputs: { highlight: { zones: ["a"] }, display: { seconds: 5 } } })]), [...hold(temp(90), 0), ...hold(note(), 1), ...hold(note({ id: "2" }), 2)], { mode: "full" }));
  cases.push(sequence("unit and value forms", cfg([sensor({ id: "a" }, { key: "t.a" }), sensor({ id: "b" }, { key: "t.b", op: "contains", value: "x" }), sensor({ id: "c" }, { key: "t.c" }), sensor({ id: "d" }, { key: "t.d", op: "!=", value: "q" })]), hold({ "t.a": { value: 90.26 }, "t.b": { text: "xyz", unit: 5 }, "t.c": { text: "91", unit: "" }, "t.d": { value: 7, unit: null } }, 0), { mode: "full" }));
  cases.push(sequence("rule name that is not a string", cfg([sensor({ name: 5 }), sensor({ id: "b", name: null }), sensor({ id: "c", name: ["x", "y"] })]), hold(temp(90), 0), { mode: "full" }));
  cases.push(sequence("a notification titled by its app, empty app falls back to the name", cfg([notif()]), [...hold(note(), 0), ...hold(note({ id: "2", app: "" }), 1), ...hold(note({ id: "3", app: undefined, title: undefined, body: undefined }), 2)], { mode: "full" }));
}

function quietCases(cases) {
  const oslo = (s) => Date.parse(`${s}+01:00`);
  const quiet = { from: "22:00", to: "07:00", minSeverity: "critical" };
  const rules = (qh) => cfg([sensor({ id: "c", severity: "critical" }, { key: "t.c" }), sensor({ id: "w", severity: "warning" }, { key: "t.w" }), sensor({ id: "i", severity: "info" }, { key: "t.i" }), sensor({ id: "x", severity: "odd" }, { key: "t.x" })], qh ? { quietHours: qh } : {});
  const all = { "t.c": { value: 90 }, "t.w": { value: 90 }, "t.i": { value: 90 }, "t.x": { value: 90 } };
  cases.push(sequence("a window across midnight, below the minimum severity only", rules(quiet), [{ at: oslo("2026-01-15T23:30:00"), readings: all }]));
  cases.push(sequence("the same outside the window", rules(quiet), [{ at: oslo("2026-01-15T12:00:00"), readings: all }]));
  cases.push(sequence("a same-day window with minSeverity warning", rules({ from: "09:00", to: "17:00", minSeverity: "warning" }), [{ at: oslo("2026-01-15T12:00:00"), readings: all }]));
  cases.push(sequence("bad windows are ignored", rules({ from: "9:00", to: "17:00", minSeverity: "critical" }), [{ at: oslo("2026-01-15T12:00:00"), readings: all }]));
  cases.push(sequence("muted: every new alert is quiet; tests are not", rules(), [{ at: at(0), readings: all, muted: true }, { at: at(1), op: "act", action: { action: "test", ruleId: "c" } }]));
  cases.push(sequence("quieten marks the open alerts and their history, tests excepted, and is a no-op twice", rules(), [{ at: at(0), readings: { "t.c": { value: 90 }, "t.w": { value: 90 } } }, { at: at(1), op: "act", action: { action: "test", ruleId: "i" } }, { at: at(2), op: "quieten" }, { at: at(3), op: "quieten" }, { at: at(4), readings: { "t.c": { value: 90 }, "t.w": { value: 90 }, "t.i": { value: 90 } } }], { mode: "full" }));
}

function historyCases(cases) {
  const c = cfg([sensor()]);
  const steps = [];
  for (let i = 0; i < 205; i++) steps.push({ at: at(i), op: "act", action: { action: "test", ruleId: "r1" } });
  cases.push(sequence("the history is newest first and capped at 200", c, steps, { mode: "brief" }));
}

export function alertsCases() {
  const cases = [];
  helperCases(cases);
  return cases;
}

function build(...builders) {
  const cases = [];
  inOslo(() => {
    for (const b of builders) b(cases);
  });
  return cases;
}

/** The thresholds: every operator, durations, hysteresis, cooldowns, `changes` and `missing`. */
export const alertsThresholdCases = () => build(operatorCases, levelCases, changeCases, missingCases);
/** Which rules run, notifications, several conditions and the client actions. */
export const alertsRuleCases = () => build(disabledCases, notificationCases, multiCases, actCases);
/** What an alert looks like, quiet hours and mute, and the history cap. */
export const alertsOutputCases = () => build(shapeCases, quietCases, historyCases);

/* ---------------- createAlerts ---------------- */

const page = (id) => ({ id, name: id, placements: [] });
const base = (alerts, extra = {}) => ({ activeProfile: "auto", profiles: [{ id: "desk", pages: [page("main"), page("game"), page("alerts")] }, { id: "wall", pages: [page("w1"), page("w2")] }], ...(alerts ? { alerts } : {}), ...extra });

/**
 * A run through `createAlerts` with a fake stream and a real control store: each step is `{ at, feed?, tick?, act?, config?, control? }`.
 * Output per step: the pages, the open ids, the act result and whether alerts are muted; then the control alerts, the history, alerts.json.
 */
function live(label, config, steps, { file } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-fixture-"));
  // The control store logs mute changes.
  const log = console.log;
  console.log = () => {};
  try {
    let current = config;
    let clock = T0;
    const urls = [];
    const connect = (url) => {
      urls.push(url);
      return { close() {} };
    };
    const control = createControl({ file: path.join(dir, "control.json"), readConfig: () => current, tickMs: 0 });
    const alertsFile = path.join(dir, "alerts.json");
    if (file !== undefined) fs.writeFileSync(alertsFile, file);
    const engine = createAlerts({ file: alertsFile, readConfig: () => current, control, now: () => clock, connect, tickMs: 0, saveMs: 0 });
    const results = [];
    for (const step of steps) {
      clock = step.at;
      if ("config" in step) {
        current = step.config;
        control.configChanged();
        engine.configChanged();
      }
      if ("control" in step) control.dispatch(step.control);
      if ("feed" in step) engine.feed(step.feed);
      let result;
      if ("act" in step) result = wire(engine.act(step.act));
      if (result?.mutedUntil) result.mutedUntil = true;
      const state = control.get();
      results.push({
        ...(result ? { result } : {}),
        pages: Object.fromEntries(Object.entries(state.profiles).map(([k, v]) => [k, v.page])),
        active: engine.alerts().map((a) => a.id),
        controlAlerts: state.alerts.length,
        muted: state.mutedUntil !== null,
      });
    }
    engine.stop();
    const saved = fs.readFileSync(alertsFile, "utf8");
    return { input: wire({ fn: "live", label, config, steps, file: file ?? null }), output: wire({ urls: urls.sort(), steps: results, alerts: control.get().alerts, history: engine.history(), file: saved }) };
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const readingsAt = (n, t) => ({ at: at(t), feed: { sensors: { "gpu.temp": { value: n, unit: "°C" } }, removed: [] } });

export function alertsLiveCases() {
  const cases = [];
  const sub = cfg([sensor(), sensor({ id: "r2" }, { key: "gpu.power" }), sensor({ id: "r3" }, { key: "cpu.temp" }), notif()]);
  cases.push(live("urls on the configured base", base(sub, { dataApiUrl: "http://10.0.0.5:3921/" }), [{ at: at(0), feed: { sensors: {} } }]));
  cases.push(live("urls on the default base", base(sub), [{ at: at(0), feed: {} }]));
  cases.push(live("urls with an https base, a path and odd prefixes", base(cfg([sensor({}, { key: "a b.c/d" }), sensor({ id: "b" }, { key: "x'y(z).k" })]), { dataApiUrl: "https://data.example:8443/api///" }), [{ at: at(0), feed: {} }]));
  cases.push(live("urls with a bad base", base(sub, { dataApiUrl: "ftp://x" }), [{ at: at(0), feed: {} }]));
  cases.push(live("no alerts config", base(), [{ at: at(0), feed: { sensors: { "gpu.temp": { value: 99 } } } }]));
  cases.push(live("config saved: rules added then keys changed", base(), [{ at: at(0), feed: {} }, { at: at(1), config: base(cfg([sensor()])) }, readingsAt(90, 2), { at: at(3), config: base(cfg([sensor({}, { value: 95 })])) }, { at: at(4), config: base(cfg([])) }]));
  cases.push(live("feed: merges partial batches and drops removed keys", base(cfg([sensor({}, { op: "missing", value: undefined })])), [readingsAt(1, 0), { at: at(1), feed: { sensors: {}, removed: ["gpu.temp"] } }, { at: at(2), feed: { sensors: { "other.x": { value: 1 } }, removed: [7] } }, { at: at(3), feed: 5 }, { at: at(4), feed: [] }, { at: at(5), feed: { sensors: [1], removed: "gpu.temp" } }]));
  cases.push(live("act: ack, dismiss and the route's refusals", base(cfg([sensor()])), [readingsAt(90, 0), { at: at(1), act: { action: "ack", id: `${at(0).toString(36)}-1` } }, { at: at(2), act: { action: "nope" } }, { at: at(3), act: { action: "dismiss", id: `${at(0).toString(36)}-1` } }, { at: at(4), act: { action: "test", ruleId: "r1" } }]));
  cases.push(live("page output: switches on fire and returns on clear", base(cfg([sensor({ outputs: { page: { page: "alerts", returnAfter: true } } })])), [readingsAt(70, 0), readingsAt(90, 1), readingsAt(90, 2), readingsAt(70, 3)]));
  cases.push(live("page output: does not return if the profile moved on, stays without returnAfter", base(cfg([sensor({ outputs: { page: { page: "alerts", returnAfter: true } } }), sensor({ id: "r2", outputs: { page: { page: "game" } } }, { key: "gpu.power" })])), [readingsAt(90, 0), { at: at(1), control: { type: "page", profile: "desk", page: "game" } }, readingsAt(70, 2), { at: at(3), feed: { sensors: { "gpu.power": { value: 100 } } } }, { at: at(4), feed: { sensors: { "gpu.power": { value: 1 } } } }]));
  cases.push(live("page output: a quiet alert and a test", base(cfg([sensor({ outputs: { page: { page: "alerts", returnAfter: true } } })], { quietHours: { from: "00:00", to: "23:59", minSeverity: "critical" } })), [{ ...readingsAt(90, 0), at: at(0) }, { at: at(1), act: { action: "test", ruleId: "r1" } }]));
  cases.push(live("page output: the named profile, an unknown page, an unknown profile", base(cfg([sensor({ outputs: { page: { page: "w2", profile: "wall", returnAfter: true } } }), sensor({ id: "b", outputs: { page: { page: "nope", returnAfter: true } } }, { key: "gpu.power" }), sensor({ id: "c", outputs: { page: { page: "w1", profile: "ghost", returnAfter: true } } }, { key: "cpu.temp" })])), [readingsAt(90, 0), { at: at(1), feed: { sensors: { "gpu.power": { value: 99 } } } }, { at: at(2), feed: { sensors: { "cpu.temp": { value: 99 } } } }, readingsAt(10, 3)]));
  cases.push(live("page output: profile choice falls to the pinned profile, then the first", base(cfg([sensor({ outputs: { page: { page: "w2", returnAfter: true } } })]), { activeProfile: "wall" }), [readingsAt(90, 0), readingsAt(10, 1)]));
  cases.push(live("page output: the shown profile wins over the pin", base(cfg([sensor({ outputs: { page: { page: "w2", returnAfter: true } } })]), { activeProfile: "desk" }), [{ at: at(0), control: { type: "shown", profile: "wall" } }, readingsAt(90, 1), readingsAt(10, 2)]));
  cases.push(live("mute: quietens, new alerts are quiet, unmute, and the refusals", base(cfg([sensor(), sensor({ id: "r2", outputs: { page: { page: "alerts" } } }, { key: "gpu.power" })])), [readingsAt(90, 0), { at: at(1), act: { action: "mute", minutes: 10 } }, { at: at(2), feed: { sensors: { "gpu.power": { value: 100 } } } }, { at: at(3), act: { action: "mute", minutes: 0 } }, { at: at(4), act: { action: "mute", minutes: 5000 } }, { at: at(5), act: { action: "mute", minutes: "x" } }, { at: at(6), act: { action: "mute" } }, { at: at(7), act: { action: "mute", minutes: 1.5 } }]));
  cases.push(live("history file: written compact, reloaded with open entries closed", base(cfg([sensor()])), [readingsAt(90, 0), readingsAt(70, 1)], { file: JSON.stringify({ history: [{ id: "old-1", ruleId: "x", name: "Old", severity: "info", text: "t", startedAt: 5 }, { id: "old-2", endedAt: 9, keep: [1, 2, { z: 1 }] }, { noid: true }, 5, null] }) }));
  cases.push(live("history file: broken, wrong shape", base(cfg([sensor()])), [readingsAt(90, 0)], { file: "{broken" }));
  cases.push(live("history file: a history that is not a list", base(cfg([sensor()])), [readingsAt(90, 0)], { file: '{"history":{"a":1}}' }));
  cases.push(live("history file: more than 200 entries are cut to 200", base(cfg([sensor()])), [readingsAt(90, 0)], { file: JSON.stringify({ history: Array.from({ length: 230 }, (_, i) => ({ id: `h${i}`, startedAt: i })) }) }));
  return cases;
}
