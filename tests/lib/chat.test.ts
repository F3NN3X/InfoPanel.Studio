import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatRefusal, chatSend, parseChat } from "@/lib/chat";
import { EMPTY_TWITCH, parseExtras } from "@/lib/extras";

describe("parseChat", () => {
  it("reads the messages and platforms and drops what is malformed", () => {
    const state = parseChat({
      messages: [
        { id: "a", platform: "twitch", user: "Alice", text: "hi", color: "#FF0000", badge: "mod", ts: 5 },
        { id: "b", platform: "twitch", user: "", text: "x", color: "red", badge: "wizard", ts: "now" },
        { id: "", platform: "twitch", user: "n", text: "no id" },
        { id: "c", platform: "mastodon", user: "n", text: "other platform" },
        { id: "d", platform: "youtube", user: "n" },
        "junk",
      ],
      platforms: { twitch: { connected: true, channel: "streamer" }, youtube: 5, other: {} },
    });
    expect(state.messages).toEqual([
      { id: "a", platform: "twitch", user: "Alice", text: "hi", color: "#FF0000", badge: "mod", ts: 5 },
      { id: "b", platform: "twitch", user: "?", text: "x", color: "", badge: "", ts: 0 },
    ]);
    expect(state.platforms).toEqual({ twitch: { connected: true, channel: "streamer" } });
  });

  it("is empty for anything that is not an object", () => {
    for (const raw of [null, "x", 4, [], { messages: 3 }]) expect(parseChat(raw)).toEqual({ messages: [], platforms: {} });
  });
});

describe("the Twitch status in the extras", () => {
  it("is read tolerantly and absent from a server that sends none", () => {
    expect(parseExtras({}).twitch).toBeUndefined();
    expect(parseExtras({ twitch: {} }).twitch).toEqual(EMPTY_TWITCH);
    const twitch = parseExtras({ twitch: { configured: true, signedIn: true, login: "me", channel: "me", pending: null, error: "x", connected: true, live: true, viewers: 12 } }).twitch;
    expect(twitch).toMatchObject({ signedIn: true, login: "me", error: "x", connected: true, live: true, viewers: 12 });
    expect(parseExtras({ twitch: { pending: { userCode: "AB-CD", verificationUri: "https://t/a", expiresAt: 9 } } }).twitch?.pending).toEqual({ userCode: "AB-CD", verificationUri: "https://t/a", expiresAt: 9 });
    expect(parseExtras({ twitch: { pending: { userCode: "" } } }).twitch?.pending).toBeNull();
  });
});

describe("chatSend", () => {
  const reply = (status: number) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status }));
  beforeEach(() => chatRefusal.set(false));
  afterEach(() => vi.unstubAllGlobals());

  it("posts the platform and text with the control marker", async () => {
    const fetchMock = reply(204);
    vi.stubGlobal("fetch", fetchMock);
    expect(await chatSend("twitch", "hello")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat/send");
    expect(init.headers).toMatchObject({ "X-Dashboard-Control": "1", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ platform: "twitch", text: "hello" });
  });

  it("says why a send failed: rate limit, no connection, refusal", async () => {
    vi.stubGlobal("fetch", reply(429));
    expect(await chatSend("twitch", "x")).toMatchObject({ ok: false, reason: "busy" });
    vi.stubGlobal("fetch", reply(503));
    expect(await chatSend("twitch", "x")).toMatchObject({ ok: false, reason: "offline" });
    vi.stubGlobal("fetch", reply(500));
    expect(await chatSend("twitch", "x")).toMatchObject({ ok: false, reason: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect(await chatSend("twitch", "x")).toMatchObject({ ok: false, reason: "failed" });
  });

  it("sends nothing more after the server refuses a write", async () => {
    const fetchMock = reply(403);
    vi.stubGlobal("fetch", fetchMock);
    expect(await chatSend("twitch", "x")).toMatchObject({ ok: false, reason: "refused" });
    expect(chatRefusal.get()).toBe(true);
    await chatSend("twitch", "y");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
