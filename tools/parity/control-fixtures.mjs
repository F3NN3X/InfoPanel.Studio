// Parity cases for server/control.mjs (tests/fixtures/parity/control.json): the reducer over the sequences control.test.mjs
// walks plus the oddities the contract lists, the public state, the helpers, and whole sessions of the store (the
// control.json bytes and what listeners are told). Inputs go through JSON first, so a case is what the server saw.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createControl, currentPage, emptyState, isIslandShown, isRotating, publicState, reduce, targetProfile } from "../../server/control.mjs";

const wire = (v) => JSON.parse(JSON.stringify(v));
/** A state without the fields that equal the empty state's: the fixtures stay small, and the readers default them. */
const slim = (state) => {
  const empty = emptyState();
  return Object.fromEntries(Object.entries(state).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(empty[key])));
};
const page = (id) => ({ id });
const profile = (id, pages, extra) => ({ id, pages: pages.map(page), ...extra });
const config = (rotate, island) => ({
  activeProfile: "auto",
  profiles: [profile("desk", ["main", "game", "stream"], { ...(rotate ? { rotate } : {}), ...(island === undefined ? {} : { island: { enabled: island } }) }), profile("strip", ["main"])],
});

const out = (before, after) => (after === before ? { same: true } : after.error ? { error: after.error } : { state: slim(after) });

/** Records reduce calls; `step` returns the next state (the same one on an error), so a sequence reads top to bottom. */
function recorder(cases) {
  return (state, action, cfg, now = 0) => {
    const input = wire({ fn: "reduce", state, action, config: cfg, now });
    const result = reduce(input.state, input.action, input.config, input.now);
    cases.push({ input: { ...input, state: slim(input.state) }, output: out(input.state, result) });
    return result.error ? input.state : result;
  };
}

