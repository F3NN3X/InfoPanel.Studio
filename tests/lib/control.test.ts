import { afterEach, describe, expect, it, vi } from "vitest";
import {
  kioskPageId,
  kioskProfileId,
  neighbourPage,
  postControl,
  withControlPage,
  type ControlState,
} from "@/lib/control";

const state = (over: Partial<ControlState> = {}): ControlState => ({
  profile: null,
  shown: null,
  profiles: { p1: { page: "b", rotating: false, override: null } },
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
    const gone = state({ profiles: { p1: { page: "deleted", rotating: false, override: null } } });
    expect(kioskPageId({ pin: undefined, control: gone, profile })).toBeUndefined();
  });
});

describe("kioskProfileId", () => {
  const config = { profiles: [{ id: "p1" }, { id: "p2" }] } as never;

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
    expect(after.profiles.p1).toEqual({ page: "a", rotating: false, override: null });
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
