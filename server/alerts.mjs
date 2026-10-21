// The alert engine: turns the rules in config.alerts and live sensor readings
// into active alerts and a history, and runs their outputs (page switch, the
// list kiosks and the studio read from the control state).
//
// Runtime state, not config: it is not undoable, and it lives here so alerts
// fire with no studio open and every kiosk shows the same alert, cooldown and
// acknowledgement. See docs/redesign/alerts/PLAN.md.
//
// Node built-ins only. `evaluate` and `act` are pure (state in, state out, with
// the clock passed in); `createAlerts` adds the Data API subscription, the
// timers, persistence and the outputs. The rules arrive as the stored JSON, so
// they are read tolerantly here too (the client normalises on load).

import fs from "node:fs";

export const HISTORY_MAX = 200;
/** The Notifications plugin (2.0+) publishes the newest Windows notification here as JSON. */
export const NOTIFICATION_KEY = "plugins.InfoPanel.Notifications.windows.latest";
const DEFAULT_API = "http://127.0.0.1:3921";
const TICK_MS = 1000;
const SAVE_DEBOUNCE_MS = 1000;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

const DEFAULT_DISPLAY = { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 8 };
const RANK = { info: 0, warning: 1, critical: 2 };

/** The empty state. `rules` holds per-rule runtime: pendingSince, active (instance id), clearedAt, last, ... */
export const emptyAlertsState = () => ({ rules: {}, active: [], history: [], seq: 0 });

/** The alerts clients see (each entry keeps its expiry next to the published alert). */
export const activeAlerts = (state) => state.active.map((e) => e.alert);

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const sensorRule = (r) => r.source.kind === "sensor";

/** A sensor source's conditions: its list, or the one key / op / value of a rule saved before v11. */
export function conditionsOf(source) {
  if (Array.isArray(source.conditions)) {
    return source.conditions.filter((c) => isObject(c) && typeof c.key === "string");
  }
  return typeof source.key === "string" ? [source] : [];
}

/** The usable rules of a stored `alerts` value. */
export function rulesOf(alerts) {
  const list = Array.isArray(alerts?.rules) ? alerts.rules : [];
  return list.filter(
    (r) => isObject(r) && typeof r.id === "string" && isObject(r.source) && (r.source.kind === "sensor" ? conditionsOf(r.source).length > 0 : r.source.kind === "notification"),
  );
}

/** Data API keys the engine needs: those of the enabled sensor rules, plus the notification feed. */
export function keysOf(alerts) {
  if (!alerts || alerts.enabled === false) return [];
  const keys = new Set();
  for (const r of rulesOf(alerts)) {
    if (r.enabled === false) continue;
    if (!sensorRule(r)) {
      keys.add(NOTIFICATION_KEY);
      continue;
    }
    // A condition without a sensor yet subscribes to nothing (an empty prefix would be the whole stream).
    for (const c of conditionsOf(r.source)) if (c.key.trim() !== "") keys.add(c.key);
  }
  return [...keys];
}

/** The stream prefix of a key: up to and including its last ".". */
export const prefixOf = (key) => key.slice(0, key.lastIndexOf(".") + 1) || key;

/* ---------------- conditions ---------------- */

const numeric = (reading) => {
  if (typeof reading?.value === "number" && Number.isFinite(reading.value)) return reading.value;
  if (typeof reading?.text === "string" && reading.text.trim() !== "" && Number.isFinite(Number(reading.text))) {
    return Number(reading.text);
  }
  return undefined;
};
const textOf = (reading) =>
  typeof reading?.text === "string" ? reading.text : typeof reading?.value === "number" ? String(reading.value) : undefined;

