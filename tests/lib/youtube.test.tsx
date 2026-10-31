// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYoutubePending, PENDING_POLL_MS, safeGoogleUrl, useYoutubePending, youtubeSignin } from "@/lib/youtube";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";

describe("safeGoogleUrl", () => {
  it("keeps https accounts.google.com addresses and drops everything else", () => {
    expect(safeGoogleUrl(AUTH)).toBe(AUTH);
    for (const bad of ["http://accounts.google.com/a", "https://accounts.google.com.evil.example/a", "https://evil.example/accounts.google.com", "https://user:pw@accounts.google.com/a", "javascript:alert(1)", "not a url", "", 5, null]) {
      expect(safeGoogleUrl(bad)).toBeNull();
    }
  });
});

describe("the sign-in calls", () => {
  it("starts a sign-in with Google's address, and passes a refusal on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ authUrl: AUTH }) })));
    expect(await youtubeSignin()).toEqual({ ok: true, authUrl: AUTH });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ authUrl: "https://evil.example/" }) })));
    expect(await youtubeSignin()).toMatchObject({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => "Enter the Client ID and the client secret first." })));
    expect(await youtubeSignin()).toEqual({ ok: false, error: "Enter the Client ID and the client secret first." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect(await youtubeSignin()).toEqual({ ok: false, error: "The dashboard server didn't answer." });
  });

  it("reads the pending address from this machine's route, and null when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pending: { auth_url: AUTH, expires_at: 99 }, error: null }) })));
    expect(await fetchYoutubePending()).toEqual({ pending: { authUrl: AUTH, expiresAt: 99 }, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pending: null, error: "The sign-in took too long. Start again." }) })));
    expect(await fetchYoutubePending()).toEqual({ pending: null, error: "The sign-in took too long. Start again." });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
    expect(await fetchYoutubePending()).toBeNull();
  });
});

describe("useYoutubePending", () => {
  it("polls while active and stops when not", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ pending: { auth_url: AUTH, expires_at: 5 }, error: null }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ active }) => useYoutubePending(active), { initialProps: { active: true } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_POLL_MS + 10);
    });
    expect(result.current).toEqual({ authUrl: AUTH, expiresAt: 5 });
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    rerender({ active: false });
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
