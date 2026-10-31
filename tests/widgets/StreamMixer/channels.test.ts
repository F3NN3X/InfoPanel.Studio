import { describe, expect, it } from "vitest";
import type { AudioState } from "@/lib/audio-control";
import { allChannels, findChannel, iconOf, mixOf, muteAction, overridesOf, pickChannels, routeKey, volumeAction } from "@/widgets/StreamMixer/channels";

const STATE: AudioState = {
  windows: {
    available: true,
    outputs: [
      { id: "o1", name: "Speakers", volume: 30, muted: false, default: true },
      { id: "o2", name: "Headset", volume: 80, muted: false, default: false },
    ],
    inputs: [{ id: "i1", name: "Studio mic", volume: 60, muted: true, default: true }],
    apps: [{ id: "discord.exe", name: "Discord", volume: 55, muted: false, deviceId: "o2" }],
  },
  wavelink: {
    status: "up",
    channels: [
      { id: "c1", name: "Music", type: "Channel", level: 90, muted: false, mixes: [{ id: "m2", level: 10, muted: true }] },
      { id: "c2", name: "Game", type: "Channel", level: 70, muted: false, mixes: [] },
    ],
    mixes: [
      { id: "m1", name: "Monitor", level: 100, muted: false },
      { id: "m2", name: "Stream", level: 50, muted: false },
    ],
  },
};

describe("the Windows channels", () => {
  it("lists Master (the default output), Mic (the default input) and the apps, with their writes", () => {
    const rows = allChannels(STATE, "windows");
    expect(rows.map((c) => [c.id, c.name, c.sub, c.vol, c.mute])).toEqual([
      ["master", "Master", "Speakers", 30, false],
      ["mic", "Mic", "Studio mic", 60, true],
      ["app:discord.exe", "Discord", "Headset", 55, false],
    ]);
    expect(rows[0].master).toBe(true);
    expect(volumeAction(rows[2].route, 40)).toEqual({ target: "windows", op: "volume", kind: "app", id: "discord.exe", value: 40 });
    // A Windows mute is a toggle on the server, so it carries no value.
    expect(muteAction(rows[1].route, true)).toEqual({ target: "windows", op: "mute", kind: "input", id: "i1" });
  });

  it("shows nothing when there is no default device", () => {
    expect(allChannels({ ...STATE, windows: { ...STATE.windows, outputs: [], inputs: [], apps: [] } }, "windows")).toEqual([]);
  });
});

describe("the Wave Link channels", () => {
  it("follows the first mix unless one is picked, with the mix as Master", () => {
    const first = allChannels(STATE, "wavelink");
    expect(first.map((c) => c.id)).toEqual(["wlmix:m1", "wl:c1", "wl:c2"]);
    expect(mixOf(STATE, undefined)).toBe("m1");
    const stream = allChannels(STATE, "wavelink", "m2");
    // c1 has a route on the Stream mix: its level and mute are that route's.
    expect(stream.find((c) => c.id === "wl:c1")).toMatchObject({ vol: 10, mute: true, route: { t: "wl-channel", id: "c1", mix: "m2" } });
    // c2 has none: its own level, written to the channel as a whole.
    expect(stream.find((c) => c.id === "wl:c2")).toMatchObject({ vol: 70, route: { t: "wl-channel", id: "c2" } });
  });

  it("with all mixes lists the channels alone, at their own levels", () => {
    expect(mixOf(STATE, "all")).toBeUndefined();
    const rows = allChannels(STATE, "wavelink", "all");
    expect(rows.map((c) => [c.id, c.vol])).toEqual([
      ["wl:c1", 90],
      ["wl:c2", 70],
    ]);
  });

  it("builds the Wave Link writes", () => {
    const [master, music] = allChannels(STATE, "wavelink", "m2");
    expect(volumeAction(master.route, 25)).toEqual({ target: "wavelink", op: "mix", id: "m2", level: 25 });
    expect(volumeAction(music.route, 25)).toEqual({ target: "wavelink", op: "channel", id: "c1", mix: "m2", level: 25 });
    expect(muteAction(music.route, true)).toEqual({ target: "wavelink", op: "channel", id: "c1", mix: "m2", muted: false });
  });
});

describe("picking and finding", () => {
  const all = allChannels(STATE, "windows");

  it("keeps the picked order, skips what is gone, and takes all for none", () => {
    expect(pickChannels(all, ["app:discord.exe", "gone", "master"]).map((c) => c.id)).toEqual(["app:discord.exe", "master"]);
    expect(pickChannels(all, [])).toBe(all);
  });

  it("finds a channel over either backend by its id", () => {
    expect(findChannel(STATE, "mic")?.vol).toBe(60);
    expect(findChannel(STATE, "wl:c2", "all")?.name).toBe("Game");
    expect(findChannel(STATE, "app:missing.exe")).toBeUndefined();
  });

  it("swaps the icon when muted", () => {
    expect(iconOf({ icon: "mic", mute: true })).toBe("mic_off");
    expect(iconOf({ icon: "music_note", mute: true })).toBe("volume_off");
    expect(iconOf({ icon: "music_note", mute: false })).toBe("music_note");
  });

  it("keys each fader apart", () => {
    const keys = [...all, ...allChannels(STATE, "wavelink", "m2")].map((c) => routeKey(c.route));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("overridesOf", () => {
  it("reads id = text lines and skips the rest", () => {
    expect(overridesOf("app:discord.exe = Chat\n\nnonsense\n=x\nmic=Mic ")).toEqual({ "app:discord.exe": "Chat", mic: "Mic" });
    expect(overridesOf(undefined)).toEqual({});
  });
});
