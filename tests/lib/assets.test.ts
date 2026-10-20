import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_LIMITS,
  acceptOf,
  AssetError,
  assetErrorMessage,
  assetIdOf,
  assetKind,
  deleteAsset,
  formatBytes,
  listAssets,
  unusedAssets,
  uploadAsset,
  uploadBytes,
} from "@/lib/assets";

const ID = `${"a".repeat(64)}.png`;

const respond = (status: number, body?: unknown) => {
  const fn = vi.fn(async (_input: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fn);
  return fn;
};

/** A File whose `size` is faked (no need to allocate hundreds of MB). */
const fileOf = (type: string, size = 10, name = "f") => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

afterEach(() => vi.unstubAllGlobals());

describe("uploadAsset", () => {
  it("posts the raw file with its type and the asset header", async () => {
    const fetch = respond(200, { id: ID, url: `/api/assets/${ID}`, type: "image/png", size: 10 });
    const file = fileOf("image/png");
    expect(await uploadAsset(file)).toEqual({ id: ID, url: `/api/assets/${ID}`, type: "image/png", size: 10 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/assets");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(file);
    expect(init?.headers).toEqual({ "X-Dashboard-Asset": "1", "Content-Type": "image/png" });
  });

  it("refuses unsupported and oversized files before sending them", async () => {
    const fetch = respond(200, {});
    await expect(uploadAsset(fileOf("image/svg+xml"))).rejects.toThrow(/Unsupported/);
    await expect(uploadAsset(fileOf(""))).rejects.toThrow(/Unsupported/);
    await expect(uploadAsset(fileOf("image/png", ASSET_LIMITS.image + 1))).rejects.toThrow(/Too large/);
    await expect(uploadAsset(fileOf("video/mp4", ASSET_LIMITS.video + 1))).rejects.toThrow(/Too large/);
    expect(fetch).not.toHaveBeenCalled();
    // A video may be bigger than the image limit.
    respond(200, { id: ID });
    await expect(uploadAsset(fileOf("video/webm", ASSET_LIMITS.image + 1))).resolves.toEqual({ id: ID });
  });

  it("types an untyped file from its extension", async () => {
    const fetch = respond(200, { id: ID });
    await uploadAsset(fileOf("", 10, "clip.WEBM"));
    await uploadAsset(fileOf("", 10, "clip.mkv"));
    expect(fetch.mock.calls.map((c) => (c[1]?.headers as Record<string, string>)["Content-Type"])).toEqual(["video/webm", "video/x-matroska"]);
    await expect(uploadAsset(fileOf("", 10, "page.html"))).rejects.toThrow(/Unsupported/);
  });

  it("refuses a file of the other kind when the field expects one", async () => {
    const fetch = respond(200, { id: ID });
    await expect(uploadAsset(fileOf("video/webm"), "image")).rejects.toThrow(/takes an image/);
    await expect(uploadAsset(fileOf("image/png"), "video")).rejects.toThrow(/takes a video/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(uploadAsset(fileOf("video/webm"), "video")).resolves.toEqual({ id: ID });
  });

  it("asks for a restart when the server predates uploads", async () => {
    respond(404);
    await expect(uploadAsset(fileOf("image/png"))).rejects.toThrow(/restart it/);
  });

  it("turns the server's refusals into messages", async () => {
    respond(413);
    await expect(uploadAsset(fileOf("image/png"))).rejects.toThrow(/Too large/);
    respond(403);
    await expect(uploadAsset(fileOf("image/png"))).rejects.toThrow(/ALLOW_REMOTE_UPLOAD/);
    respond(415);
    await expect(uploadAsset(fileOf("image/png"))).rejects.toBeInstanceOf(AssetError);
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(uploadAsset(fileOf("image/png"))).rejects.toThrow(/could not be reached/);
  });
});

describe("library requests", () => {
  it("lists assets and the unused ones", async () => {
    const fetch = respond(200, [{ id: ID }]);
    expect(await listAssets()).toEqual([{ id: ID }]);
    expect(await unusedAssets()).toEqual([{ id: ID }]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/assets", "/api/assets?unused=1"]);
  });

  it("deletes with the asset header", async () => {
    const fetch = respond(204);
    await deleteAsset(ID);
    expect(fetch).toHaveBeenCalledWith(`/api/assets/${ID}`, { method: "DELETE", headers: { "X-Dashboard-Asset": "1" } });
    respond(404);
    await expect(deleteAsset(ID)).rejects.toThrow(/no longer/);
  });
});

describe("helpers", () => {
  it("maps MIME types to kinds", () => {
    expect(assetKind("image/avif")).toBe("image");
    expect(assetKind("video/webm")).toBe("video");
    expect(assetKind("video/x-matroska")).toBe("video");
    expect(assetKind("image/svg+xml")).toBeUndefined();
  });

  it("accepts each kind's types and extensions", () => {
    expect(acceptOf("video")).toBe("video/mp4,video/webm,video/x-matroska,.mp4,.m4v,.webm,.mkv");
    expect(acceptOf("image").split(",")).toContain(".jpeg");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("has a fallback message with the status", () => {
    expect(assetErrorMessage(500)).toMatch(/500/);
  });

  it("finds the asset id in a URL", () => {
    expect(assetIdOf(`/api/assets/${ID}`)).toBe(ID);
    expect(assetIdOf(`http://127.0.0.1:3922/api/assets/${ID}`)).toBe(ID);
    expect(assetIdOf("https://example.com/a.png")).toBeUndefined();
    expect(assetIdOf(undefined)).toBeUndefined();
  });
});

describe("uploadBytes", () => {
  it("posts the bytes with their type, and asks again while the server is busy", async () => {
    const answers = [429, 429, 200];
    const fetch = vi.fn(async () => {
      const status = answers.shift()!;
      return new Response(status === 200 ? JSON.stringify({ id: ID }) : null, { status });
    });
    vi.stubGlobal("fetch", fetch);
    const waits: number[] = [];
    const out = await uploadBytes(new Uint8Array([1, 2]), "image/png", async (ms) => void waits.push(ms));
    expect(out).toEqual({ id: ID });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([250, 500]);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toEqual({ "X-Dashboard-Asset": "1", "Content-Type": "image/png" });
  });

  it("gives up on a server that stays busy, and says why for other refusals", async () => {
    respond(429);
    await expect(uploadBytes(new Uint8Array([1]), "image/png", async () => {})).rejects.toThrow(/stayed busy/);
    respond(415);
    await expect(uploadBytes(new Uint8Array([1]), "image/svg+xml", async () => {})).rejects.toThrow(/does not take this file type/);
  });

  it("runs at most two uploads at once, queueing the rest", async () => {
    let inFlight = 0;
    let most = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({ id: ID }), { status: 200 });
    }));
    const all = await Promise.all(Array.from({ length: 7 }, () => uploadBytes(new Uint8Array([1]), "image/png")));
    expect(all).toHaveLength(7);
    expect(most).toBe(2);
  });

  it("frees its slot when an upload fails", async () => {
    respond(415);
    await Promise.allSettled([1, 2, 3].map(() => uploadBytes(new Uint8Array([1]), "image/png", async () => {})));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ID }), { status: 200 })));
    await expect(uploadBytes(new Uint8Array([1]), "image/png")).resolves.toEqual({ id: ID });
  });
});
