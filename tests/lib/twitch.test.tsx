// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTwitchPending, PENDING_POLL_MS, safeActivateUrl, TWITCH_ACTIVATE_URL, twitchSignin, useTwitchPending } from "@/lib/twitch";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pendingReply = { pending: { user_code: "AB-CD", verification_uri: "https://www.twitch.tv/activate", expires_at: 99 }, error: null };

describe("safeActivateUrl", () => {
  it("keeps https twitch.tv addresses and replaces everything else with the activate page", () => {
    expect(safeActivateUrl("https://www.twitch.tv/activate?public=true")).toBe("https://www.twitch.tv/activate?public=true");
    expect(safeActivateUrl("https://twitch.tv/activate")).toBe("https://twitch.tv/activate");
    for (const bad of ["http://www.twitch.tv/activate", "https://eviltwitch.tv/a", "https://twitch.tv.evil.example/a", "https://user:pw@www.twitch.tv/a", "javascript:alert(1)", "not a url", ""]) {
      expect(safeActivateUrl(bad)).toBe(TWITCH_ACTIVATE_URL);
    }
  });
});

describe("the sign-in calls", () => {
  it("reads the pending code from this machine's route, and null when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => pendingReply })));
    expect(await fetchTwitchPending()).toEqual({ pending: { userCode: "AB-CD", verificationUri: "https://www.twitch.tv/activate", expiresAt: 99 }, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pending: null, error: "The code expired." }) })));
    expect(await fetchTwitchPending()).toEqual({ pending: null, error: "The code expired." });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
    expect(await fetchTwitchPending()).toBeNull();
  });

  it("starts a sign-in and passes a refusal on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user_code: "AB", verification_uri: "https://www.twitch.tv/activate", expires_in: 600 }) })));
    expect(await twitchSignin()).toEqual({ ok: true, userCode: "AB", verificationUri: "https://www.twitch.tv/activate", expiresIn: 600 });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, text: async () => "couldn't reach Twitch" })));
    expect(await twitchSignin()).toEqual({ ok: false, error: "couldn't reach Twitch" });
  });
});

describe("useTwitchPending", () => {
  it("polls while a sign-in is pending and stops, with nothing shown, when it is not", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => pendingReply }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(({ on }) => useTwitchPending(on), { initialProps: { on: false } });
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ on: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current?.userCode).toBe("AB-CD");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_POLL_MS * 2);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    rerender({ on: false });
    expect(result.current).toBeNull();
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    unmount();
  });
});
