import { afterEach, describe, expect, it, vi } from "vitest";
import { deckAct, deckPress, iconUrl, parseStreamDeck, streamDeckRefusal } from "@/lib/streamdeck";

afterEach(() => {
  vi.unstubAllGlobals();
  streamDeckRefusal.set(false);
});

describe("parseStreamDeck", () => {
  it("reads the server's state and drops what is malformed", () => {
    const state = parseStreamDeck({
      enabled: true,
      pairingCode: "AB12CD",
      devices: [
        { id: "d1", name: "IPStudio", cols: 5, rows: 3, status: "ready", page: { current: 1, total: 3 }, keys: [{ index: 0, title: "Mute", icon: "abc" }, { index: 1, title: "", icon: null }, "junk"] },
        { name: "no id" },
        { id: "d2", cols: 99, rows: 0, status: "weird" },
      ],
    });
    expect(state.enabled).toBe(true);
    expect(state.devices.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(state.devices[0].keys).toEqual([{ index: 0, title: "Mute", icon: "abc" }, { index: 1, title: "", icon: null }]);
    expect(state.devices[1]).toMatchObject({ name: "d2", cols: 8, rows: 1, status: "connecting", page: { current: 0, total: 0 } });
  });

  it("answers an empty, off state for anything else", () => {
    expect(parseStreamDeck(null)).toEqual({ enabled: false, pairingCode: "", devices: [] });
  });
});

describe("deckAct and deckPress", () => {
  it("sends the control header, returns a create's id and stops sending after a 403", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const op = JSON.parse(String(init?.body)).op;
      return op === "create" ? new Response(JSON.stringify({ id: "d9" }), { status: 200 }) : new Response("no", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const made = await deckAct({ op: "create" });
    expect(made).toMatchObject({ ok: true, data: { id: "d9" } });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "X-Dashboard-Control": "1" } });
    expect((await deckAct({ op: "pair" })).status).toBe(403);
    expect(streamDeckRefusal.get()).toBe(true);
    await deckAct({ op: "pair" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends one device's down and up one after the other, in order", async () => {
    const seen: string[] = [];
    let release: () => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push(`start ${JSON.parse(String(init?.body)).down}`);
        if (seen.length === 1) await new Promise<void>((r) => (release = r));
        seen.push(`end ${JSON.parse(String(init?.body)).down}`);
        return new Response(null, { status: 204 });
      })
    );
    const down = deckPress("lane", 2, true);
    const up = deckPress("lane", 2, false);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(["start true"]);
    release();
    await Promise.all([down, up]);
    expect(seen).toEqual(["start true", "end true", "start false", "end false"]);
  });

  it("sends a release after a 403 and tries it once more when the server didn't answer, but no new press", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network");
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    streamDeckRefusal.set(true);
    expect((await deckPress("retry", 1, true)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await deckPress("retry", 1, false)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("iconUrl", () => {
  it("addresses the key and carries the version", () => {
    expect(iconUrl("a b", 3, "v1")).toBe("/api/streamdeck/icon?device=a%20b&index=3&v=v1");
  });
});
