// Runtime control state for kiosks, the studio and the Stream Deck plugin:
// which page each profile shows, a profile override, and page auto-rotation.
//
// It is not config (no undo, not in config.json): the server holds it,
// persists the durable part to control.json and pushes every change over
// /events/control. Rotation runs here, so every kiosk showing a profile
// and every Stream Deck key stay in step. It also lists the kiosks: the
// open control streams that report a profile (PLAN decision 7).
//
// Node built-ins only. `reduce` is pure; `createControl` adds the clock,
// persistence and listeners.

import fs from "node:fs";

/** A touch or a remote page switch holds rotation at least this long. */
export const ROTATE_PAUSE_MS = 30_000;
const TICK_MS = 1000;

/** Dim level when none is asked for, and its bounds. */
export const DIM_DEFAULT = 0.6;
export const DIM_MIN = 0.1;
export const DIM_MAX = 0.9;
export const MUTE_MAX_MINUTES = 1440;
/** A reload bump within this long of the last one is ignored, so a loop of POSTs can't storm the kiosks. */
export const RELOAD_COALESCE_MS = 2000;

/** The empty state. `mutedUntil`, `dim` (the level while on), `dimLevel` (the last one used) and `islandOverride`
 * are durable. `shown` (the profile a kiosk last reported), `nextAt`, `alerts` (the active list server/alerts.mjs
 * publishes), `kiosks` (the open kiosk streams by connection id) and the reload counters (`reload`, `reloads`;
 * createControl starts them at the server start time) are runtime only (`reloadAt` is when the last bump was taken). */
export const emptyState = () => ({
  profile: null, shown: null, pages: {}, override: {}, nextAt: {}, alerts: [],
  mutedUntil: null, dim: {}, dimLevel: {}, islandOverride: {}, reload: 0, reloads: {}, reloadAt: null, kiosks: {},
});

const profilesOf = (config) => (Array.isArray(config?.profiles) ? config.profiles : []);
const findProfile = (config, id) => profilesOf(config).find((p) => p && p.id === id);
const pageIds = (profile) =>
  Array.isArray(profile?.pages) ? profile.pages.map((p) => p?.id).filter((id) => typeof id === "string") : [];

/** The profile an action without one means: the override, the shown one, the config's pin, the first. */
export function targetProfile(state, config, id) {
  const pinned = config?.activeProfile && config.activeProfile !== "auto" ? config.activeProfile : null;
  for (const candidate of [id, state.profile, state.shown, pinned]) {
    if (candidate && findProfile(config, candidate)) return candidate;
  }
  return profilesOf(config)[0]?.id ?? null;
}

/** The page a profile shows: the stored choice when it still exists, else its first page. */
export function currentPage(state, config, profileId) {
  const ids = pageIds(findProfile(config, profileId));
  const chosen = state.pages[profileId];
  return chosen && ids.includes(chosen) ? chosen : (ids[0] ?? null);
}

/** Whether a profile rotates: the runtime override, else its saved `rotate.enabled`, and only with 2+ pages. */
export function isRotating(state, config, profileId) {
  const profile = findProfile(config, profileId);
  if (rotationPages(profile).length < 2) return false;
  const o = state.override[profileId];
  return o ? o === "on" : profile?.rotate?.enabled === true;
}

function rotationPages(profile) {
  const all = pageIds(profile);
  const listed = Array.isArray(profile?.rotate?.pages) ? profile.rotate.pages.filter((id) => all.includes(id)) : [];
  return listed.length > 0 ? listed : all;
}

/** Whether the island shows on a profile: the runtime override, else its saved `island.enabled`. */
export function isIslandShown(state, config, profileId) {
  const o = state.islandOverride[profileId];
  return o ? o === "on" : findProfile(config, profileId)?.island?.enabled === true;
}

/** A profile's reload counter: its own, else the global one. */
const reloadOf = (state, profileId) => state.reloads[profileId] ?? state.reload;

const rotateMs = (profile) => {
  const s = Number(profile?.rotate?.seconds);
  return (Number.isFinite(s) ? Math.max(3, Math.min(3600, s)) : 15) * 1000;
};

const step = (ids, current, delta) => {
  if (ids.length === 0) return null;
  const i = ids.indexOf(current);
  return ids[(((i < 0 ? 0 : i + delta) % ids.length) + ids.length) % ids.length];
};

const withKey = (obj, key, value) => {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
};

