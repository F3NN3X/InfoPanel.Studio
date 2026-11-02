import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startKioskPull, STREAM_SILENT_MS } from "@/lib/kiosk-config-pull";

/** A fetch the test settles by hand, in any order. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setup(fetches: Array<Promise<unknown>>) {
  const applied: unknown[] = [];
  const calls = { change: 0, settled: 0, fetch: 0 };
  const pull = startKioskPull<unknown>({
    fetchConfig: () => fetches[calls.fetch++] ?? Promise.resolve(null),
    resolve: async (p) => p,
    apply: (c) => applied.push(c),
    onChange: () => calls.change++,
    settled: () => calls.settled++,
  });
  return { pull, applied, calls };
}

describe("startKioskPull", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fetches the config itself when the stream stays silent", async () => {
    const { applied, calls } = setup([Promise.resolve({ v: 1 })]);
    expect(calls.fetch).toBe(0);
    await vi.advanceTimersByTimeAsync(STREAM_SILENT_MS);
    expect(calls.fetch).toBe(1);
    expect(applied).toEqual([{ v: 1 }]);
    expect(calls.settled).toBe(1);
  });

  it("makes no read of its own once the stream has spoken", async () => {
    const { pull, calls } = setup([Promise.resolve({ v: 1 })]);
    pull.message();
    await vi.advanceTimersByTimeAsync(STREAM_SILENT_MS * 2);
    expect(calls.fetch).toBe(1);
  });

  it("settles when the server is unreachable, so the kiosk is not left blank", async () => {
    const down = deferred<unknown>();
    const { calls, applied } = setup([down.promise]);
    await vi.advanceTimersByTimeAsync(STREAM_SILENT_MS);
    down.reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(applied).toEqual([]);
    expect(calls.settled).toBe(1);
  });

  it("lets the newest read win when a slow older one answers late", async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    const { pull, applied, calls } = setup([slow.promise, fast.promise]);
    await vi.advanceTimersByTimeAsync(STREAM_SILENT_MS); // the timer read starts and hangs
    pull.message(); // a late stream message starts a newer one
    fast.resolve({ v: 2 });
    await vi.advanceTimersByTimeAsync(0);
    slow.resolve({ v: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(applied).toEqual([{ v: 2 }]);
    expect(calls.change).toBe(0);
    expect(calls.settled).toBe(1);
  });

  it("counts a changed config as an update, but not a reconnect with the same one", async () => {
    const { pull, calls } = setup([Promise.resolve({ v: 1 }), Promise.resolve({ v: 1 }), Promise.resolve({ v: 2 })]);
    for (let i = 0; i < 3; i++) {
      pull.message();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(calls.change).toBe(1);
  });

  it("does nothing after stop, and the timer never fires", async () => {
    const { pull, calls } = setup([Promise.resolve({ v: 1 })]);
    pull.stop();
    await vi.advanceTimersByTimeAsync(STREAM_SILENT_MS * 2);
    expect(calls.fetch).toBe(0);
  });
});
