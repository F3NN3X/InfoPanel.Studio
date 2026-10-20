import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SensorStore, type StreamLike } from "@/lib/sensor-store";

class FakeStream implements StreamLike {
  readyState = 0;
  onopen: StreamLike["onopen"] = null;
  onmessage: StreamLike["onmessage"] = null;
  onerror: StreamLike["onerror"] = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  send(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  fail(closed: boolean) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.(new Event("error"));
  }
}

const BASE = "http://api";

function setup(fetchImpl?: typeof fetch) {
  const streams: FakeStream[] = [];
  const store = new SensorStore(
    BASE,
    (url) => {
      const s = new FakeStream(url);
      streams.push(s);
      return s;
    },
    fetchImpl ?? (vi.fn() as unknown as typeof fetch)
  );
  const live = () => streams.filter((s) => !s.closed);
  const prefixOf = (s: FakeStream) => new URL(s.url).searchParams.get("prefix");
  return { store, streams, live, prefixOf };
}

const sensor = (value: number) => ({ value, unit: "" });
/** Let the store plan its streams (it batches retains per microtask). */
const flush = () => Promise.resolve();

describe("SensorStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens one change stream per retained namespace", async () => {
    const { store, live, prefixOf } = setup();
    store.retain(["system.cpu.", "system.ram."]);
    await flush();
    store.retain(["plugins.media-plugin."]);
    await flush();
    expect(live().map(prefixOf).sort()).toEqual(["plugins.media-plugin.", "system."]);
    expect(live()[0].url).toBe(`${BASE}/events?prefix=system.&interval=1000`);
  });

  it("merges messages and reports changed keys", async () => {
    const { store, live } = setup();
    const changes: string[][] = [];
    store.subscribe((c) => changes.push([...c]));
    store.retain(["system."]);
    await flush();
    const s = live()[0];
    s.open();
    s.send({ timestamp: 5, sensors: { "system.cpu.load": sensor(10), "system.ram.load": sensor(20) } });
    s.send({ timestamp: 6, sensors: { "system.cpu.load": sensor(11) } });
    s.send({ timestamp: 7, sensors: { "system.cpu.load": sensor(11) } }); // no change
    expect(changes).toEqual([["system.cpu.load", "system.ram.load"], ["system.cpu.load"]]);
    expect(store.getValues()["system.cpu.load"].value).toBe(11);
    expect(store.getTimestamp()).toBe(7);
    expect(store.isConnected()).toBe(true);
  });

  it("treats the first message after a reconnect as the full set", async () => {
    const { store, live } = setup();
    store.retain(["system."]);
    await flush();
    const s = live()[0];
    s.open();
    s.send({ timestamp: 1, sensors: { "system.a": sensor(1), "system.b": sensor(2) } });
    s.fail(false); // dropped; EventSource reconnects on its own
    expect(store.isConnected()).toBe(false);
    s.open();
    s.send({ timestamp: 2, sensors: { "system.a": sensor(1) } });
    expect(Object.keys(store.getValues())).toEqual(["system.a"]);
    expect(store.isConnected()).toBe(true);
  });

  it("ignores malformed messages", async () => {
    const { store, live } = setup();
    store.retain(["system."]);
    await flush();
    live()[0].onmessage?.({ data: "{oops" } as MessageEvent<string>);
    expect(store.getValues()).toEqual({});
  });

  it("closes a released namespace after a grace delay and drops its values", async () => {
    const { store, live, prefixOf } = setup();
    const changes: string[][] = [];
    store.subscribe((c) => changes.push([...c]));
    const releaseSystem = store.retain(["system."]);
    await flush();
    store.retain(["libre."]);
    await flush();
    live()[0].send({ timestamp: 1, sensors: { "system.a": sensor(1) } });
    live()[1].send({ timestamp: 1, sensors: { "libre.b": sensor(2) } });

    releaseSystem();
    releaseSystem(); // idempotent
    await flush();
    expect(live()).toHaveLength(2);
    vi.advanceTimersByTime(2000);
    expect(live().map(prefixOf)).toEqual(["libre."]);
    expect(Object.keys(store.getValues())).toEqual(["libre.b"]);
    expect(changes.at(-1)).toEqual(["system.a"]);
  });

  it("reuses a stream when a namespace is retained again before it closes", async () => {
    const { store, streams } = setup();
    store.retain(["system."])();
    await flush();
    await flush();
    store.retain(["system."]);
    await flush();
    vi.advanceTimersByTime(5000);
    expect(streams).toHaveLength(1);
    expect(streams[0].closed).toBe(false);
  });

  it("plans one batch of retains together, without interim streams", async () => {
    const { store, streams, prefixOf } = setup();
    for (const p of ["plugins.a.", "plugins.b.", "plugins.c.", "system.", "libre."]) store.retain([p]);
    await flush();
    expect(streams.map(prefixOf).sort()).toEqual(["libre.", "plugins.", "system."]);
  });

  it("folds plugin streams into one past the connection budget", async () => {
    const { store, live, prefixOf } = setup();
    store.retain(["plugins.a.", "plugins.b.", "plugins.c.", "system.", "libre."]);
    await flush();
    expect(live().map(prefixOf).sort()).toEqual(["libre.", "plugins.", "system."]);
  });

  it("follows a Data API URL change: old streams close, values clear", async () => {
    const { store, live } = setup();
    store.retain(["system."]);
    await flush();
    live()[0].send({ timestamp: 1, sensors: { "system.a": sensor(1) } });
    const changes: string[][] = [];
    store.subscribe((c) => changes.push([...c]));

    store.setBase("http://other:1");
    expect(live()).toHaveLength(1);
    expect(live()[0].url.startsWith("http://other:1/events?prefix=system.")).toBe(true);
    expect(store.getValues()).toEqual({});
    expect(changes).toEqual([["system.a"]]);

    store.setBase("http://other:1"); // same base: no-op
    expect(live()).toHaveLength(1);
  });

  it("reopens a stream the server refused", async () => {
    const { store, streams, live } = setup();
    store.retain(["system."]);
    await flush();
    streams[0].fail(true);
    expect(streams).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(streams).toHaveLength(2);
    expect(streams[0].closed).toBe(true);
    expect(live()).toHaveLength(1);
  });

  it("does not reopen a refused stream that is no longer wanted", async () => {
    const { store, streams } = setup();
    const release = store.retain(["system."]);
    await flush();
    streams[0].fail(true);
    release();
    await flush();
    vi.advanceTimersByTime(10_000);
    expect(streams).toHaveLength(1);
  });

  it("retains every namespace the Data API lists for null", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        sensors: { "plugins.x.y.z": sensor(1), "spotify.track": sensor(2), "system.cpu.load": sensor(3) },
      }),
    })) as unknown as typeof fetch;
    const { store, live, prefixOf } = setup(fetchImpl);
    store.retain(null);
    await flush();
    // Before discovery: the base namespaces.
    expect(live().map(prefixOf).sort()).toEqual(["libre.", "plugins.", "system."]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/api/sensors`, { cache: "no-store" });
    expect(live().map(prefixOf).sort()).toEqual(["libre.", "plugins.", "spotify.", "system."]);
  });
  it("re-arms the grace delay on every release", async () => {
    const { store, live, prefixOf } = setup();
    const releaseA = store.retain(["a."]);
    const releaseB = store.retain(["b."]);
    store.retain(["c."]);
    await flush();
    releaseA();
    await flush();
    vi.advanceTimersByTime(1900);
    releaseB();
    await flush();
    vi.advanceTimersByTime(1000); // b. released 1 s ago: both still open
    expect(live().map(prefixOf).sort()).toEqual(["a.", "b.", "c."]);
    vi.advanceTimersByTime(1000);
    expect(live().map(prefixOf)).toEqual(["c."]);
  });

  it("uses one unfiltered stream past the budget, each message a full snapshot", async () => {
    const { store, live } = setup();
    store.retain(["a.", "b.", "c.", "d.", "e."]);
    await flush();
    expect(live().map((s) => s.url)).toEqual([`${BASE}/events`]);
    const s = live()[0];
    s.send({ timestamp: 1, sensors: { "a.x": sensor(1), "b.y": sensor(2) } });
    s.send({ timestamp: 2, sensors: { "a.x": sensor(1) } });
    expect(Object.keys(store.getValues())).toEqual(["a.x"]);
  });

  it("ignores non-object payloads", async () => {
    const { store, live } = setup();
    store.retain(["system."]);
    await flush();
    expect(() => live()[0].onmessage?.({ data: "null" } as MessageEvent<string>)).not.toThrow();
    expect(store.getValues()).toEqual({});
  });

  it("ticks on every message, even without changes", async () => {
    const { store, live } = setup();
    let ticks = 0;
    store.subscribeTick(() => ticks++);
    store.retain(["system."]);
    await flush();
    live()[0].send({ timestamp: 1, sensors: { "system.a": sensor(1) } });
    live()[0].send({ timestamp: 2, sensors: { "system.a": sensor(1) } });
    expect(ticks).toBe(2);
    expect(store.getTimestamp()).toBe(2);
  });

  it("counts as connected when nothing needs a stream", async () => {
    const { store } = setup();
    expect(store.isConnected()).toBe(true);
    store.retain([]);
    await flush();
    expect(store.isConnected()).toBe(true);
  });

  it("re-lists the sources while every sensor is wanted", async () => {
    const sources = [["system.a"], ["system.a", "hwinfo.cpu"]];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const keys = sources[Math.min(call++, 1)];
      return { ok: true, json: async () => ({ sensors: Object.fromEntries(keys.map((k) => [k, sensor(1)])) }) };
    }) as unknown as typeof fetch;
    const { store, live, prefixOf } = setup(fetchImpl);
    const release = store.retain(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(live().map(prefixOf)).not.toContain("hwinfo.");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(live().map(prefixOf)).toContain("hwinfo.");
    release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  describe("fast streams", () => {
    const AUDIO = "plugins.audio-level-meter.";
    const intervalOf = (s: FakeStream) => new URL(s.url).searchParams.get("interval");

    it("opens a dedicated stream at the fast interval, beside the slow ones", async () => {
      const { store, live, prefixOf } = setup();
      store.retain(["system.cpu."]);
      store.retainFast(AUDIO);
      await flush();
      expect(live().map((s) => `${prefixOf(s)}@${intervalOf(s)}`).sort()).toEqual([`${AUDIO}@100`, "system.@1000"]);
    });

    it("drops the slow stream of a namespace the fast one covers", async () => {
      const { store, live, prefixOf } = setup();
      store.retain([AUDIO, "plugins.media-plugin."]);
      store.retainFast(AUDIO);
      await flush();
      expect(live().map(prefixOf).sort()).toEqual([AUDIO, "plugins.media-plugin."]);
    });

    it("takes one slot of the budget, so plugin streams fold one sooner", async () => {
      const { store, live, prefixOf } = setup();
      store.retain(["plugins.a.", "plugins.b.", "system.", "libre."]);
      await flush();
      expect(live().map(prefixOf).sort()).toEqual(["libre.", "plugins.a.", "plugins.b.", "system."]);
      store.retainFast(AUDIO);
      await flush();
      await vi.advanceTimersByTimeAsync(2500);
      expect(live().map(prefixOf).sort()).toEqual(["libre.", "plugins.", AUDIO, "system."]);
    });

    it("feeds the shared map and closes after the grace delay once released", async () => {
      const { store, live } = setup();
      const release = store.retainFast(AUDIO);
      await flush();
      const fast = live()[0];
      fast.open();
      fast.send({ sensors: { [`${AUDIO}dev.audio-level`]: sensor(42) } });
      expect(store.getValues()[`${AUDIO}dev.audio-level`]?.value).toBe(42);
      release();
      await flush();
      await vi.advanceTimersByTimeAsync(2500);
      expect(live()).toHaveLength(0);
      expect(store.getValues()[`${AUDIO}dev.audio-level`]).toBeUndefined();
    });
  });
});
