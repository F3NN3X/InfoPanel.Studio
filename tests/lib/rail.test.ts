import { describe, expect, it } from "vitest";
import type { RailSlot } from "@/lib/pinned";
import { actionOn, chipSeries, imageAlt, logoPlate, logoStats, railBadge, railDense, railGroups, railSlots, slotAction, slotName, type BadgeState } from "@/lib/rail";
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

  it("opens the profile picker where the screen has one", () => {
    let opened = 0;
    const deps: TouchActionDeps = { page: () => {}, toggleRotate: () => {}, audio: () => {}, obs: () => {}, picker: () => opened++ };
    expect(runTouchAction({ op: "profile-picker" }, deps)).toBe(true);
    expect(opened).toBe(1);
  });
});

describe("a user image's alt text (owner Q10)", () => {
  const img = { from: "image", asset: `${"a".repeat(64)}.png` } as const;
  it("is the item's name, with what a tap does when the image acts", () => {
    expect(imageAlt({ id: "l", group: "top", target: { kind: "profile" }, icon: img }, "Hexmark logo", PAGES)).toBe("Hexmark logo, opens profiles");
    expect(imageAlt(page("mixer", { icon: img, name: "Sound" }), "Sound", PAGES)).toBe("Sound, opens Mixer");
    // a page item named as its page doesn't say the name twice
    expect(imageAlt(page("mixer", { icon: img }), "Mixer", PAGES)).toBe("Mixer, opens the page");
    expect(imageAlt({ id: "n", group: "actions", target: { kind: "action", action: { op: "page", to: "next" } }, icon: img }, "Next", PAGES)).toBe("Next, opens the next page");
    expect(imageAlt({ id: "m", group: "actions", target: { kind: "action", action: { op: "audio", body: { op: "mute" } } }, icon: img }, "Mic", PAGES)).toBe("Mic, changes the sound");
    // its own tap wins over what the item is; a widget's image does nothing on its own
    expect(imageAlt({ id: "l", group: "top", target: { kind: "profile" }, icon: img, touch: { tap: { op: "lock" } } }, "Logo", PAGES)).toBe("Logo, turns the page lock");
    expect(imageAlt({ id: "w", group: "widgets", target: { kind: "widget", module: "Clock" } }, "Clock", PAGES)).toBe("Clock");
  });
});

describe("a logo's automatic plate (owner Q8)", () => {
  /** `n` pixels of one RGBA colour. */
  const px = (n: number, rgba: number[]) => Array.from({ length: n }, () => rgba).flat();
  const DARK_FG = 0.1; // a light Look's text
  const LIGHT_FG = 0.93; // a dark Look's text

  it("reads the opaque share and, of that, the share near the text's lightness", () => {
    const pixels = [...px(2, [20, 22, 26, 255]), ...px(1, [244, 244, 241, 255]), ...px(1, [0, 0, 0, 0])];
    const s = logoStats(pixels, LIGHT_FG);
    expect(s.opaque).toBe(0.75);
    expect(s.shows).toBeCloseTo(1 / 3);
    expect(logoStats([], LIGHT_FG)).toEqual({ opaque: 0, shows: 0 });
  });

  it("gives a light logo on a light Look the contrast plate, and the card plate where its marks show", () => {
    const light = [...px(3, [247, 247, 244, 255]), ...px(1, [220, 220, 214, 255]), ...px(4, [0, 0, 0, 0])];
    expect(logoPlate(logoStats(light, DARK_FG))).toBe("contrast");
    expect(logoPlate(logoStats(light, LIGHT_FG))).toBe("card");
    // the fixtures' dark hexagon: a dark body with a light core shows on a dark Look through its core
    const dark = [...px(7, [20, 22, 26, 255]), ...px(3, [244, 244, 241, 255]), ...px(10, [0, 0, 0, 0])];
    expect(logoPlate(logoStats(dark, LIGHT_FG))).toBe("card");
    expect(logoPlate(logoStats(dark, DARK_FG))).toBe("card");
  });

  it("gives an image that fills its square no plate: it brings its own ground", () => {
    expect(logoPlate(logoStats([...px(19, [255, 255, 255, 255]), ...px(1, [0, 0, 0, 0])], DARK_FG))).toBe("none");
    expect(logoPlate({ opaque: 0.89, shows: 1 })).toBe("card");
  });
});