/** Whether a non-`changes` condition holds: true / false, or null when the sensor has no reading. */
function holds(source, reading) {
  if (!reading) return null;
  const { op } = source;
  if (op === "contains") {
    const text = textOf(reading);
    return text === undefined ? null : text.toLowerCase().includes(String(source.value).toLowerCase());
  }
  if (op === "=" || op === "!=" || op === "≠") {
    const want = typeof source.value === "number" ? source.value : undefined;
    const equal =
      want !== undefined
        ? numeric(reading) === want
        : (textOf(reading) ?? "").toLowerCase() === String(source.value).toLowerCase();
    return op === "=" ? equal : !equal;
  }
  const n = numeric(reading);
  const limit = Number(source.value);
  if (n === undefined || !Number.isFinite(limit)) return null;
  switch (op) {
    case ">=": return n >= limit;
    case "<": return n < limit;
    case "<=": return n <= limit;
    default: return n > limit;
  }
}

/**
 * Whether an active threshold alert clears. With `clearBelow` (hysteresis) a `>` / `>=` rule clears once
 * the value is at or below it and a `<` / `<=` rule once it is at or above it (the same field serves as
 * the clear-above level); otherwise it clears as soon as the condition stops holding.
 */
function clears(source, reading, cond) {
  const level = source.clearBelow;
  const n = numeric(reading);
  if (typeof level === "number" && n !== undefined) {
    if (source.op === ">" || source.op === ">=") return n <= level;
    if (source.op === "<" || source.op === "<=") return n >= level;
  }
  return !cond;
}

/** The value a `changes` rule compares: the number, else the text. */
const changeKey = (reading) => (reading ? (numeric(reading) ?? textOf(reading)) : undefined);

function parseNotification(reading) {
  try {
    const n = JSON.parse(reading?.text ?? "");
    return isObject(n) && n.id !== undefined && n.id !== null ? n : undefined;
  } catch {
    return undefined;
  }
}

const lower = (list) => (Array.isArray(list) ? list.filter((s) => typeof s === "string").map((s) => s.toLowerCase()) : []);

/** Whether a notification passes a rule's `apps` (include), `exclude` and `match` filters. */
function passes(source, n) {
  const app = String(n.app ?? "").toLowerCase();
  const apps = lower(source.apps);
  if (apps.length > 0 && !apps.includes(app)) return false;
  if (lower(source.exclude).includes(app)) return false;
  if (typeof source.match === "string" && source.match !== "") {
    return `${n.title ?? ""} ${n.body ?? ""}`.toLowerCase().includes(source.match.toLowerCase());
  }
  return true;
}

/* ---------------- text, quiet hours ---------------- */

const fmtNumber = (v) => String(Math.round(v * 10) / 10);

function fill(template, vars) {
  return template.replace(/\{(name|value|unit|sensor|app|title|body)\}/g, (_, k) => vars[k] ?? "");
}

const lastSegment = (key) => key.slice(key.lastIndexOf(".") + 1);
const sensorName = ({ cond, reading }) => (typeof reading?.name === "string" && reading.name !== "" ? reading.name : lastSegment(cond.key));
const readout = ({ cond, reading }) => {
  if (cond.op === "missing") return "stopped reporting";
  const n = numeric(reading);
  return n !== undefined ? `${fmtNumber(n)}${reading?.unit ?? ""}` : (textOf(reading) ?? "");
};

const minutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm));
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

/** Whether `now` (local time) is inside the quiet window and `severity` is below its minimum. */
export function isQuiet(quietHours, severity, now) {
  if (!isObject(quietHours)) return false;
  const from = minutes(quietHours.from);
  const to = minutes(quietHours.to);
  if (from === undefined || to === undefined || from === to) return false;
  const d = new Date(now);
  const at = d.getHours() * 60 + d.getMinutes();
  const inside = from < to ? at >= from && at < to : at >= from || at < to;
  return inside && (RANK[severity] ?? 1) < (RANK[quietHours.minSeverity] ?? RANK.critical);
}

/* ---------------- state transitions ---------------- */

const patchRule = (s, id, patch) => {
  s.rules[id] = { ...s.rules[id], ...patch };
};

/**
 * Open an alert instance. `hits` are the sensor conditions that fired, each `{ cond, reading }`.
 * `oneShot` ones expire after the display seconds (0 = when acknowledged).
 */
