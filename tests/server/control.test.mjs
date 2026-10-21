import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ROTATE_PAUSE_MS, createControl, emptyState, publicState, reduce, targetProfile } from "../../server/control.mjs";

const page = (id) => ({ id, name: id, placements: [] });
const config = (rotate) => ({
  activeProfile: "auto",
  profiles: [
    { id: "desk", pages: [page("main"), page("game"), page("stream")], ...(rotate ? { rotate } : {}) },
    { id: "strip", pages: [page("main")] },
  ],
});

describe("reduce: pages", () => {
  const c = config();
  it("sets a page and walks next / prev with wrap", () => {
    let s = reduce(emptyState(), { type: "page", profile: "desk", page: "game" }, c, 0);
    expect(publicState(s, c).profiles.desk.page).toBe("game");
    s = reduce(s, { type: "page", profile: "desk", page: "next" }, c, 0);
    s = reduce(s, { type: "page", profile: "desk", page: "next" }, c, 0);
    expect(publicState(s, c).profiles.desk.page).toBe("main");
    s = reduce(s, { type: "page", profile: "desk", page: "prev" }, c, 0);
    expect(publicState(s, c).profiles.desk.page).toBe("stream");
  });
  it("refuses unknown pages and profiles", () => {
    expect(reduce(emptyState(), { type: "page", profile: "desk", page: "nope" }, c, 0).error).toBeTruthy();
    expect(reduce(emptyState(), { type: "profile", profile: "nope" }, c, 0).error).toBeTruthy();
    expect(reduce(emptyState(), { type: "what" }, c, 0).error).toBeTruthy();
  });
  it("falls back to the first page when the stored one is gone", () => {
    const s = { ...emptyState(), pages: { desk: "deleted" } };
    expect(publicState(s, c).profiles.desk.page).toBe("main");
  });
  it("resolves the profile from override, then shown, then the first", () => {
    expect(targetProfile(emptyState(), c)).toBe("desk");
    expect(targetProfile({ ...emptyState(), shown: "strip" }, c)).toBe("strip");
    expect(targetProfile({ ...emptyState(), shown: "strip", profile: "desk" }, c)).toBe("desk");
    expect(targetProfile(emptyState(), { ...c, activeProfile: "strip" })).toBe("strip");
  });
  it("returns the same state when nothing changes", () => {
    const s = emptyState();
    expect(reduce(s, { type: "profile", profile: null }, c, 0)).toBe(s);
    expect(reduce(s, { type: "touch", profile: "desk" }, c, 0)).toBe(s);
  });
});

describe("reduce: rotation", () => {
  const saved = config({ enabled: true, seconds: 10 });
  it("advances on tick through the rotate list", () => {
    const c = config({ enabled: true, seconds: 10, pages: ["main", "stream"] });
    let s = reduce(emptyState(), { type: "tick" }, c, 0); // schedules
    s = reduce(s, { type: "tick" }, c, 9_999);
    expect(publicState(s, c).profiles.desk.page).toBe("main");
    s = reduce(s, { type: "tick" }, c, 10_000);
    expect(publicState(s, c).profiles.desk.page).toBe("stream");
    s = reduce(s, { type: "tick" }, c, 20_000);
    expect(publicState(s, c).profiles.desk.page).toBe("main");
  });
  it("never rotates a one-page profile", () => {
    expect(publicState(emptyState(), config({ enabled: true, seconds: 10 })).profiles.strip.rotating).toBe(false);
  });
  it("holds 30 s after a manual switch or touch", () => {
    let s = reduce(emptyState(), { type: "tick" }, saved, 0);
    s = reduce(s, { type: "page", profile: "desk", page: "game" }, saved, 5_000);
    s = reduce(s, { type: "tick" }, saved, 5_000 + ROTATE_PAUSE_MS - 1);
    expect(publicState(s, saved).profiles.desk.page).toBe("game");
    s = reduce(s, { type: "tick" }, saved, 5_000 + ROTATE_PAUSE_MS);
    expect(publicState(s, saved).profiles.desk.page).toBe("stream");
    s = reduce(s, { type: "touch", profile: "desk" }, saved, 40_000);
    s = reduce(s, { type: "tick" }, saved, 50_000);
    expect(publicState(s, saved).profiles.desk.page).toBe("stream");
  });
  it("toggles at runtime and returns to the saved setting", () => {
    let s = reduce(emptyState(), { type: "rotate", profile: "desk", state: "toggle" }, saved, 0);
    expect(publicState(s, saved).profiles.desk).toMatchObject({ rotating: false, override: "off" });
    s = reduce(s, { type: "rotate", profile: "desk", state: "saved" }, saved, 0);
    expect(publicState(s, saved).profiles.desk).toMatchObject({ rotating: true, override: null });
    const off = config();
    s = reduce(emptyState(), { type: "rotate", profile: "desk", state: "on" }, off, 0);
    expect(publicState(s, off).profiles.desk.rotating).toBe(true);
    expect(reduce(s, { type: "rotate", state: "sideways" }, off, 0).error).toBeTruthy();
  });
  it("drops an override when the saved rotate option changes", () => {
    const s = reduce(emptyState(), { type: "rotate", profile: "desk", state: "off" }, saved, 0);
    const kept = reduce(s, { type: "config", previous: saved }, config({ enabled: true, seconds: 10 }), 0);
    expect(kept.override.desk).toBe("off");
    const changed = reduce(s, { type: "config", previous: saved }, config({ enabled: true, seconds: 20 }), 0);
    expect(changed.override.desk).toBeUndefined();
  });
});

