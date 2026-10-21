import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dataApiState,
  DEFAULT_API_BASE,
  getApiBase,
  normalizeApiBase,
  pingApiBase,
  setApiBase,
  SLOW_API_MS,
  subscribeApiBase,
  testApiBase,
} from "@/lib/data-api";

describe("normalizeApiBase", () => {
  it("accepts http(s) URLs and trims trailing slashes", () => {
    expect(normalizeApiBase(" http://127.0.0.1:3921/ ")).toBe("http://127.0.0.1:3921");
    expect(normalizeApiBase("https://host/api//")).toBe("https://host/api");
  });

  it("rejects everything else", () => {
    expect(normalizeApiBase("ftp://host")).toBeNull();
    expect(normalizeApiBase("not a url")).toBeNull();
    expect(normalizeApiBase("")).toBeNull();
    expect(normalizeApiBase(undefined)).toBeNull();
    expect(normalizeApiBase(3921)).toBeNull();
  });
});

describe("setApiBase", () => {
  afterEach(() => setApiBase(undefined));

  it("notifies listeners only on a real change", () => {
    const seen: string[] = [];
    const off = subscribeApiBase((b) => seen.push(b));
    setApiBase("http://other:1/");
    setApiBase("http://other:1");
    setApiBase("garbage"); // falls back to the default
    off();
    setApiBase("http://after:2");
    expect(seen).toEqual(["http://other:1", DEFAULT_API_BASE]);
    expect(getApiBase()).toBe("http://after:2");
  });
});

describe("testApiBase", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true only when /api answers 200", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await testApiBase("http://x")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://x/api", { cache: "no-store" });

    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 503 })));
    expect(await testApiBase("http://x")).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("refused"))));
    expect(await testApiBase("http://x")).toBe(false);
  });
});

describe("Data API status", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("times a ping, and gives null when the API does not answer 200", async () => {
    let t = 0;
    const clock = () => (t += 18);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await pingApiBase("http://h", clock)).toBe(18);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await pingApiBase("http://h", clock)).toBeNull();
  });

  it("is unreachable with a stream down or a failed ping, slow past the threshold", () => {
    expect(dataApiState(true, undefined)).toBe("connected");
    expect(dataApiState(true, SLOW_API_MS)).toBe("connected");
    expect(dataApiState(true, SLOW_API_MS + 1)).toBe("slow");
    expect(dataApiState(true, null)).toBe("unreachable");
    expect(dataApiState(false, 5)).toBe("unreachable");
  });
});
