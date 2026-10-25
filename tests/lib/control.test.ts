import { afterEach, describe, expect, it, vi } from "vitest";
import {
  controlEventsUrl,
  kioskPageId,
  kioskProfileId,
  islandEffective,
  neighbourPage,
  postControl,
  reloadCheck,
  withControlPage,
  type ControlState,
} from "@/lib/control";

const state = (over: Partial<ControlState> = {}): ControlState => ({
  profile: null,
  shown: null,
  profiles: { p1: { page: "b", rotating: false, override: null, dim: 0, island: false, islandOverride: null, reload: 0 } },
  mutedUntil: null,
  reload: 0,
  ...over,
});
const profile = { id: "p1", pages: [{ id: "a" }, { id: "b" }] } as never;

describe("kioskPageId", () => {
  it("prefers the ?page= pin when the profile has it", () => {
    expect(kioskPageId({ pin: "a", control: state(), profile })).toBe("a");
  });

  it("falls back to the control page when the pin is unknown or missing", () => {
    expect(kioskPageId({ pin: "zzz", control: state(), profile })).toBe("b");
    expect(kioskPageId({ pin: undefined, control: state(), profile })).toBe("b");
  });

  it("is undefined (the first page) offline, for another profile, or for a vanished page", () => {
    expect(kioskPageId({ pin: undefined, control: null, profile })).toBeUndefined();
    expect(kioskPageId({ pin: undefined, control: state({ profiles: {} }), profile })).toBeUndefined();
    const gone = state({ profiles: { p1: { ...state().profiles.p1, page: "deleted" } } });
    expect(kioskPageId({ pin: undefined, control: gone, profile })).toBeUndefined();
  });
});

describe("kioskProfileId", () => {
  const config = { profiles: [{ id: "p1" }, { id: "p2" }] } as never;

  it("takes the display's assigned screen after the pin and before the override", () => {
    const displays = [{ name: "hall", screen: "p1", firstSeen: 0, lastSeen: 0, online: true, address: null, shows: "p1" }];
    const control = state({ profile: "p2", displays });
    expect(kioskProfileId({ pin: null, control, config, display: "hall" })).toBe("p1");
    expect(kioskProfileId({ pin: "p2", control, config, display: "hall" })).toBe("p2");
    expect(kioskProfileId({ pin: null, control, config, display: "other" })).toBe("p2");
    const follow = state({ profile: "p2", displays: [{ ...displays[0], screen: "follow" }] });
    expect(kioskProfileId({ pin: null, control: follow, config, display: "hall" })).toBe("p2");
  });

  it("lets the URL pin win over the control override", () => {
    expect(kioskProfileId({ pin: "p1", control: state({ profile: "p2" }), config })).toBe("p1");
  });

  it("uses the control override without a pin, ignoring unknown ids", () => {
    expect(kioskProfileId({ pin: null, control: state({ profile: "p2" }), config })).toBe("p2");
    expect(kioskProfileId({ pin: "nope", control: state({ profile: "p2" }), config })).toBe("p2");
    expect(kioskProfileId({ pin: null, control: state({ profile: "gone" }), config })).toBeUndefined();
  });

  it("is undefined (resolve as before) with neither", () => {
    expect(kioskProfileId({ pin: null, control: null, config })).toBeUndefined();
    expect(kioskProfileId({ pin: null, control: state(), config })).toBeUndefined();
  });
});

describe("withControlPage", () => {
  it("sets one profile's page without touching the input", () => {
    const before = state();
    const after = withControlPage(before, "p1", "a");
    expect(after.profiles.p1).toEqual({ ...before.profiles.p1, page: "a" });
    expect(before.profiles.p1.page).toBe("b");
  });

  it("works from no state at all", () => {
    expect(withControlPage(null, "p1", "a").profiles.p1.page).toBe("a");
  });
});

describe("neighbourPage", () => {
  it("wraps both ways", () => {
    expect(neighbourPage(["a", "b", "c"], "c", 1)).toBe("a");
    expect(neighbourPage(["a", "b", "c"], "a", -1)).toBe("c");
    expect(neighbourPage(["a", "b", "c"], "b", 1)).toBe("c");
  });

  it("does nothing with fewer than two pages", () => {
    expect(neighbourPage(["a"], "a", 1)).toBeUndefined();
  });
});

describe("postControl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the JSON body with the control header and returns the new state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => state() });
    vi.stubGlobal("fetch", fetchMock);
    await expect(postControl("page", { profile: "p1", page: "a" })).resolves.toEqual(state());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/control/page");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Dashboard-Control"]).toBe("1");
    expect(JSON.parse(init.body)).toEqual({ profile: "p1", page: "a" });
  });

  it("posts the alert actions and returns the alert list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(postControl("alert", { id: "a1", action: "ack" })).resolves.toEqual({ alerts: [] });
    await postControl("alert", { ruleId: "r1", action: "test" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/control/alert");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: "a1", action: "ack" });
    expect(fetchMock.mock.calls[1][1].headers["X-Dashboard-Control"]).toBe("1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ruleId: "r1", action: "test" });
  });

  it("resolves null when refused or offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(postControl("touch", {})).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(postControl("touch", {})).resolves.toBeNull();
  });
});

describe("islandEffective", () => {
  it("follows the control state, else the saved island", () => {
    const saved = (enabled: boolean) => ({ id: "p1", island: { enabled } }) as never;
    const withIsland = (island: boolean) =>
      state({ profiles: { p1: { ...state().profiles.p1, island } } });
    expect(islandEffective(withIsland(false), saved(true))).toBe(false);
    expect(islandEffective(withIsland(true), saved(false))).toBe(true);
    expect(islandEffective(null, saved(true))).toBe(true);
    expect(islandEffective(null, { id: "p1" } as never)).toBe(false);
  });
});

describe("reloadCheck", () => {
  const at = (reload: number, own: number, link = 1) =>
    state({ reload, link, profiles: { p1: { ...state().profiles.p1, reload: own } } });
  it("only sets the baseline on the first message, a reconnect or another profile", () => {
    const first = reloadCheck(null, at(5, 0), "p1");
    expect(first.reload).toBe(false);
    expect(reloadCheck(first.baseline, at(9, 0, 2), "p1").reload).toBe(false);
    expect(reloadCheck(first.baseline, at(9, 0), "p2").reload).toBe(false);
  });
  it("reloads when the global or the profile counter grows, once", () => {
    const first = reloadCheck(null, at(5, 7), "p1");
    expect(reloadCheck(first.baseline, at(5, 7), "p1").reload).toBe(false);
    const own = reloadCheck(first.baseline, at(5, 8), "p1");
    expect(own.reload).toBe(true);
    expect(reloadCheck(own.baseline, at(5, 8), "p1").reload).toBe(false);
    expect(reloadCheck(first.baseline, at(9, 7), "p1").reload).toBe(true);
  });
});

describe("controlEventsUrl", () => {
  it("carries a kiosk's display and whether its link pins a profile", () => {
    expect(controlEventsUrl("p1", undefined, false, { name: "hall", pinned: false })).toBe("/events/control?profile=p1&display=hall");
    expect(controlEventsUrl("p1", "b", false, { name: "hall", pinned: true })).toBe("/events/control?profile=p1&page=b&display=hall&pinned=1");
    expect(controlEventsUrl("p1")).toBe("/events/control?profile=p1");
  });
});