const islandConfig = (enabled) => ({
  activeProfile: "auto",
  profiles: [
    { id: "desk", pages: [page("main")], island: { enabled } },
    { id: "strip", pages: [page("main")] },
  ],
});

describe("reduce: kiosk reload", () => {
  const c = config();
  it("bumps the global or one profile's counter above every counter", () => {
    const s0 = { ...emptyState(), reload: 100 };
    const s1 = reduce(s0, { type: "kiosk", action: "reload" }, c, 0);
    expect(publicState(s1, c).reload).toBe(101);
    const s2 = reduce(s1, { type: "kiosk", action: "reload", profile: "desk" }, c, 0);
    expect(publicState(s2, c).profiles.desk.reload).toBe(102);
    expect(publicState(s2, c).profiles.strip.reload).toBe(101);
    expect(publicState(reduce(s2, { type: "kiosk", action: "reload" }, c, 0), c).reload).toBe(103);
  });
  it("refuses an unknown profile and an unknown action", () => {
    expect(reduce(emptyState(), { type: "kiosk", action: "reload", profile: "nope" }, c, 0).error).toBeTruthy();
    expect(reduce(emptyState(), { type: "kiosk", action: "nope" }, c, 0).error).toBeTruthy();
  });
});

describe("reduce: kiosk dim", () => {
  const c = config();
  const dim = (s, over, id = "desk") => reduce(s, { type: "kiosk", action: "dim", profile: id, ...over }, c, 0);
  it("toggles on at the default level, then off", () => {
    const on = dim(emptyState(), {});
    expect(publicState(on, c).profiles.desk.dim).toBe(0.6);
    expect(publicState(dim(on, {}), c).profiles.desk.dim).toBe(0);
  });
  it("uses a level sent with on or toggle and remembers it per profile", () => {
    let s = dim(emptyState(), { state: "on", level: 0.3 });
    expect(publicState(s, c).profiles.desk.dim).toBe(0.3);
    s = dim(s, { state: "off" });
    s = dim(s, { state: "toggle" });
    expect(publicState(s, c).profiles.desk.dim).toBe(0.3);
    expect(publicState(dim(s, { state: "toggle" }), c).profiles.desk.dim).toBe(0);
    expect(publicState(dim(s, { state: "toggle", level: 0.9 }, "strip"), c).profiles.strip.dim).toBe(0.9);
    expect(publicState(dim(s, { state: "off" }), c).profiles.strip.dim).toBe(0);
  });
  it("targets the usual profile without one", () => {
    const s = reduce({ ...emptyState(), shown: "strip" }, { type: "kiosk", action: "dim", state: "on" }, c, 0);
    expect(publicState(s, c).profiles.strip.dim).toBe(0.6);
  });
  it("refuses a bad level or state and an unknown profile; returns the same state for a no-op", () => {
    for (const level of [0.05, 0.95, "0.5", NaN]) expect(dim(emptyState(), { level }).error).toBeTruthy();
    expect(dim(emptyState(), { state: "dark" }).error).toBeTruthy();
    expect(dim(emptyState(), {}, "nope").error).toBeTruthy();
    const s = emptyState();
    expect(dim(s, { state: "off" })).toBe(s);
    const on = dim(s, { state: "on" });
    expect(dim(on, { state: "on" })).toBe(on);
  });
});

