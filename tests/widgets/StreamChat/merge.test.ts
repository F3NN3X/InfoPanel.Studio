import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatState } from "@/lib/chat";
import { EMPTY_TWITCH } from "@/lib/extras";
import { canSend, mentions, mergeChat, nameHue, sendTarget } from "@/widgets/StreamChat/merge";

const msg = (id: string, ts: number, platform: ChatMessage["platform"] = "twitch"): ChatMessage => ({ id, platform, user: "u", text: id, color: "", badge: "", ts });

describe("mergeChat", () => {
  const all = [msg("t2", 20), msg("y1", 10, "youtube"), msg("t1", 10), msg("y2", 30, "youtube")];

  it("shows only the source's platform", () => {
    expect(mergeChat(all, "twitch", 60).map((m) => m.id)).toEqual(["t1", "t2"]);
    expect(mergeChat(all, "youtube", 60).map((m) => m.id)).toEqual(["y1", "y2"]);
  });

  it("merges both by time, keeping the stream's order for equal times, then keeps the newest", () => {
    expect(mergeChat(all, "both", 60).map((m) => m.id)).toEqual(["y1", "t1", "t2", "y2"]);
    expect(mergeChat(all, "both", 2).map((m) => m.id)).toEqual(["t2", "y2"]);
  });

  it("with no YouTube data shows just Twitch", () => {
    expect(mergeChat([msg("a", 1), msg("b", 2)], "both", 60).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("mentions", () => {
  it("matches @name in any case and nothing for an empty name", () => {
    expect(mentions("hey @Streamer look", "streamer")).toBe(true);
    expect(mentions("hey @streamer", "@STREAMER")).toBe(true);
    expect(mentions("hey streamer", "streamer")).toBe(false);
    expect(mentions("hey @", "")).toBe(false);
  });
});

describe("nameHue", () => {
  it("is stable per name and one of eight steps", () => {
    expect(nameHue("Alice")).toBe(nameHue("Alice"));
    expect(nameHue("Alice") % 45).toBe(0);
  });
});

describe("canSend", () => {
  const chat = (connected: boolean): ChatState => ({ messages: [], platforms: { twitch: { connected, channel: "c" } } });
  const base = { enabled: true, refused: false, target: "twitch" as const, twitch: { ...EMPTY_TWITCH, signedIn: true }, chat: chat(true) };

  it("is on only when signed in, connected, enabled and not refused", () => {
    expect(canSend(base)).toBe(true);
    expect(canSend({ ...base, enabled: false })).toBe(false);
    expect(canSend({ ...base, refused: true })).toBe(false);
    expect(canSend({ ...base, chat: chat(false) })).toBe(false);
    expect(canSend({ ...base, twitch: { ...EMPTY_TWITCH, signedIn: false } })).toBe(false);
    expect(canSend({ ...base, twitch: undefined })).toBe(false);
    expect(canSend({ ...base, target: "youtube" })).toBe(false);
  });

  it("sends to the one platform, or to the chosen one when both", () => {
    expect(sendTarget("twitch")).toBe("twitch");
    expect(sendTarget("youtube", "twitch")).toBe("youtube");
    expect(sendTarget("both")).toBe("twitch");
    expect(sendTarget("both", "youtube")).toBe("youtube");
  });
});
