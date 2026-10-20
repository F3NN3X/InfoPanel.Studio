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
    expect(createControl({ file, readConfig: () => null, tickMs: 0 }).get()).toEqual({
      profile: null,
      shown: null,
      profiles: {},
      alerts: [],
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
