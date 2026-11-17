import { describe, expect, it } from "vitest";
import type { RailSlot } from "@/lib/pinned";
import { actionOn, chipSeries, railBadge, railDense, railGroups, railSlots, slotAction, slotName, type BadgeState } from "@/lib/rail";
import { runTouchAction, type TouchActionDeps } from "@/lib/touch-actions";

const PAGES = [
  { id: "keys", name: "Keys", icon: "zap" },
  { id: "mixer", name: "Mixer" },
];
const page = (id: string, extra: Partial<RailSlot> = {}): RailSlot => ({ id: `s-${id}`, group: "pages", target: { kind: "page", pageId: id }, ...extra });
const NONE: BadgeState = { agents: { sessions: [] }, obs: { streaming: false }, alerts: [], profile: "main" };

describe("the rail's slots", () => {
  it("are the stored ones, or one per page with its icon when none are stored", () => {
    const own = [page("mixer")];
    expect(railSlots(own, PAGES)).toEqual(own);
    expect(railSlots([], PAGES).map((s) => [s.target, s.icon, s.name])).toEqual([
      [{ kind: "page", pageId: "keys" }, { from: "set", name: "zap" }, "Keys"],
      [{ kind: "page", pageId: "mixer" }, undefined, "Mixer"],
    ]);
  });

  it("group top to bottom, empty groups left out and the bottom group at the foot", () => {
    const slots: RailSlot[] = [{ ...page("mixer"), id: "foot", group: "bottom" }, page("keys"), { id: "logo", group: "top", target: { kind: "profile" } }];
    const { head, foot } = railGroups(slots);
    expect(head.map((g) => g.map((s) => s.id))).toEqual([["logo"], ["s-keys"]]);
    expect(foot.map((s) => s.id)).toEqual(["foot"]);
  });

  it("are named by their own name, else their page's, else what they do", () => {
    expect(slotName(page("keys", { name: "Mine" }), PAGES)).toBe("Mine");
    expect(slotName(page("keys"), PAGES)).toBe("Keys");
    expect(slotName({ id: "a", group: "actions", target: { kind: "action", action: { op: "lock" } } }, PAGES)).toBe("Page lock");
  });

  it("draw dense under 580 px of height", () => {
    expect(railDense(550)).toBe(true);
    expect(railDense(580)).toBe(false);
  });

  it("give each profile its own chip colour, round the six series", () => {
    expect([0, 5, 6, -1].map(chipSeries)).toEqual([1, 6, 1, 1]);
  });
});

describe("a slot's badge", () => {
  it("shows a dot while an agent waits", () => {
    const slot = page("keys", { badge: { when: "agents-waiting" } });
    expect(railBadge(slot, NONE)).toBeUndefined();
    const sessions = [{ state: "waiting" }, { state: "working" }, { state: "waiting" }] as BadgeState["agents"]["sessions"];
    expect(railBadge(slot, { ...NONE, agents: { sessions } })).toEqual({ tone: "warn", say: "2 agents need you" });
  });

  it("follows the alerts shown, on a page slot only those that go to its page", () => {
    const slot = page("keys", { badge: { when: "alerts" } });
    const alerts: BadgeState["alerts"] = [
      { severity: "warning", page: { page: "mixer" } },
      { severity: "critical", page: { page: "keys", profile: "other" } },
    ];
    expect(railBadge(slot, { ...NONE, alerts })).toBeUndefined();
    expect(railBadge(slot, { ...NONE, alerts: [...alerts, { severity: "warning", page: { page: "keys" } }] })).toEqual({ tone: "warn", say: "an alert" });
    const action: RailSlot = { id: "a", group: "actions", target: { kind: "action", action: { op: "lock" } }, badge: { when: "alerts" } };
    expect(railBadge(action, { ...NONE, alerts })).toEqual({ tone: "crit", say: "2 alerts" });
  });

  it("says LIVE while OBS streams", () => {
    const slot = page("keys", { badge: { when: "obs-live" } });
    expect(railBadge(slot, NONE)).toBeUndefined();
    expect(railBadge(slot, { ...NONE, obs: { streaming: true } })).toEqual({ text: "LIVE", tone: "crit", say: "live on OBS" });
  });
});

describe("what a slot does", () => {
  it("taps to its page, its action or the profile picker; its touch map comes first", () => {
    expect(slotAction(page("keys"), "tap")).toEqual({ op: "page", to: "keys" });
    expect(slotAction(page("keys"), "hold")).toBeUndefined();
    expect(slotAction(page("keys", { touch: { tap: { op: "lock" }, hold: { op: "page", to: "next" } } }), "tap")).toEqual({ op: "lock" });
    expect(slotAction(page("keys", { touch: { hold: { op: "page", to: "next" } } }), "hold")).toEqual({ op: "page", to: "next" });
    expect(slotAction({ id: "p", group: "top", target: { kind: "profile" } }, "tap")).toEqual({ op: "profile-picker" });
    expect(slotAction({ id: "w", group: "widgets", target: { kind: "widget", module: "Clock" } }, "tap")).toBeUndefined();
  });

  it("shows a mute as on while its device is muted, and other actions as no toggle", () => {
    const audio = { windows: { available: true, outputs: [], inputs: [{ id: "mic", name: "Mic", volume: 50, muted: true, default: true }], apps: [] } };
    expect(actionOn({ op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "mic" } }, audio)).toBe(true);
    expect(actionOn({ op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "gone" } }, audio)).toBe(false);
    expect(actionOn({ op: "audio", body: { target: "windows", op: "volume", kind: "input", id: "mic", value: 3 } }, audio)).toBeUndefined();
    expect(actionOn({ op: "lock" }, audio)).toBeUndefined();
  });

  it("runs a page, the lock and the guarded audio and OBS routes; the rest waits for its phase", () => {
    const calls: unknown[][] = [];
    const deps: TouchActionDeps = { page: (to) => calls.push(["page", to]), toggleRotate: () => calls.push(["rotate"]), audio: (b) => calls.push(["audio", b]), obs: (b) => calls.push(["obs", b]) };
    expect(runTouchAction({ op: "page", to: "next" }, deps)).toBe(true);
    expect(runTouchAction({ op: "lock" }, deps)).toBe(true);
    expect(runTouchAction({ op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "mic" } }, deps)).toBe(true);
    expect(runTouchAction({ op: "obs", body: { op: "mic" } }, deps)).toBe(true);
    expect(runTouchAction({ op: "run", command: "calc.exe" }, deps)).toBe(false);
    expect(runTouchAction({ op: "media", key: "next" }, deps)).toBe(false);
    expect(runTouchAction({ op: "profile-picker" }, deps)).toBe(false);
    expect(calls).toEqual([["page", "next"], ["rotate"], ["audio", { target: "windows", op: "mute", kind: "input", id: "mic" }], ["obs", { op: "mic" }]]);
  });
});
