import { describe, expect, it } from "vitest";
import type { CardSignal, Signals } from "@/looks/pack-script/limits";
import { withEvents } from "@/looks/pack-script/signals";

// The event signal: what changed on a card since the read before, found by the host so a script need not poll and compare.

const card = (x: number, over: Partial<CardSignal> = {}): CardSignal => ({ x, y: 0, w: 100, h: 50, value: 0.5, state: "ok", texts: [], ...over });
const sig = (...cards: CardSignal[]): Signals => ({ level: "full", width: 800, height: 480, cards });
const events = (prev: Signals | undefined, next: Signals) => withEvents(prev, next).cards.map((c) => c.event);

describe("withEvents", () => {
  it("makes every card arrive on the first read, and a card with a new box on a later one", () => {
    expect(events(undefined, sig(card(0), card(100)))).toEqual([
      { arrived: true, value: null, state: null },
      { arrived: true, value: null, state: null },
    ]);
    expect(events(sig(card(0)), sig(card(0), card(100)))).toEqual([undefined, { arrived: true, value: null, state: null }]);
  });

  it("says which way a value moved, by at least a hundredth, and what state a card changed to", () => {
    const prev = sig(card(0), card(100), card(200), card(300, { state: null, value: null }));
    const next = sig(card(0, { value: 0.51 }), card(100, { value: 0.4 }), card(200, { state: "crit" }), card(300, { state: "warn", value: 0.2 }));
    expect(events(prev, next)).toEqual([
      { arrived: false, value: "up", state: null },
      { arrived: false, value: "down", state: null },
      { arrived: false, value: null, state: "crit" },
      { arrived: false, value: null, state: "warn" },
    ]);
  });

  it("leaves a card with nothing new without an event, and a state that went away is not one", () => {
    const prev = sig(card(0), card(100));
    expect(events(prev, sig(card(0), card(100, { state: null })))).toEqual([undefined, undefined]);
  });

  it("changes nothing else and does not touch its inputs", () => {
    const prev = sig(card(0));
    const next = sig(card(0, { value: 0.9 }));
    const out = withEvents(prev, next);
    expect(out).toMatchObject({ level: "full", width: 800, height: 480 });
    expect(next.cards[0]).not.toHaveProperty("event");
    expect(out.cards[0]).toMatchObject({ x: 0, value: 0.9, state: "ok" });
  });
});
