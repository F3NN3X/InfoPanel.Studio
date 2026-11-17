// @vitest-environment happy-dom
// L4: the status bar's ping times out, never overlaps itself, and stops with its effect.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pingApi, PING_TIMEOUT_MS } from "@/components/studio/ping-api";
import { useApiLatency } from "@/components/studio/use-status-bar";
import { holdApiBase, releaseApiBase } from "@/lib/data-api";

/** A fetch that never answers on its own, only when its signal aborts. */
const hanging = () =>
  vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pingApi", () => {
  it("answers null for a Data API that never replies, after the timeout", async () => {
    vi.stubGlobal("fetch", hanging());
    const result = pingApi("http://10.0.0.9:3921");
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS);
    expect(await result).toBeNull();
  });

  it("answers null when a 200 doesn't come, and the time when it does", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await pingApi("http://x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(typeof (await pingApi("http://x"))).toBe("number");
  });

  it("waits while the studio holds Data API requests, and a ping aborted meanwhile never goes out", async () => {
    const fetcher = vi.fn(async (_url: string) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    holdApiBase();
    const stop = new AbortController();
    const stale = pingApi("http://127.0.0.1:3921", stop.signal);
    const fresh = pingApi("http://fake:9");
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    // the config's address replaces the default one: that ping is aborted, then the hold ends
    stop.abort();
    releaseApiBase();
    expect(await stale).toBeNull();
    expect(typeof (await fresh)).toBe("number");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["http://fake:9/api"]);
  });
});

describe("useApiLatency", () => {
  it("does not start a second ping while one is in flight", async () => {
    const fetcher = hanging();
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = renderHook(() => useApiLatency(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS - 3000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it("aborts the ping in flight when it unmounts", async () => {
    const fetcher = hanging();
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = renderHook(() => useApiLatency(false));
    const signal = fetcher.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