describe("reduce: kiosk island", () => {
  const isl = (s, state, c = islandConfig(true), id = "desk") =>
    reduce(s, { type: "kiosk", action: "island", profile: id, ...(state ? { state } : {}) }, c, 0);
  it("toggles against the effective value and reports it", () => {
    const c = islandConfig(true);
    const off = isl(emptyState(), undefined, c);
    expect(publicState(off, c).profiles.desk).toMatchObject({ island: false, islandOverride: "off" });
    expect(publicState(isl(off, "toggle", c), c).profiles.desk).toMatchObject({ island: true, islandOverride: "on" });
    expect(publicState(emptyState(), c).profiles.strip.island).toBe(false);
  });
  it("forces on over a disabled island and clears with saved", () => {
    const c = islandConfig(false);
    const on = isl(emptyState(), "on", c);
    expect(publicState(on, c).profiles.desk.island).toBe(true);
    const saved = isl(on, "saved", c);
    expect(publicState(saved, c).profiles.desk).toMatchObject({ island: false, islandOverride: null });
    expect(isl(saved, "saved", c)).toBe(saved);
  });
  it("refuses a bad state and an unknown profile", () => {
    expect(isl(emptyState(), "dark").error).toBeTruthy();
    expect(isl(emptyState(), "on", islandConfig(true), "nope").error).toBeTruthy();
  });
  it("clears the override when the saved island changes", () => {
    const before = islandConfig(true);
    const s = isl(emptyState(), "off", before);
    expect(reduce(s, { type: "config", previous: before }, before, 0)).toBe(s);
    const after = islandConfig(false);
    expect(reduce(s, { type: "config", previous: before }, after, 0).islandOverride).toEqual({});
  });
});

describe("reduce: mute", () => {
  const c = config();
  it("sets the deadline from now, replaces an earlier one and clears with 0", () => {
    const s = reduce(emptyState(), { type: "mute", minutes: 5 }, c, 1000);
    expect(publicState(s, c).mutedUntil).toBe(1000 + 300_000);
    expect(publicState(reduce(s, { type: "mute", minutes: 1 }, c, 2000), c).mutedUntil).toBe(2000 + 60_000);
    const off = reduce(s, { type: "mute", minutes: 0 }, c, 2000);
    expect(publicState(off, c).mutedUntil).toBeNull();
    expect(reduce(off, { type: "mute", minutes: 0 }, c, 3000)).toBe(off);
  });
  it("accepts 1 and 1440 and refuses anything else", () => {
    expect(reduce(emptyState(), { type: "mute", minutes: 1440 }, c, 0).mutedUntil).toBe(1440 * 60_000);
    for (const minutes of [-1, 1441, 1.5, "5", null, undefined]) {
      expect(reduce(emptyState(), { type: "mute", minutes }, c, 0).error).toBeTruthy();
    }
  });
  it("expires on tick", () => {
    const s = reduce(emptyState(), { type: "mute", minutes: 1 }, c, 0);
    expect(reduce(s, { type: "tick" }, c, 59_999)).toBe(s);
    expect(reduce(s, { type: "tick" }, c, 60_000).mutedUntil).toBeNull();
  });
});

