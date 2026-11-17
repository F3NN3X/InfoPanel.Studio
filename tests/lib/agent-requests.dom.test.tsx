// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRequests, parseRequests, POLL_MS, resetAgentRequests, secondsLeft, useAgentRequests } from "@/lib/agent-requests";

// The kiosk's side of agent approvals (pinned layer P8): the requests read from their own route with the answer header,
// asked for only while a session waits, and never again on a device the server refuses.

const ONE = { requests: [{ id: "r1", agent: "claude", session: "abc", project: "p", tool: "Bash", text: "ls", left: 20_000 }] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(1_000);
  fetchMock = vi.fn(async () => new Response(JSON.stringify(ONE), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  resetAgentRequests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parseRequests", () => {
  it("keeps well-formed requests and stamps when each one's wait ends", () => {
    const got = parseRequests({ requests: [...ONE.requests, { id: 5 }, { id: "x", agent: "gemini" }, null] }, 1_000);
    expect(got).toEqual([{ id: "r1", agent: "claude", session: "abc", project: "p", tool: "Bash", text: "ls", until: 21_000 }]);
    expect(secondsLeft(got[0], 1_000)).toBe(20);
    expect(secondsLeft(got[0], 30_000)).toBe(0);
    expect(parseRequests(null, 0)).toEqual([]);
  });
});

describe("fetchRequests", () => {
  it("sends the answer header, and reads a refusal as this device not being allowed", async () => {
    expect((await fetchRequests())?.map((r) => r.id)).toEqual(["r1"]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agents/requests");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({ "X-Agent-Answer": "1" });
    fetchMock.mockResolvedValueOnce(new Response("agent requests are answered on this machine only", { status: 403 }));
    expect(await fetchRequests()).toBeNull();
  });
});

describe("useAgentRequests", () => {
  it("asks nothing while no session waits, polls while one does", async () => {
    const { result, rerender } = renderHook(({ active }) => useAgentRequests(active), { initialProps: { active: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ active: true });
    await act(async () => {});
    expect(result.current.map((r) => r.id)).toEqual(["r1"]);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    rerender({ active: false });
    expect(result.current).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(5 * POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops asking for good on a device the server refuses", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 403 }));
    const { result } = renderHook(() => useAgentRequests(true));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(result.current).toEqual([]);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(5 * POLL_MS);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