function start(s, events, { rule, alerts, now, hits, notification, oneShot, test, muted }) {
  const display = { ...DEFAULT_DISPLAY, ...pickDisplay(alerts?.defaults), ...pickDisplay(rule.outputs?.display) };
  const seconds = [rule.outputs?.display?.seconds, alerts?.defaults?.seconds].find(Number.isFinite);
  if (seconds !== undefined) display.seconds = seconds;

  const isSensor = sensorRule(rule);
  const reading = hits?.[0]?.reading;
  const value = isSensor ? (numeric(reading) ?? textOf(reading)) : undefined;
  const unit = isSensor ? (reading?.unit ?? "") : undefined;
  const several = isSensor && conditionsOf(rule.source).length > 1;
  const vars = {
    name: rule.name ?? rule.id,
    value: typeof value === "number" ? fmtNumber(value) : (value ?? ""),
    unit: unit ?? "",
    sensor: hits?.[0] ? sensorName(hits[0]) : "",
    app: notification ? String(notification.app ?? "") : "",
    title: notification ? String(notification.title ?? "") : "",
    body: notification ? String(notification.body ?? "") : "",
  };
  const template =
    typeof rule.outputs?.display?.text === "string" && rule.outputs.display.text !== ""
      ? rule.outputs.display.text
      : isSensor
        ? several
          ? undefined // names the sensors that fired
          : hits?.[0]?.cond.op === "missing"
            ? "Stopped reporting"
            : "{value}{unit}" // the rule name is the alert's title; the body is the reading
        : "{title}\n{body}"; // the source app is the alert's title
  const quiet = !test && (muted === true || isQuiet(alerts?.quietHours, rule.severity, now));

  s.seq += 1;
  const id = `${now.toString(36)}-${s.seq}`;
  const severity = RANK[rule.severity] === undefined ? "warning" : rule.severity;
  const page = isObject(rule.outputs?.page) && typeof rule.outputs.page.page === "string" ? rule.outputs.page : undefined;
  const zones = rule.outputs?.highlight?.zones;
  const highlight = isObject(rule.outputs?.highlight)
    ? {
        ...(Array.isArray(zones) && zones.length > 0 ? { zones } : {}),
        ...(isSensor && hits?.[0] ? { key: hits[0].cond.key } : {}),
      }
    : undefined;
  const text = (template === undefined ? hits.map((h) => `${sensorName(h)} ${readout(h)}`).join(", ") : fill(template, vars)).trim();
  const alert = {
    id,
    ruleId: rule.id,
    name: vars.name,
    title: notification ? vars.app || vars.name : vars.name,
    severity,
    text,
    ...(value !== undefined ? { value } : {}),
    ...(isSensor && unit !== "" ? { unit } : {}),
    ...(notification ? { app: vars.app } : {}),
    startedAt: now,
    acknowledged: false,
    display,
    ...(page ? { page } : {}),
    ...(highlight ? { highlight } : {}),
    ...(Array.isArray(rule.profiles) && rule.profiles.length > 0 ? { profiles: rule.profiles } : {}),
    ...(test ? { test: true } : {}),
    ...(quiet ? { quiet: true } : {}),
  };
  const expiresAt = oneShot && display.seconds > 0 ? now + display.seconds * 1000 : undefined;
  s.active.push({ alert, oneShot, expiresAt });
  s.history = [
    {
      id, ruleId: rule.id, name: alert.name, severity, text, startedAt: now,
      ...(test ? { test: true } : {}),
      ...(quiet ? { quiet: true } : {}),
    },
    ...s.history,
  ].slice(0, HISTORY_MAX);
  events.push({ type: "fire", alert });
  return id;
}

function pickDisplay(d) {
  const out = {};
  if (!isObject(d)) return out;
  for (const k of ["style", "position", "backdrop", "size"]) if (typeof d[k] === "string") out[k] = d[k];
  return out;
}

