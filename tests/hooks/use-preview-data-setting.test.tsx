// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewDataSetting } from "@/hooks/use-preview-data-setting";

const KEY = "studio.previewData";

/** A stand-in for /api/studio-prefs: what GET answers, and the PUT bodies it took. */
function serve(prefs: Record<string, string> | "down") {
  const puts: unknown[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (prefs === "down") throw new TypeError("Failed to fetch");
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify(prefs), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts };
}

describe("the Design preview data setting", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to frozen when unfocused, and keeps this browser's copy while the server is down", async () => {
    serve("down");
    expect(renderHook(() => usePreviewDataSetting()).result.current[0]).toBe("frozenWhenUnfocused");
    localStorage.setItem(KEY, "live");
    const { result } = renderHook(() => usePreviewDataSetting());
    await act(async () => {});
    expect(result.current[0]).toBe("live");
  });

  it("takes the server's value over this browser's copy, and remembers it here", async () => {
    localStorage.setItem(KEY, "live");
    serve({ [KEY]: "frozen" });
    const { result } = renderHook(() => usePreviewDataSetting());
    await waitFor(() => expect(result.current[0]).toBe("frozen"));
    expect(localStorage.getItem(KEY)).toBe("frozen");
  });

  it("reads the server again when the page comes back to the front", async () => {
    serve({});
    const { result } = renderHook(() => usePreviewDataSetting());
    await act(async () => {});
    expect(result.current[0]).toBe("frozenWhenUnfocused");
    // Changed in the other window (the app's Settings, or a browser studio) meanwhile.
    serve({ [KEY]: "live" });
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current[0]).toBe("live"));
  });

  it("saves a change on the server and in this browser", async () => {
    const { puts } = serve({});
    const { result } = renderHook(() => usePreviewDataSetting());
    act(() => result.current[1]("frozen"));
    expect(result.current[0]).toBe("frozen");
    expect(localStorage.getItem(KEY)).toBe("frozen");
    await waitFor(() => expect(puts).toEqual([{ [KEY]: "frozen" }]));
  });
});