/** Hold rotation after a manual switch or touch. */
const held = (state, config, profileId, now) =>
  isRotating(state, config, profileId)
    ? { ...state, nextAt: withKey(state.nextAt, profileId, now + Math.max(ROTATE_PAUSE_MS, rotateMs(findProfile(config, profileId)))) }
    : state;

const validDim = (v) => typeof v === "number" && v >= DIM_MIN && v <= DIM_MAX;

const toggled = (want, was) => (want === "toggle" ? (was ? "off" : "on") : want);

/**
 * The next state for an action, or the same state object when nothing changes. Actions:
 * `{ type: "page", profile?, page: id | "next" | "prev" }`, `{ type: "profile", profile: id | null }`,
 * `{ type: "rotate", profile?, state: "on" | "off" | "toggle" | "saved" }`, `{ type: "touch", profile? }`,
 * `{ type: "shown", profile }`, `{ type: "tick" }`, `{ type: "config", previous }`, `{ type: "mute", minutes }` (0 unmutes),
 * `{ type: "kiosk", action: "reload" | "dim" | "island", profile?, state?, level? }`; internal only (server.mjs, never
 * a POST): `{ type: "connect", id, profile, page?, address? }` and `{ type: "disconnect", id }` for a kiosk stream.
 * Returns `{ error }` for a bad request.
 */
