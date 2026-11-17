// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The prompt window's IPC (pinned layer P8): the requests read with `agent_requests` and kept current by the app's events,
// answers given with `agent_answer`, and nothing over HTTP.

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
let emit: (payload: unknown) => void = () => {};
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: Record<string, unknown>) => invoke(c, a) }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: async (_event: string, cb: (e: { payload: unknown }) => void) => {
      emit = (payload) => cb({ payload });
      return () => {};
    },
  }),
}));

const { answerRequest, fetchRequests, REQUESTS_EVENT, useAgentRequests } = await import("@/agent-prompt/requests");

const ONE = { requests: [{ id: "r1", agent: "claude", session: "abc", project: "p", tool: "Bash", text: "ls", left: 20_000 }] };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the prompt window's requests", () => {
  it("reads them by IPC, and none when the app refuses", async () => {
    invoke.mockResolvedValueOnce(ONE);
    expect((await fetchRequests()).map((r) => r.id)).toEqual(["r1"]);
    expect(invoke).toHaveBeenCalledWith("agent_requests", undefined);
    invoke.mockRejectedValueOnce("Agent requests are answered in InfoPanel Studio's own prompt window only.");
    expect(await fetchRequests()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers by IPC with the request's id, and reads a refusal as not taken", async () => {
    invoke.mockResolvedValueOnce(true);
    expect(await answerRequest("r1", "deny")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("agent_answer", { id: "r1", behavior: "deny" });
    invoke.mockResolvedValueOnce(false);
    expect(await answerRequest("gone", "allow")).toBe(false);
    invoke.mockRejectedValueOnce("no");
    expect(await answerRequest("r1", "allow")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows the app's events after the first read", async () => {
    expect(REQUESTS_EVENT).toBe("agent-requests");
    invoke.mockResolvedValue(ONE);
    const { result } = renderHook(() => useAgentRequests());
    await act(async () => {});
    expect(result.current.map((r) => r.id)).toEqual(["r1"]);
    act(() => emit({ requests: [] }));
    expect(result.current).toEqual([]);
  });
});