describe("createControl", () => {
  const dirs = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "control-"));
    dirs.push(d);
    return path.join(d, "control.json");
  };

  it("persists the durable part and reloads it", () => {
    const file = tmp();
    const c = config();
    const a = createControl({ file, readConfig: () => c, tickMs: 0 });
    a.dispatch({ type: "page", profile: "desk", page: "stream" });
    a.dispatch({ type: "shown", profile: "strip" });
    const b = createControl({ file, readConfig: () => c, tickMs: 0 });
    expect(b.get().profiles.desk.page).toBe("stream");
    expect(b.get().shown).toBeNull();
  });
  it("notifies listeners on visible changes only", () => {
    const c = config();
    const ctl = createControl({ file: tmp(), readConfig: () => c, tickMs: 0 });
    const seen = [];
    ctl.subscribe((s) => seen.push(s));
    ctl.dispatch({ type: "page", profile: "desk", page: "game" });
    ctl.dispatch({ type: "touch", profile: "desk" });
    expect(seen).toHaveLength(1);
    expect(seen[0].profiles.desk.page).toBe("game");
    expect(ctl.dispatch({ type: "page", page: "nope" }).error).toBeTruthy();
  });
  it("survives a missing or broken control.json", () => {
    const file = tmp();
    fs.writeFileSync(file, "{broken");
    expect(createControl({ file, readConfig: () => null, tickMs: 0, now: () => 5000 }).get()).toEqual({
      profile: null,
      shown: null,
      profiles: {},
      alerts: [],
      mutedUntil: null,
      reload: 5000,
    });
  });
  it("publishes the active alerts and notifies only when they change", () => {
    const c = config();
    const ctl = createControl({ file: tmp(), readConfig: () => c, tickMs: 0 });
    const seen = [];
    ctl.subscribe((s) => seen.push(s));
    const list = [{ id: "a1", ruleId: "r1" }];
    ctl.setAlerts(list);
    ctl.setAlerts([{ id: "a1", ruleId: "r1" }]);
    expect(seen).toHaveLength(1);
    expect(seen[0].alerts).toEqual(list);
    expect(ctl.get().alerts).toEqual(list);
    ctl.dispatch({ type: "page", profile: "desk", page: "game" });
    expect(ctl.get().alerts).toEqual(list);
    ctl.setAlerts([]);
    expect(ctl.get().alerts).toEqual([]);
  });
  it("saves dim, island override and mute, not the reload counters, and reloads them", () => {
    const file = tmp();
    const c = islandConfig(true);
    let t = 1000;
    const a = createControl({ file, readConfig: () => c, tickMs: 0, now: () => t });
    a.dispatch({ type: "kiosk", action: "dim", profile: "desk", level: 0.4 });
    a.dispatch({ type: "kiosk", action: "island", profile: "desk", state: "off" });
    a.dispatch({ type: "mute", minutes: 10 });
    a.dispatch({ type: "kiosk", action: "reload" });
    a.dispatch({ type: "kiosk", action: "reload", profile: "desk" });
    expect(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))).sort()).toEqual(
      ["dim", "dimLevel", "islandOverride", "mutedUntil", "override", "pages", "profile"],
    );
    t = 9000;
    const b = createControl({ file, readConfig: () => c, tickMs: 0, now: () => t });
    expect(b.get()).toMatchObject({ mutedUntil: 1000 + 600_000, reload: 9000 });
    expect(b.get().profiles.desk).toMatchObject({ dim: 0.4, island: false, islandOverride: "off", reload: 9000 });
  });
  it("loads an elapsed mute as null and clears a live one on tick", () => {
    const file = tmp();
    const c = config();
    let t = 0;
    const a = createControl({ file, readConfig: () => c, tickMs: 0, now: () => t });
    a.dispatch({ type: "mute", minutes: 1 });
    expect(createControl({ file, readConfig: () => c, tickMs: 0, now: () => 59_999 }).get().mutedUntil).toBe(60_000);
    expect(createControl({ file, readConfig: () => c, tickMs: 0, now: () => 60_000 }).get().mutedUntil).toBeNull();
    const seen = [];
    a.subscribe((s) => seen.push(s.mutedUntil));
    t = 60_000;
    a.dispatch({ type: "tick" });
    expect(seen).toEqual([null]);
  });
  it("keeps alerts out of control.json", () => {
    const file = tmp();
    const c = config();
    const a = createControl({ file, readConfig: () => c, tickMs: 0 });
    a.dispatch({ type: "page", profile: "desk", page: "stream" });
    a.setAlerts([{ id: "a1" }]);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).alerts).toBeUndefined();
    expect(createControl({ file, readConfig: () => c, tickMs: 0 }).get().alerts).toEqual([]);
  });
});
