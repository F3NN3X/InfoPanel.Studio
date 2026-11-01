import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamDeckClient, deckAct, deckPress, iconUrl, parseStreamDeck, streamDeckRefusal } from "@/lib/streamdeck";

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

  it("says why an action was refused in plain words, never with the server's body", async () => {
    const bodies: Record<string, [number, string]> = { rename: [400, "invalid type: integer `3`, expected a string at line 1"], forget: [404, "There's no such Stream Deck device."], pair: [503, "The Stream Deck connection is off."], grid: [500, "panic at src/streamdeck/mod.rs"] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const [status, text] = bodies[JSON.parse(String(init?.body)).op];
        return new Response(text, { status });
      })
    );
    expect((await deckAct({ op: "rename", device: "d1", name: "x" })).error).toBe("The dashboard server didn't accept that change");
    expect((await deckAct({ op: "forget", device: "d1" })).error).toBe("That Stream Deck device is gone");
    expect((await deckAct({ op: "pair" })).error).toBe("The Stream Deck app isn't connected");
    expect((await deckAct({ op: "grid", device: "d1", cols: 2, rows: 2 })).error).toBe("The Stream Deck change didn't go through");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden: another machine", { status: 403 })));
    expect((await deckAct({ op: "pair" })).error).toBe("Read-only on this screen");
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

describe("the stream's link", () => {
  class FakeSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    static last: FakeSource | null = null;
    readyState = FakeSource.CONNECTING;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    constructor() {
      FakeSource.last = this;
    }
    close() {
      this.readyState = FakeSource.CLOSED;
    }
  }

  it("is connecting until the stream opens, lost while it retries after dropping, open again when it is back", () => {
    vi.stubGlobal("EventSource", FakeSource);
    const client = createStreamDeckClient("/events/streamdeck");
    const seen: string[] = [];
    const stop = client.subscribe(() => seen.push(client.getLink()));
    const source = FakeSource.last!;
    expect(client.getLink()).toBe("connecting");
    source.onopen?.();
    source.onmessage?.({ data: JSON.stringify({ enabled: true, devices: [{ id: "d1" }] }) });
    expect(client.getLink()).toBe("open");
    // The server went away: the browser retries, and the last state is kept but stale.
    source.onerror?.();
    expect(client.getLink()).toBe("lost");
    expect(client.getState().devices.map((d) => d.id)).toEqual(["d1"]);
    source.onopen?.();
    expect(seen).toEqual(["open", "open", "lost", "open"]);
    stop();
    expect(client.getLink()).toBe("connecting");
  });
});

describe("iconUrl", () => {
  it("addresses the key and carries the version", () => {
    expect(iconUrl("a b", 3, "v1")).toBe("/api/streamdeck/icon?device=a%20b&index=3&v=v1");
  });
});
