import { afterEach, describe, expect, it, vi } from "vitest";
import { MEDIA_ACT_URL, mediaKey } from "@/lib/media-control";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mediaKey", () => {
  it("posts the key as JSON with the control marker and says whether the PC took it", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetch);
    expect(await mediaKey("play-pause")).toBe(true);
    expect(fetch).toHaveBeenCalledWith(MEDIA_ACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: '{"key":"play-pause"}',
    });
    fetch.mockResolvedValue({ ok: false, status: 403 });
    expect(await mediaKey("next")).toBe(false);
    fetch.mockRejectedValue(new Error("offline"));
    expect(await mediaKey("previous")).toBe(false);
  });
});
