import { describe, expect, it, vi } from "vitest";
import { isSoloed, othersOf, pressSolo, type SoloMemory } from "@/widgets/mixer-solo/solo";
import type { MixChannel } from "@/widgets/stream-mixer/channels";

const ch = (id: string, mute: boolean, master = false): MixChannel => ({ id, master, name: id, sub: "", icon: "graphic_eq", vol: 50, mute, route: { t: "windows", kind: "app", id } });
const MASTER = ch("master", false, true);

/** A mixer of channels by id (a `!` marks a muted one) where a flip changes the mixer, as the server does. */
function mixer(spec: string[]) {
  const state = new Map(spec.map((s) => [s.replace("!", ""), s.startsWith("!")]));
  const list = (): MixChannel[] => [MASTER, ...[...state].map(([id, mute]) => ch(id, mute))];
  const flip = vi.fn((c: MixChannel) => void state.set(c.id, !state.get(c.id)));
  return { list, flip, muted: () => [...state].filter(([, m]) => m).map(([id]) => id) };
}

describe("which channels a solo concerns", () => {
  it("is every one but the channel and Master", () => {
    expect(othersOf([MASTER, ch("a", false), ch("b", true)], "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("is soloed only while the channel is live and every other is muted", () => {
    expect(isSoloed([MASTER, ch("a", false), ch("b", true), ch("c", true)], "a")).toBe(true);
    expect(isSoloed([MASTER, ch("a", false), ch("b", true), ch("c", false)], "a")).toBe(false);
    expect(isSoloed([MASTER, ch("a", true), ch("b", true)], "a")).toBe(false);
    expect(isSoloed([MASTER, ch("a", false)], "a")).toBe(false);
    expect(isSoloed([MASTER, ch("b", true)], "a")).toBe(false);
  });
});

describe("a tap", () => {
  it("mutes the others that are live and nothing that was muted already", () => {
    const m = mixer(["a", "b", "!c", "d"]);
    pressSolo(m.list(), "a", new Map(), "k", m.flip);
    expect(m.muted().sort()).toEqual(["b", "c", "d"]);
    expect(m.flip).toHaveBeenCalledTimes(2);
  });

  it("unmutes the channel itself when it was muted", () => {
    const m = mixer(["!a", "b"]);
    pressSolo(m.list(), "a", new Map(), "k", m.flip);
    expect(m.muted()).toEqual(["b"]);
  });

  it("never touches Master", () => {
    const m = mixer(["a", "b"]);
    pressSolo(m.list(), "a", new Map(), "k", m.flip);
    expect(m.flip.mock.calls.map(([c]) => c.id)).not.toContain("master");
  });

  it("puts back what it muted on the second tap, and leaves the channels muted before it muted", () => {
    const memory: SoloMemory = new Map();
    const m = mixer(["a", "b", "!c", "d"]);
    pressSolo(m.list(), "a", memory, "k", m.flip);
    pressSolo(m.list(), "a", memory, "k", m.flip);
    expect(m.muted()).toEqual(["c"]);
    expect(memory.has("k")).toBe(false);
  });

  it("unmutes every other channel on the second tap when it remembers none (a reload while a solo was on)", () => {
    const m = mixer(["a", "!b", "!c"]);
    pressSolo(m.list(), "a", new Map(), "k", m.flip);
    expect(m.muted()).toEqual([]);
  });

  it("keeps what each solo muted under its own key", () => {
    const memory: SoloMemory = new Map();
    const m = mixer(["a", "b", "c"]);
    pressSolo(m.list(), "a", memory, "a|", m.flip);
    expect(memory.get("a|")).toEqual(["b", "c"]);
    expect(memory.has("b|")).toBe(false);
  });

  it("does nothing for a channel that is gone", () => {
    const m = mixer(["a"]);
    pressSolo(m.list(), "zzz", new Map(), "k", m.flip);
    expect(m.flip).not.toHaveBeenCalled();
  });
});