function reducer(cases) {
  const step = recorder(cases);
  const c = config();
  let s = emptyState();
  for (const page_ of ["game", "next", "next", "prev", "nope"]) s = step(s, { type: "page", profile: "desk", page: page_ }, c);
  for (const a of [{ type: "profile", profile: "nope" }, { type: "what" }, {}, { type: 5 }, { type: "profile", profile: "desk" }, { type: "profile", profile: "desk" }, { type: "profile", profile: "auto" }, { type: "profile", profile: null }, { type: "profile" }]) s = step(s, a, c);
  s = step({ ...emptyState(), pages: { desk: "deleted" } }, { type: "page", page: "next" }, c);
  step(emptyState(), { type: "page", page: "prev", profile: "strip" }, c);
  step(emptyState(), { type: "page", page: "next" }, { profiles: [] });
  step(emptyState(), { type: "touch", profile: "desk" }, c);
  step(emptyState(), { type: "touch" }, null);

  // Rotation.
  const rotating = config({ enabled: true, seconds: 10, pages: ["main", "stream"] });
  let r = step(emptyState(), { type: "tick" }, rotating, 0);
  for (const now of [9_999, 10_000, 20_000]) r = step(r, { type: "tick" }, rotating, now);
  const saved = config({ enabled: true, seconds: 10 });
  r = step(emptyState(), { type: "tick" }, saved, 0);
  r = step(r, { type: "page", profile: "desk", page: "game" }, saved, 5_000);
  r = step(r, { type: "tick" }, saved, 34_999);
  r = step(r, { type: "tick" }, saved, 35_000);
  r = step(r, { type: "touch", profile: "desk" }, saved, 40_000);
  step(r, { type: "tick" }, saved, 50_000);
  step(r, { type: "touch" }, saved, 40_000);
  let t = step(emptyState(), { type: "rotate", profile: "desk", state: "toggle" }, saved);
  t = step(t, { type: "rotate", profile: "desk", state: "saved" }, saved);
  step(t, { type: "tick" }, config(), 3);
  for (const state of ["on", "off", "toggle", "saved", undefined, null, "sideways", 1]) step(emptyState(), { type: "rotate", profile: "desk", ...(state === undefined ? {} : { state }) }, config(), 100);
  step(emptyState(), { type: "rotate", profile: "strip", state: "on" }, config(), 100);
  step(emptyState(), { type: "rotate", state: "on" }, { profiles: [] });
  const off = step(emptyState(), { type: "rotate", profile: "desk", state: "off" }, saved);
  step(off, { type: "config", previous: saved }, config({ enabled: true, seconds: 10 }));
  step(off, { type: "config", previous: saved }, config({ enabled: true, seconds: 20 }));
  step(off, { type: "config", previous: saved }, { profiles: [] });
  step(off, { type: "config", previous: null }, saved);
  // rotate.seconds read as Number(): clamped, text, null (0), booleans, arrays, junk.
  for (const seconds of [0.5, "7", null, true, [20], [1, 2], "abc", 1e9]) {
    const cfg = config({ enabled: true, seconds });
    step(step(emptyState(), { type: "tick" }, cfg, 1000), { type: "tick" }, cfg, 5000);
  }
  // A runtime override of any truthy shape, a stale rotate page list, a pin and numeric ids.
  step({ ...emptyState(), override: { desk: 5 } }, { type: "tick" }, saved, 0);
  step({ ...emptyState(), override: { desk: "on" } }, { type: "tick" }, config({ pages: ["gone"] }), 0);
  step({ ...emptyState(), override: { desk: "on" } }, { type: "tick" }, config({ enabled: false, pages: ["main", "game", "main"] }), 0);
  step({ ...emptyState(), nextAt: { desk: 5 } }, { type: "tick" }, config(), 0);
  step(emptyState(), { type: "tick" }, { profiles: [null, 5, { id: 0 }, { id: 7, pages: [page("a"), page("b")], rotate: { enabled: true } }] }, 0);
  step(emptyState(), { type: "page", profile: 7, page: "b" }, { profiles: [{ id: 7, pages: [page("a"), page("b")], rotate: { enabled: true } }] }, 0);
  step({ ...emptyState(), pages: { desk: "stream" } }, { type: "page", page: "next" }, { ...c, activeProfile: "desk" });

  // Kiosk reload, dim, island.
  const rc = config();
  let k = step({ ...emptyState(), reload: 100 }, { type: "kiosk", action: "reload" }, rc, 0);
  k = step(k, { type: "kiosk", action: "reload", profile: "desk" }, rc, 5000);
  k = step(k, { type: "kiosk", action: "reload" }, rc, 10_000);
  step(k, { type: "kiosk", action: "reload" }, rc, 11_999);
  step(k, { type: "kiosk", action: "reload", profile: "strip" }, rc, 12_000);
  for (const a of [{ action: "reload", profile: "nope" }, { action: "nope" }, { action: "reload", profile: null }, {}, { action: "dim", profile: "" }]) step(emptyState(), { type: "kiosk", ...a }, rc);
  const dim = (state, over, id = "desk") => step(state, { type: "kiosk", action: "dim", profile: id, ...over }, rc);
  let d = dim(emptyState(), {});
  dim(d, {});
  d = dim(emptyState(), { state: "on", level: 0.3 });
  d = dim(d, { state: "off" });
  d = dim(d, { state: "toggle" });
  dim(d, { state: "toggle", level: 0.9 }, "strip");
  dim(d, { state: "on", level: 0.3 });
  dim(d, { state: "on" });
  dim(d, { state: "off" }, "strip");
  dim(emptyState(), { state: "on", level: null });
  dim(d, { state: "off", level: 5 });
  for (const level of [0.05, 0.95, "0.5", 1, 0.1, 0.9]) dim(emptyState(), { level });
  for (const state of ["dark", 1, null]) dim(emptyState(), { state });
  dim(emptyState(), {}, "nope");
  step({ ...emptyState(), shown: "strip" }, { type: "kiosk", action: "dim", state: "on" }, rc);
  step(emptyState(), { type: "kiosk", action: "dim" }, { profiles: [] });
  const ic = config(undefined, true);
  const isl = (state, over, cfg = ic, id = "desk") => step(state, { type: "kiosk", action: "island", profile: id, ...over }, cfg);
  let i = isl(emptyState(), {});
  i = isl(i, { state: "toggle" });
  const forced = isl(emptyState(), { state: "on" }, config(undefined, false));
  isl(forced, { state: "saved" }, config(undefined, false));
  isl(emptyState(), { state: "saved" });
  isl(emptyState(), { state: "dark" });
  isl(emptyState(), { state: "on" }, ic, "nope");
  const gone = isl(emptyState(), { state: "off" });
  step(gone, { type: "config", previous: ic }, ic);
  step(gone, { type: "config", previous: ic }, config(undefined, false));

  // Mute, shown, config cleanup, the kiosk registry.
  let m = step(emptyState(), { type: "mute", minutes: 5 }, rc, 1000);
  m = step(m, { type: "mute", minutes: 1 }, rc, 2000);
  step(m, { type: "tick" }, rc, 61_999);
  step(m, { type: "tick" }, rc, 62_000);
  step(m, { type: "mute", minutes: 0 }, rc, 2000);
  step(emptyState(), { type: "mute", minutes: 0 }, rc, 2000);
  for (const minutes of [1440, 1441, -1, 1.5, "5", null, undefined]) step(emptyState(), { type: "mute", ...(minutes === undefined ? {} : { minutes }) }, rc, 0);
  step(emptyState(), { type: "shown", profile: "strip" }, rc);
  step({ ...emptyState(), shown: "strip" }, { type: "shown", profile: "strip" }, rc);
  step(emptyState(), { type: "shown", profile: "nope" }, rc);
  const dimmed = { ...emptyState(), dim: { strip: 0.5, desk: 0.3 }, dimLevel: { strip: 0.5 }, override: { gone: "on" }, pages: { gone: "x" } };
  step(dimmed, { type: "config", previous: rc }, { ...rc, profiles: [rc.profiles[0]] });
  let o = step(emptyState(), { type: "connect", id: "k1", address: "::ffff:192.168.1.20", profile: "desk" }, rc, 1000);
  o = step(o, { type: "page", profile: "desk", page: "game" }, rc, 1000);
  o = step(o, { type: "connect", id: "k2", profile: "desk", page: "stream", address: "::1" }, rc, 1000);
  o = step(o, { type: "connect", id: "k3", profile: "nope", page: "x" }, rc, 1500);
  o = step(o, { type: "connect", id: "k4", profile: "desk", page: "gone", address: 5 }, rc, 1600);
  o = step(o, { type: "connect", id: "k1", profile: "strip", page: "" }, rc, 1700);
  step(o, { type: "disconnect", id: "k2" }, rc);
  step(o, { type: "disconnect", id: "nope" }, rc);
  for (const a of [{ id: "k1" }, { profile: "desk" }, { id: "k1", profile: "" }, { id: 1, profile: "desk" }, { id: "k1", profile: 1 }]) step(emptyState(), { type: "connect", ...a }, rc);
  return o;
}