/** Close an instance: out of the active list, into the history, and the rule's runtime reset. */
function end(s, events, id, now, { dismissed = false, reason = "cleared" } = {}) {
  const entry = s.active.find((e) => e.alert.id === id);
  if (!entry) return;
  const { alert } = entry;
  s.active = s.active.filter((e) => e !== entry);
  s.history = s.history.map((h) =>
    h.id === id ? { ...h, endedAt: now, ...(dismissed ? { dismissed: true } : {}) } : h,
  );
  if (!alert.test) {
    const rs = s.rules[alert.ruleId];
    patchRule(s, alert.ruleId, {
      clearedAt: now,
      ...(rs?.active === id ? { active: undefined, pendingSince: undefined } : {}),
      ...(dismissed && rs?.active === id ? { dismissed: true } : {}),
    });
  }
  events.push({ type: "clear", alert, reason: dismissed ? "dismissed" : reason });
}

/** No refire within the cooldown after a clear (and, for one-shots, while one is still showing). */
function blocked(s, rule, now) {
  const cooldown = Number.isFinite(rule.cooldownSeconds) ? rule.cooldownSeconds * 1000 : 0;
  if (cooldown <= 0) return false;
  if (s.active.some((e) => !e.alert.test && e.alert.ruleId === rule.id && e.oneShot)) return true;
  const cleared = s.rules[rule.id]?.clearedAt;
  return cleared !== undefined && now - cleared < cooldown;
}

/**
 * One evaluation pass. `alerts` is the stored `config.alerts`, `readings` the latest Data API entries
 * (`{ [key]: { value?, text?, unit? } }`). Returns `{ state, events }`; events are
 * `{ type: "fire" | "clear", alert, reason? }` for the outputs. Sensor rules fire after the condition has
 * held `forSeconds`, clear per `clears`, and refire only after `cooldownSeconds`. `changes`, notification
 * and test alerts are one-shots that expire after the display seconds (0 = until acknowledged).
 * Disabled rules, and everything while `alerts.enabled === false`, fire nothing and clear what is active.
 * While `muted`, every new alert is quiet whatever its severity.
 */
export function evaluate(state, alerts, readings, now, muted = false) {
  const s = { ...state, rules: { ...state.rules }, active: [...state.active], history: [...state.history] };
  const events = [];
  const rules = rulesOf(alerts);
  const live = new Map(rules.filter((r) => alerts?.enabled !== false && r.enabled !== false).map((r) => [r.id, r]));

  for (const entry of state.active) {
    if (!entry.alert.test && !live.has(entry.alert.ruleId)) end(s, events, entry.alert.id, now);
  }
  for (const entry of [...s.active]) {
    if (entry.expiresAt !== undefined && now >= entry.expiresAt) end(s, events, entry.alert.id, now, { reason: "expired" });
  }

  for (const rule of live.values()) {
    const rs = s.rules[rule.id] ?? {};
    const ctx = { rule, alerts, now, muted };
    if (sensorRule(rule)) {
      sensorPass(s, events, ctx, rs, readings);
    } else {
      const n = parseNotification(readings?.[NOTIFICATION_KEY]);
      if (n && rs.seeded && String(n.id) !== rs.lastId && passes(rule.source, n) && !blocked(s, rule, now)) {
        start(s, events, { ...ctx, notification: n, oneShot: true });
      }
      // Baseline the latest notification once data has arrived, so an old one never fires.
      if (n || Object.keys(readings ?? {}).length > 0) {
        patchRule(s, rule.id, { seeded: true, ...(n ? { lastId: String(n.id) } : {}) });
      }
    }
  }
  return { state: s, events };
}

/**
 * A sensor rule's pass over its conditions, each with its own timing in `rs.conds`. The rule fires once
 * any level condition (everything but `changes`) has held `forSeconds`, naming those that did, and clears
 * when none is still on (`clears` per condition, so each keeps its own hysteresis). A `missing` condition
 * holds while its key is absent, but only after the rule has seen the key, so a sensor that never reported
 * (or a stream still connecting) stays quiet. A `changes` condition is a one-shot on its own: it fires
 * when the value differs from the last one seen. A dismissed alert waits for every condition to stop
 * holding before it can fire again.
 */