export function reduce(state, action, config, now) {
  switch (action?.type) {
    case "page": {
      const id = targetProfile(state, config, action.profile);
      if (!id) return { error: "no profile" };
      const ids = pageIds(findProfile(config, id));
      const current = currentPage(state, config, id);
      const page =
        action.page === "next" ? step(ids, current, 1) : action.page === "prev" ? step(ids, current, -1) : action.page;
      if (!ids.includes(page)) return { error: "unknown page" };
      return held({ ...state, pages: withKey(state.pages, id, page) }, config, id, now);
    }
    case "profile": {
      if (action.profile === null || action.profile === "auto") {
        return state.profile === null ? state : { ...state, profile: null };
      }
      if (!findProfile(config, action.profile)) return { error: "unknown profile" };
      return state.profile === action.profile ? state : { ...state, profile: action.profile };
    }
    case "rotate": {
      const id = targetProfile(state, config, action.profile);
      if (!id) return { error: "no profile" };
      const was = isRotating(state, config, id);
      const want =
        action.state === "toggle" ? (was ? "off" : "on") : action.state === "saved" ? undefined : action.state;
      if (want !== undefined && want !== "on" && want !== "off") return { error: "bad rotate state" };
      const next = { ...state, override: withKey(state.override, id, want) };
      const on = isRotating(next, config, id);
      return { ...next, nextAt: withKey(next.nextAt, id, on ? now + rotateMs(findProfile(config, id)) : undefined) };
    }
    case "touch": {
      const id = targetProfile(state, config, action.profile);
      return id ? held(state, config, id, now) : state;
    }
    case "shown": {
      if (!findProfile(config, action.profile) || state.shown === action.profile) return state;
      return { ...state, shown: action.profile };
    }
    case "mute": {
      const m = action.minutes;
      if (!Number.isInteger(m) || m < 0 || m > MUTE_MAX_MINUTES) return { error: "bad mute minutes" };
      const until = m === 0 ? null : now + m * 60_000;
      return state.mutedUntil === until ? state : { ...state, mutedUntil: until };
    }
    case "kiosk": {
      const named = action.profile !== undefined && action.profile !== null;
      if (named && !findProfile(config, action.profile)) return { error: "unknown profile" };
      if (action.action === "reload") {
        if (state.reloadAt !== null && now - state.reloadAt < RELOAD_COALESCE_MS) return state;
        // One above every counter, so a bump always grows what a kiosk compares.
        const top = Math.max(state.reload, ...Object.values(state.reloads)) + 1;
        return named
          ? { ...state, reloads: { ...state.reloads, [action.profile]: top }, reloadAt: now }
          : { ...state, reload: top, reloadAt: now };
      }
      const id = named ? action.profile : targetProfile(state, config);
      if (!id) return { error: "no profile" };
      const want = action.state ?? "toggle";
      if (action.action === "dim") {
        if (want !== "on" && want !== "off" && want !== "toggle") return { error: "bad dim state" };
        const wasOn = state.dim[id] !== undefined;
        if (toggled(want, wasOn) === "off") {
          return wasOn ? { ...state, dim: withKey(state.dim, id, undefined) } : state;
        }
        const given = action.level ?? undefined;
        if (given !== undefined && !validDim(given)) return { error: "bad dim level" };
        const level = given ?? state.dimLevel[id] ?? DIM_DEFAULT;
        return state.dim[id] === level && state.dimLevel[id] === level
          ? state
          : { ...state, dim: { ...state.dim, [id]: level }, dimLevel: { ...state.dimLevel, [id]: level } };
      }
      if (action.action === "island") {
        if (!["on", "off", "toggle", "saved"].includes(want)) return { error: "bad island state" };
        const override = want === "saved" ? undefined : toggled(want, isIslandShown(state, config, id));
        return state.islandOverride[id] === override
          ? state
          : { ...state, islandOverride: withKey(state.islandOverride, id, override) };
      }
      return { error: "unknown kiosk action" };
    }
    case "connect": {
      if (typeof action.id !== "string" || typeof action.profile !== "string" || !action.profile) return { error: "bad kiosk" };
      const kiosk = {
        profile: action.profile,
        // A `?page=` pin; otherwise the kiosk shows the profile's page.
        page: typeof action.page === "string" && action.page ? action.page : null,
        address: typeof action.address === "string" ? action.address.replace(/^::ffff:/, "") : null,
        since: now,
      };
      return { ...state, kiosks: { ...state.kiosks, [action.id]: kiosk } };
    }
    case "disconnect":
      return state.kiosks[action.id] ? { ...state, kiosks: withKey(state.kiosks, action.id, undefined) } : state;
    case "tick": {
      let next = state.mutedUntil !== null && now >= state.mutedUntil ? { ...state, mutedUntil: null } : state;
      for (const profile of profilesOf(config)) {
        const id = profile?.id;
        if (!id) continue;
        if (!isRotating(next, config, id)) {
          if (next.nextAt[id] !== undefined) next = { ...next, nextAt: withKey(next.nextAt, id, undefined) };
          continue;
        }
        const due = next.nextAt[id];
        if (due === undefined) {
          next = { ...next, nextAt: withKey(next.nextAt, id, now + rotateMs(profile)) };
        } else if (now >= due) {
          const page = step(rotationPages(profile), currentPage(next, config, id), 1);
          next = {
            ...next,
            pages: withKey(next.pages, id, page),
            nextAt: withKey(next.nextAt, id, now + rotateMs(profile)),
          };
        }
      }
      return next;
    }
    case "config": {
      // A saved change to a profile's rotate option replaces its runtime override.
      let next = state;
      for (const id of Object.keys(state.override)) {
        const before = JSON.stringify(findProfile(action.previous, id)?.rotate ?? null);
        const after = JSON.stringify(findProfile(config, id)?.rotate ?? null);
        if (before !== after || !findProfile(config, id)) {
          next = { ...next, override: withKey(next.override, id, undefined) };
        }
      }
      // Likewise a saved change to a profile's island replaces its runtime island override.
      for (const id of Object.keys(state.islandOverride)) {
        const before = JSON.stringify(findProfile(action.previous, id)?.island ?? null);
        const after = JSON.stringify(findProfile(config, id)?.island ?? null);
        if (before !== after || !findProfile(config, id)) {
          next = { ...next, islandOverride: withKey(next.islandOverride, id, undefined) };
        }
      }
      // A deleted profile's dim goes with it.
      for (const key of ["dim", "dimLevel"]) {
        for (const id of Object.keys(state[key])) {
          if (!findProfile(config, id)) next = { ...next, [key]: withKey(next[key], id, undefined) };
        }
      }
      return next;
    }
    default:
      return { error: "unknown action" };
  }
}

/** A kiosk as clients see it: the page it shows is its pin while the profile has that page, else the profile's. */
function publicKiosk(state, config, id, kiosk) {
  const ids = pageIds(findProfile(config, kiosk.profile));
  const page = kiosk.page && ids.includes(kiosk.page) ? kiosk.page : currentPage(state, config, kiosk.profile);
  return { id, profile: kiosk.profile, page, address: kiosk.address, since: kiosk.since };
}

/** What clients see: per profile its page, rotation, dim level, island and reload counter, plus the override, the
 * shown profile, the active alerts, the alert mute, the global reload counter and the open kiosks (oldest first). */