function publics(cases, sample) {
  const c = config({ enabled: true, seconds: 10 }, true);
  const weird = { profiles: [null, 0, { id: 5, pages: [page("a")] }, { id: "dup", pages: [page("p"), page("q")] }, { id: "dup", pages: [page("z")] }, { id: "", pages: [page("e")] }, { id: "1", pages: [page("n")] }] };
  const states = [
    emptyState(),
    sample,
    { ...emptyState(), profile: "desk", shown: "strip", reload: 77, reloads: { desk: 90 }, dim: { desk: 0.25 }, islandOverride: { desk: "off" }, override: { desk: "off" }, alerts: [{ id: "a1" }], mutedUntil: 12345 },
    { ...emptyState(), pages: { desk: "stream", 5: "a", dup: "q", 1: "n" }, override: { 5: 0, dup: "on", desk: null } },
  ];
  for (const state of states) for (const cfg of [c, weird, null]) cases.push(wire({ input: { fn: "publicState", state: slim(state), config: cfg }, output: publicState(state, cfg) }));
  const state = { ...emptyState(), profile: "strip", shown: "desk", pages: { desk: "game" }, override: { desk: "on" }, islandOverride: { strip: "on" } };
  const configs = [c, { ...c, activeProfile: "strip" }, { ...c, activeProfile: "nope" }, { profiles: [{ pages: [] }, { id: "late" }] }, null, { profiles: [] }];
  for (const cfg of configs) {
    for (const [id, base] of [[undefined, emptyState()], ["strip", emptyState()], ["", state], ["nope", state], [null, state]]) {
      cases.push(wire({ input: { fn: "targetProfile", state: slim(base), config: cfg, id: id ?? null }, output: targetProfile(wire(base), cfg, id ?? undefined) ?? null }));
    }
  }
  for (const cfg of [c, configs[3]]) {
    for (const id of ["desk", "strip", "nope"]) {
      cases.push(wire({ input: { fn: "currentPage", state: slim(state), config: cfg, id }, output: currentPage(state, cfg, id) }));
      cases.push(wire({ input: { fn: "isRotating", state: slim(state), config: cfg, id }, output: isRotating(state, cfg, id) }));
      cases.push(wire({ input: { fn: "isIslandShown", state: slim(state), config: cfg, id }, output: isIslandShown(state, cfg, id) }));
    }
  }
}