function sensorPass(s, events, ctx, rs, readings) {
  const { rule, now } = ctx;
  const conds = conditionsOf(rule.source);
  const forMs = (Number.isFinite(rule.source.forSeconds) ? rule.source.forSeconds : 0) * 1000;
  const states = conds.map((_, i) => ({ ...rs.conds?.[i] }));
  const changed = [];
  const met = [];
  const level = [];
  let holding = false;
  let unknown = false;

  conds.forEach((cond, i) => {
    const reading = readings?.[cond.key];
    const st = states[i];
    if (cond.op === "changes") {
      const current = changeKey(reading);
      if (current === undefined) return;
      if (st.seeded && st.last !== undefined && current !== st.last) changed.push({ cond, reading });
      st.seeded = true;
      st.last = current;
      return;
    }
    level.push(st);
    let holdsNow;
    if (cond.op === "missing") {
      if (reading !== undefined) st.seen = true;
      holdsNow = reading === undefined ? st.seen === true : false;
    } else {
      holdsNow = holds(cond, reading);
    }
    if (holdsNow === null) {
      unknown = true;
      return;
    }
    st.on = st.on ? !clears(cond, reading, holdsNow) : holdsNow;
    if (holdsNow) {
      holding = true;
      st.since = st.since ?? now;
      if (now - st.since >= forMs) met.push({ cond, reading });
    } else {
      st.since = undefined;
    }
  });
  patchRule(s, rule.id, { conds: states });

  const activeId = rs.active && s.active.some((e) => e.alert.id === rs.active) ? rs.active : undefined;
  if (activeId) {
    if (level.length > 0 && !level.some((st) => st.on)) end(s, events, activeId, now);
  } else if (!holding) {
    if (!unknown && rs.dismissed) patchRule(s, rule.id, { dismissed: false });
  } else if (!rs.dismissed && met.length > 0 && !blocked(s, rule, now)) {
    const id = start(s, events, { ...ctx, hits: met, oneShot: false });
    patchRule(s, rule.id, { active: id });
  }
  if (changed.length > 0 && !blocked(s, rule, now)) start(s, events, { ...ctx, hits: changed, oneShot: true });
}

/** A test shows the conditions with a reading (the first one when none has). */
function testHits(rule, readings) {
  const all = conditionsOf(rule.source).map((cond) => ({ cond, reading: readings?.[cond.key] }));
  const live = all.filter((h) => h.reading !== undefined);
  return live.length > 0 ? live : all.slice(0, 1);
}

/**
 * Apply a client action: `{ id, action: "ack" | "dismiss" }` or `{ ruleId, action: "test" }`.
 * Acknowledge hides the alert on kiosks until it clears (a one-shot that stays until acknowledged
 * ends); dismiss removes it now (the history records it); test fires a one-shot of the rule's output.
 * Returns `{ state, events }` or `{ error }`.
 */
export function act(state, action, alerts, readings, now) {
  const s = { ...state, rules: { ...state.rules }, active: [...state.active], history: [...state.history] };
  const events = [];
  if (action?.action === "test") {
    const rule = rulesOf(alerts).find((r) => r.id === action.ruleId);
    if (!rule) return { error: "unknown rule" };
    const hits = sensorRule(rule) ? testHits(rule, readings) : undefined;
    start(s, events, { rule, alerts, now, hits, notification: sensorRule(rule) ? undefined : TEST_NOTIFICATION, oneShot: true, test: true });
    return { state: s, events };
  }
  if (action?.action !== "ack" && action?.action !== "dismiss") return { error: "unknown action" };
  const entry = s.active.find((e) => e.alert.id === action.id);
  if (!entry) return { error: "unknown alert" };
  if (action.action === "dismiss") {
    end(s, events, entry.alert.id, now, { dismissed: true });
    return { state: s, events };
  }
  if (!entry.alert.acknowledged) {
    s.active = s.active.map((e) => (e === entry ? { ...e, alert: { ...e.alert, acknowledged: true } } : e));
    s.history = s.history.map((h) => (h.id === entry.alert.id ? { ...h, acknowledgedAt: now } : h));
    if (entry.oneShot && entry.expiresAt === undefined) end(s, events, entry.alert.id, now);
  }
  return { state: s, events };
}

