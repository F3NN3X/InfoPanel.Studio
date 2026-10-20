import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_API_BASE,
  getApiBase,
  normalizeApiBase,
  setApiBase,
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