/** The store over time: file text in, steps, then the public state, the file's text and what each step told listeners. */
function session(cases, { file = null, now0 = 1000, cfg, steps }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ips-control-fixture-"));
  const control = path.join(dir, "control.json");
  if (file !== null) fs.writeFileSync(control, file);
  let t = now0;
  let current = wire(cfg);
  const ctl = createControl({ file: control, readConfig: () => current, tickMs: 0, now: () => t });
  let told = 0;
  ctl.subscribe(() => (told += 1));
  const results = [];
  for (const s of steps) {
    const before = told;
    if (s.now !== undefined) t = s.now;
    let error = null;
    if (s.action) error = ctl.dispatch(wire(s.action)).error ?? null;
    if (s.setAlerts) ctl.setAlerts(wire(s.setAlerts));
    if (s.config !== undefined) {
      current = wire(s.config);
      ctl.configChanged();
    }
    results.push(error ? { error } : { told: told - before });
  }
  const output = wire({ steps: results, get: ctl.get(), file: fs.existsSync(control) ? fs.readFileSync(control, "utf8") : null, mutedUntil: ctl.mutedUntil() });
  fs.rmSync(dir, { recursive: true, force: true });
  cases.push({ input: wire({ fn: "session", file, now0, config: cfg, steps }), output });
}

function sessions(cases) {
  const c = config(undefined, true);
  session(cases, { cfg: c, steps: [{ action: { type: "page", profile: "desk", page: "stream" } }, { action: { type: "touch", profile: "desk" } }, { action: { type: "page", page: "nope" } }, { action: { type: "shown", profile: "strip" } }] });
  session(cases, {
    cfg: c,
    steps: [
      { action: { type: "kiosk", action: "dim", profile: "desk", level: 0.4 } },
      { action: { type: "kiosk", action: "island", profile: "desk", state: "off" } },
      { action: { type: "mute", minutes: 10 } },
      { action: { type: "kiosk", action: "reload" } },
      { action: { type: "kiosk", action: "reload", profile: "desk" }, now: 5000 },
      { action: { type: "profile", profile: "strip" } },
      { action: { type: "rotate", profile: "desk", state: "on" } },
    ],
  });
  session(cases, { cfg: c, file: JSON.stringify({ mutedUntil: 1000 + 1441 * 60_000, dim: { desk: 5, strip: 0.5, x: "a", y: null }, dimLevel: { desk: 99, strip: 0.2 }, islandOverride: { desk: "yes", strip: "off" } }), steps: [] });
  session(cases, { cfg: c, file: JSON.stringify({ profile: "desk", pages: { desk: "stream", 5: 1 }, override: { desk: "off", 2: 3 }, mutedUntil: 9000, dim: { 3: 0.5, desk: 0.9, a: 0.1 } }), steps: [{ action: { type: "tick" }, now: 9000 }, { action: { type: "tick" }, now: 9001 }] });
  for (const file of ["{broken", "null", "[1]", "5", '"x"', "", '{"profile":5,"mutedUntil":"x","pages":[1],"override":null}']) session(cases, { cfg: c, file, now0: 5000, steps: [] });
  session(cases, { cfg: null, steps: [{ action: { type: "page", page: "main" } }, { config: c }] });
  session(cases, { file: JSON.stringify({ mutedUntil: 60_000 }), now0: 0, cfg: c, steps: [{ action: { type: "tick" }, now: 59_999 }, { action: { type: "tick" }, now: 60_000 }, { action: { type: "tick" }, now: 60_001 }] });
  session(cases, { cfg: c, steps: [{ setAlerts: [{ id: "a1", ruleId: "r1" }] }, { setAlerts: [{ id: "a1", ruleId: "r1" }] }, { action: { type: "page", profile: "desk", page: "game" } }, { setAlerts: [] }] });
  const rotating = config({ enabled: true, seconds: 10 }, true);
  session(cases, {
    cfg: rotating,
    steps: [
      { action: { type: "tick" }, now: 1000 },
      { action: { type: "tick" }, now: 11_000 },
      { action: { type: "rotate", profile: "desk", state: "off" }, now: 12_000 },
      { config: rotating },
      { config: config({ enabled: true, seconds: 20 }, true) },
      { config: { activeProfile: "auto", profiles: [rotating.profiles[1]] } },
    ],
  });
  session(cases, {
    cfg: c,
    steps: [{ action: { type: "kiosk", action: "dim", profile: "strip", level: 0.5 } }, { action: { type: "kiosk", action: "island", profile: "strip", state: "on" } }, { config: { ...c, profiles: [c.profiles[0]] } }],
  });
}

export function controlCases() {
  const cases = [];
  // The store logs mute changes to the console.
  const log = console.log;
  console.log = () => {};
  try {
    const last = reducer(cases);
    publics(cases, last);
    sessions(cases);
  } finally {
    console.log = log;
  }
  return cases;
}