/** Mark every active alert (tests excepted) quiet, in the history too; the same state when none changes. */
export function quieten(state) {
  const ids = new Set(state.active.filter((e) => !e.alert.test && !e.alert.quiet).map((e) => e.alert.id));
  if (ids.size === 0) return state;
  return {
    ...state,
    active: state.active.map((e) => (ids.has(e.alert.id) ? { ...e, alert: { ...e.alert, quiet: true } } : e)),
    history: state.history.map((h) => (ids.has(h.id) ? { ...h, quiet: true } : h)),
  };
}

const TEST_NOTIFICATION = { app: "Test", title: "Test notification", body: "" };

/* ---------------- Data API stream ---------------- */

/** Split an SSE buffer into the `data:` payloads of its complete events and the unfinished rest. */
export function takeEvents(buffer) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop();
  const data = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    if (lines.length > 0) data.push(lines.map((l) => l.slice(5).replace(/^ /, "")).join("\n"));
  }
  return { data, rest };
}

/**
 * Read an SSE stream with `fetch`, reconnecting with a 1 to 30 s backoff. `onEvent(object)` gets each
 * parsed JSON message. Returns `{ close }`.
 */
export function sseConnect(url, onEvent) {
  let stopped = false;
  let controller;
  let timer;
  let delay = RECONNECT_MIN_MS;

  const run = async () => {
    controller = new AbortController();
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: "text/event-stream" } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      delay = RECONNECT_MIN_MS;
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const { data, rest } = takeEvents(buffer);
        buffer = rest;
        for (const payload of data) {
          try {
            onEvent(JSON.parse(payload));
          } catch {
            // A malformed message: skip it.
          }
        }
      }
    } catch {
      // Offline or aborted: fall through to the retry.
    }
    if (stopped) return;
    timer = setTimeout(run, delay);
    timer.unref?.();
    delay = Math.min(delay * 2, RECONNECT_MAX_MS);
  };
  run();

  return {
    close() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}

/* ---------------- live wrapper ---------------- */

function loadHistory(file, now) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(raw?.history) ? raw.history : [];
    // Active alerts are runtime only: whatever was open when the server stopped has ended.
    return list
      .filter((h) => isObject(h) && typeof h.id === "string")
      .map((h) => (h.endedAt === undefined ? { ...h, endedAt: now } : h))
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

const apiBase = (config) => {
  try {
    const u = new URL(String(config?.dataApiUrl ?? ""));
    if (u.protocol === "http:" || u.protocol === "https:") return u.href.replace(/\/+$/, "");
  } catch {
    // Not a URL: the default.
  }
  return DEFAULT_API;
};

/**
 * The live engine. `readConfig()` returns the parsed config (or null); `control` is the control store
 * (`dispatch`, `get`, `setAlerts`); `connect(url, onEvent)` opens one stream (a fake in tests).
 * Evaluates on every reading batch and every second, persists the history to `file` and publishes
 * the active list through `control.setAlerts`.
 */
