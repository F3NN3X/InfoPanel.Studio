import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS, parseExtras } from "@/lib/extras";
import { obsAct, OBS_ACT_URL } from "@/lib/obs-control";

afterEach(() => vi.unstubAllGlobals());

describe("obsAct", () => {
  it("posts the action as JSON with the control marker and says whether OBS took it", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetch);
    expect(await obsAct({ op: "scene", id: "u1" })).toBe(true);
    expect(fetch).toHaveBeenCalledWith(OBS_ACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: '{"op":"scene","id":"u1"}',
    });
    fetch.mockResolvedValue({ ok: false, status: 503 });
    expect(await obsAct({ op: "mic" })).toBe(false);
    fetch.mockRejectedValue(new Error("offline"));
    expect(await obsAct({ op: "replay" })).toBe(false);
  });
});

describe("parseExtras, the OBS control fields", () => {
  it("reads scenes, mic, replay and the numbers, and drops what is malformed", () => {
    const { obs } = parseExtras({
      obs: {
        configured: true,
        connected: true,
        streaming: true,
        recording: false,
        scenes: [{ id: "u1", name: "Game", sub: "Main", icon: "sports_esports" }, { name: "no id" }, 3, { id: "u2" }],
        currentScene: "u1",
        uptime: 61,
        kbps: 4500,
        fps: -3,
        mic: { name: "Mic/Aux", muted: true, level: 250 },
        replay: { active: true },
        inputs: ["Mic/Aux", 4, ""],
      },
    });
    expect(obs.scenes).toEqual([
      { id: "u1", name: "Game", sub: "Main", icon: "sports_esports" },
      { id: "u2", name: "u2", sub: "", icon: "" },
    ]);
    expect(obs).toMatchObject({ currentScene: "u1", uptime: 61, kbps: 4500, fps: 0, mic: { name: "Mic/Aux", muted: true, level: 100 }, replay: { active: true }, inputs: ["Mic/Aux"] });
  });

  it("is empty for the on-air fields alone, and reads viewers only when the server sends them", () => {
    const bare = parseExtras({ obs: { configured: true, connected: false, streaming: false, recording: false } });
    expect(bare.obs).toEqual({ ...EMPTY_EXTRAS.obs, configured: true });
    expect(bare.twitch).toBeUndefined();
    expect(parseExtras({ twitch: { viewers: 12 }, youtube: { viewers: "x" } })).toMatchObject({ twitch: { viewers: 12 } });
    expect(parseExtras({ youtube: { viewers: "x" } }).youtube).toBeUndefined();
  });
});
