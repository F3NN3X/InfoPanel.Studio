import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audio, audioAct, audioActThrottled, EMPTY_AUDIO, parseAudio, THROTTLE_MS, type AudioAction } from "@/lib/audio-control";

const volume = (value: number): AudioAction => ({ target: "windows", op: "volume", kind: "app", id: "discord.exe", value });

describe("parseAudio", () => {
  it("reads the server's state and drops what is malformed", () => {
    const state = parseAudio({
      windows: {
        available: true,
        outputs: [{ id: "o1", name: "Speakers", volume: 33.4, muted: false, default: true }, { name: "no id" }, 7],
        inputs: [{ id: "i1", volume: 250, muted: true, default: false }],
        apps: [{ id: "discord.exe", name: "Discord", volume: 50, muted: false, deviceId: "o1" }],
      },
      wavelink: {
        status: "up",
        channels: [{ id: "c1", name: "Music", type: "Channel", level: 40, muted: false, mixes: [{ id: "m1", level: 20, muted: true }, { level: 1 }] }],
        mixes: [{ id: "m1", name: "Stream", level: 100, muted: false }],
      },
    });
    expect(state.windows.outputs).toEqual([{ id: "o1", name: "Speakers", volume: 33, muted: false, default: true }]);
    expect(state.windows.inputs[0]).toMatchObject({ name: "i1", volume: 100, muted: true });
    expect(state.windows.apps[0].deviceId).toBe("o1");
    expect(state.wavelink.channels[0].mixes).toEqual([{ id: "m1", level: 20, muted: true }]);
    expect(state.wavelink.status).toBe("up");
  });

  it("falls back to the empty state, and to absent for an unknown status", () => {
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(parseAudio(bad)).toEqual(EMPTY_AUDIO);
    expect(parseAudio({ wavelink: { status: "weird" } }).wavelink.status).toBe("absent");
  });
});

describe("the writes", () => {
  const sent: AudioAction[] = [];
  let status = 204;
  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    status = 204;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(null, { status });
    });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("posts JSON with the control marker header", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await audioAct(volume(10))).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/audio/act");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" } });
  });

  it("sends a drag at most every THROTTLE_MS, and the last value always follows", async () => {
    for (let v = 1; v <= 30; v++) {
      audioActThrottled("a", volume(v));
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 2);
    const values = sent.map((a) => (a as { value: number }).value);
    // 150 ms of dragging is about three sends plus the trailing one, never one per move.
    expect(values.length).toBeLessThanOrEqual(5);
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values[0]).toBe(1);
    expect(values.at(-1)).toBe(30);
  });

  it("keeps one fader's drag apart from another's", async () => {
    audioActThrottled("x", volume(10));
    audioActThrottled("y", volume(20));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
  });

  it("stops sending after a 403 until the stream reconnects", async () => {
    class FakeSource {
      static last: FakeSource;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor() {
        FakeSource.last = this;
      }
      close() {}
    }
    vi.stubGlobal("EventSource", FakeSource);
    const seen: boolean[] = [];
    const off = audio.subscribe(() => seen.push(true));
    FakeSource.last.onmessage?.({ data: JSON.stringify({ windows: { available: true } }) });
    FakeSource.last.onmessage?.({ data: "not json" });
    expect(seen).toHaveLength(1);
    expect(audio.getState().windows.available).toBe(true);

    status = 403;
    expect(await audioAct(volume(1))).toBe(false);
    status = 204;
    expect(await audioAct(volume(2))).toBe(false);
    expect(sent).toHaveLength(1);

    FakeSource.last.onopen?.();
    expect(await audioAct(volume(3))).toBe(true);
    off();
  });
  it("sends one value at a time per fader, in order, the newest last", async () => {
    const releases: (() => void)[] = [];
    const bodies: number[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      bodies.push((JSON.parse(String(init.body)) as { value: number }).value);
      return new Promise<Response>((resolve) => releases.push(() => resolve(new Response(null, { status: 204 }))));
    });
    audioActThrottled("slow", volume(1));
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 3);
    audioActThrottled("slow", volume(2));
    audioActThrottled("slow", volume(3));
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 3);
    expect(bodies, "the second waits for the first to settle").toEqual([1]);
    releases[0]();
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 3);
    expect(bodies, "and then only the newest goes").toEqual([1, 3]);
    releases[1]();
  });

  it("clears a refusal on the next state message, and opens a stream the server refused again", async () => {
    class FakeSource {
      static CLOSED = 2;
      static all: FakeSource[] = [];
      readyState = 1;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor() {
        FakeSource.all.push(this);
      }
      close() {}
    }
    vi.stubGlobal("EventSource", FakeSource);
    const off = audio.subscribe(() => {});
    status = 403;
    expect(await audioAct(volume(1))).toBe(false);
    status = 204;
    expect(await audioAct(volume(2))).toBe(false);
    FakeSource.all[0].onmessage?.({ data: "{}" });
    expect(await audioAct(volume(3))).toBe(true);

    FakeSource.all[0].readyState = 2;
    FakeSource.all[0].onerror?.();
    await vi.advanceTimersByTimeAsync(6000);
    expect(FakeSource.all).toHaveLength(2);
    off();
  });
});