export function createAlerts({
  file, readConfig, control, now = () => Date.now(), connect = sseConnect, tickMs = TICK_MS, saveMs = SAVE_DEBOUNCE_MS,
}) {
  let state = { ...emptyAlertsState(), history: loadHistory(file, now()) };
  let config = readConfig();
  let readings = {};
  let published = JSON.stringify([]);
  let saved = state.history;
  let saveTimer;
  const streams = new Map(); // url -> { close }
  const returns = new Map(); // alert id -> { profile, from, to }

  const save = () => {
    saveTimer = undefined;
    try {
      fs.writeFileSync(`${file}.tmp`, JSON.stringify({ history: state.history }));
      fs.renameSync(`${file}.tmp`, file);
      saved = state.history;
    } catch (err) {
      console.error("alerts.json save failed:", err);
    }
  };

  /** The profile a page action without one means, as control resolves it. */
  const profileFor = (id) => {
    const c = control.get();
    const pinned = config?.activeProfile && config.activeProfile !== "auto" ? config.activeProfile : undefined;
    return [id, c.profile, c.shown, pinned].find((p) => p && c.profiles[p]) ?? Object.keys(c.profiles)[0];
  };

  const runOutputs = (events) => {
    for (const { type, alert } of events) {
      if (type === "fire" && alert.page && !alert.quiet) {
        const profile = profileFor(alert.page.profile);
        if (!profile) continue;
        const from = control.get().profiles[profile]?.page;
        if (control.dispatch({ type: "page", profile, page: alert.page.page }).error) continue;
        if (alert.page.returnAfter && from) returns.set(alert.id, { profile, from, to: alert.page.page });
      } else if (type === "clear" && returns.has(alert.id)) {
        const r = returns.get(alert.id);
        returns.delete(alert.id);
        // Only go back if nobody moved the profile off the alert's page meanwhile.
        if (control.get().profiles[r.profile]?.page === r.to) control.dispatch({ type: "page", profile: r.profile, page: r.from });
      }
    }
  };

  const apply = (result) => {
    state = result.state;
    runOutputs(result.events);
    const list = JSON.stringify(activeAlerts(state));
    if (list !== published) {
      published = list;
      control.setAlerts(activeAlerts(state));
    }
    if (state.history !== saved && saveTimer === undefined) {
      saveTimer = setTimeout(save, saveMs);
      saveTimer.unref?.();
    }
  };

  /** Whether alerts are muted right now (control holds the deadline). */
  const muted = () => {
    const until = control.mutedUntil();
    return typeof until === "number" && now() < until;
  };

  const run = () => apply(evaluate(state, config?.alerts, readings, now(), muted()));

  const onEvent = (message) => {
    if (!isObject(message)) return;
    if (isObject(message.sensors)) readings = { ...readings, ...message.sensors };
    if (Array.isArray(message.removed) && message.removed.length > 0) {
      readings = { ...readings };
      for (const key of message.removed) delete readings[key];
    }
    run();
  };

  /** Open the streams the rules need and close the rest; only changed URLs reconnect. */
  const subscribe = () => {
    const base = apiBase(config);
    const wanted = new Set(
      keysOf(config?.alerts).map((k) => `${base}/events?prefix=${encodeURIComponent(prefixOf(k))}&interval=1000`),
    );
    for (const [url, stream] of streams) {
      if (wanted.has(url)) continue;
      stream.close();
      streams.delete(url);
    }
    for (const url of wanted) if (!streams.has(url)) streams.set(url, connect(url, onEvent));
  };

  const timer = tickMs > 0 ? setInterval(run, tickMs) : null;
  timer?.unref?.();
  subscribe();

  return {
    /** The config was saved: re-read the rules, resubscribe if the keys changed, evaluate. */
    configChanged() {
      config = readConfig();
      subscribe();
      run();
    },
    /**
     * Apply a client action; `{ alerts, mutedUntil }` (the active list and the mute deadline) or `{ error }`.
     * `{ action: "mute", minutes }` mutes for 1-1440 minutes (0 unmutes) and quietens what is active.
     */
    act(action) {
      if (action?.action === "mute") {
        const done = control.dispatch({ type: "mute", minutes: action.minutes });
        if (done.error) return { error: done.error };
        if (done.state.mutedUntil !== null) apply({ state: quieten(state), events: [] });
        return { alerts: activeAlerts(state), mutedUntil: done.state.mutedUntil };
      }
      const result = act(state, action, config?.alerts, readings, now());
      if (result.error) return { error: result.error };
      apply(result);
      return { alerts: activeAlerts(state), mutedUntil: control.get().mutedUntil };
    },
    history: () => state.history,
    alerts: () => activeAlerts(state),
    /** Feed a reading batch (what a stream does); used by tests. */
    feed: onEvent,
    stop() {
      if (timer) clearInterval(timer);
      for (const stream of streams.values()) stream.close();
      streams.clear();
      if (saveTimer !== undefined) {
        clearTimeout(saveTimer);
        save();
      }
    },
  };
}