export function publicState(state, config) {
  const profiles = {};
  for (const p of profilesOf(config)) {
    if (!p?.id) continue;
    profiles[p.id] = {
      page: currentPage(state, config, p.id),
      rotating: isRotating(state, config, p.id),
      override: state.override[p.id] ?? null,
      dim: state.dim[p.id] ?? 0,
      island: isIslandShown(state, config, p.id),
      islandOverride: state.islandOverride[p.id] ?? null,
      reload: reloadOf(state, p.id),
    };
  }
  return {
    profile: state.profile, shown: state.shown, profiles, alerts: state.alerts,
    mutedUntil: state.mutedUntil, reload: state.reload,
    kiosks: Object.entries(state.kiosks).map(([id, k]) => publicKiosk(state, config, id, k)),
  };
}

/** The durable part, as saved to control.json. */
const durable = (state) => ({
  profile: state.profile, pages: state.pages, override: state.override,
  mutedUntil: state.mutedUntil, dim: state.dim, dimLevel: state.dimLevel, islandOverride: state.islandOverride,
});

function load(file, now) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const pick = (v, ok) => Object.fromEntries(Object.entries(obj(v)).filter(([, x]) => ok(x)));
    return {
      ...emptyState(),
      profile: typeof raw.profile === "string" ? raw.profile : null,
      pages: obj(raw.pages),
      override: obj(raw.override),
      mutedUntil:
        typeof raw.mutedUntil === "number" && raw.mutedUntil > now && raw.mutedUntil <= now + MUTE_MAX_MINUTES * 60_000
          ? raw.mutedUntil
          : null,
      dim: pick(raw.dim, validDim),
      dimLevel: pick(raw.dimLevel, validDim),
      islandOverride: pick(raw.islandOverride, (v) => v === "on" || v === "off"),
    };
  } catch {
    return emptyState();
  }
}

/**
 * The live control store. `readConfig()` returns the parsed config (or null). `dispatch(action)`
 * applies an action and returns `{ state }` or `{ error }`; listeners get the public state on change.
 */
export function createControl({ file, readConfig, now = () => Date.now(), tickMs = TICK_MS }) {
  let state = { ...load(file, now()), reload: now() };
  let config = readConfig();
  const listeners = new Set();
  let kioskSeq = 0;

  const commit = (next) => {
    if (next === state) return;
    const persist = JSON.stringify(durable(next)) !== JSON.stringify(durable(state));
    const wasMuted = state.mutedUntil;
    state = next;
    if (next.mutedUntil !== wasMuted) {
      console.log(next.mutedUntil === null ? "alerts unmuted" : `alerts muted until ${new Date(next.mutedUntil).toISOString()}`);
    }
    if (persist) {
      try {
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(durable(state)));
        fs.renameSync(`${file}.tmp`, file);
      } catch (err) {
        console.error("control.json save failed:", err);
      }
    }
    const view = publicState(state, config);
    for (const fn of listeners) fn(view);
  };

  const dispatch = (action) => {
    const next = reduce(state, action, config, now());
    if (next.error) return { error: next.error };
    // Only publish when what clients see (or the durable part) changed; `nextAt` moves silently.
    const visible = JSON.stringify(publicState(next, config)) !== JSON.stringify(publicState(state, config));
    if (visible || JSON.stringify(durable(next)) !== JSON.stringify(durable(state))) commit(next);
    else state = next;
    return { state: publicState(state, config) };
  };

  const timer = tickMs > 0 ? setInterval(() => dispatch({ type: "tick" }), tickMs) : null;
  timer?.unref?.();

  return {
    dispatch,
    get: () => publicState(state, config),
    /** The alert mute deadline (epoch ms) or null; cheaper than `get()`. */
    mutedUntil: () => state.mutedUntil,
    /** Publish the active alerts (from server/alerts.mjs); listeners fire only when the list changed. */
    setAlerts(list) {
      if (JSON.stringify(list) !== JSON.stringify(state.alerts)) commit({ ...state, alerts: list });
    },
    /** The config was saved: re-read it, drop stale overrides, publish. */
    configChanged() {
      const previous = config;
      config = readConfig();
      const next = reduce(state, { type: "config", previous }, config, now());
      if (next !== state) return commit(next);
      // Same state, but pages may have been added or removed: publish anyway.
      const view = publicState(state, config);
      for (const fn of listeners) fn(view);
    },
    /** A kiosk stream opened (`profile` from `?profile=`, `page` from `?page=`): its id for `disconnect`. */
    connect({ profile, page, address }) {
      const id = `k${++kioskSeq}`;
      return dispatch({ type: "connect", id, profile, page, address }).error ? null : id;
    },
    disconnect(id) {
      if (id) dispatch({ type: "disconnect", id });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop: () => timer && clearInterval(timer),
  };
}
