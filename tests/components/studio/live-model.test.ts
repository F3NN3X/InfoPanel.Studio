import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlState } from "@/lib/control";
import { isMuted, liveActions, rotationNote, toggleRequest } from "@/components/studio/live-model";

afterEach(() => vi.unstubAllGlobals());

/** A fetch that answers every control POST with an empty state and records what was sent. */
function server() {
  const sent: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response("{}");
    }),
  );
  return sent;
}

describe("Live actions", () => {
  it("send each control to its own control route, and nothing else (the config is never written)", async () => {
    const sent = server();
    await liveActions.showPage("p1", "pg2");
    await liveActions.setRotation("p1", false, true);
    await liveActions.setDim("p1", 0.6);
    await liveActions.mute(true);
    await liveActions.setIsland("p1", true, false);
    await liveActions.reload();
    expect(sent).toEqual([
      { url: "/api/control/page", body: { profile: "p1", page: "pg2" } },
      { url: "/api/control/rotate", body: { profile: "p1", state: "off" } },
      { url: "/api/control/kiosk", body: { action: "dim", profile: "p1", state: "on", level: 0.6 } },
      { url: "/api/control/alert", body: { action: "mute", minutes: 60 } },
      { url: "/api/control/kiosk", body: { action: "island", profile: "p1", state: "on" } },
      { url: "/api/control/kiosk", body: { action: "reload" } },
    ]);
    expect(sent.every((s) => s.url.startsWith("/api/control/"))).toBe(true);
  });

  it("puts the dim away at 0 and unmutes with 0 minutes", async () => {
    const sent = server();
    await liveActions.setDim("p1", 0);
    await liveActions.mute(false);
    expect(sent.map((s) => s.body)).toEqual([{ action: "dim", profile: "p1", state: "off" }, { action: "mute", minutes: 0 }]);
  });
});

describe("toggleRequest", () => {
  it("returns to the saved setting when the toggle lands on it, else overrides it", () => {
    expect(toggleRequest(true, true)).toBe("saved");
    expect(toggleRequest(false, false)).toBe("saved");
    expect(toggleRequest(false, true)).toBe("off");
    expect(toggleRequest(true, false)).toBe("on");
  });
});

describe("rotationNote", () => {
  it("says it follows the saved setting, with the interval", () => {
    expect(rotationNote({ rotating: true, override: null, savedEnabled: true, seconds: 20 })).toBe("Following the saved setting: every 20 s.");
    expect(rotationNote({ rotating: false, override: null, savedEnabled: false, seconds: 20 })).toBe("Following the saved setting: off.");
  });

  it("says it is paused for now, and what the saved setting is", () => {
    expect(rotationNote({ rotating: false, override: "off", savedEnabled: true, seconds: 20 })).toBe("Paused for now. Saved setting: every 20 s. Changing the saved setting replaces this.");
    expect(rotationNote({ rotating: true, override: "on", savedEnabled: true, seconds: 90 })).toBe("Running for now. Saved setting: every 1.5 min. Changing the saved setting replaces this.");
  });
});

describe("isMuted", () => {
  const state = (mutedUntil: number | null) => ({ mutedUntil }) as ControlState;
  it("is muted until the server's deadline", () => {
    expect(isMuted(state(2_000), 1_000)).toBe(true);
    expect(isMuted(state(1_000), 1_000)).toBe(false);
    expect(isMuted(state(null), 1_000)).toBe(false);
    expect(isMuted(null, 1_000)).toBe(false);
  });
});
