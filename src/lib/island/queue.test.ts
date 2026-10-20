import { describe, expect, it } from "vitest";
import type { IslandNotice } from "./types";
import { DEFAULT_TTL, dismiss, emptyQueue, MAX_ITEMS, nextDue, notify, setGrouping, snapshotOf, tick, type QueueState } from "./queue";

/** A notice that stays as a badge after its open time (as server alerts do), unless `over` says otherwise. */
const n = (id: string, over: Partial<IslandNotice> = {}): IslandNotice => ({ source: "t", id, severity: "info", title: id, badge: true, ...over });
const open = (s: QueueState) => snapshotOf(s).expanded?.id ?? null;
const pending = (s: QueueState) => snapshotOf(s).pending.map((i) => i.id);

describe("island queue", () => {
  it("opens a notice for its time, then keeps it as a badge until it ends", () => {
    let s = notify(emptyQueue(), n("a"), 0);
    expect(open(s)).toBe("a");
    expect(nextDue(s, 1000)).toBe(DEFAULT_TTL.info - 1000);
    expect(open(tick(s, DEFAULT_TTL.info - 1))).toBe("a");
    s = tick(s, DEFAULT_TTL.info);
    expect(open(s)).toBeNull();
    expect(pending(s)).toEqual(["a"]);
    expect(pending(dismiss(s, "t", "a", 5000))).toEqual([]);
  });

  it("lets a stronger notice take over at once; the one replaced keeps its time left", () => {
    let s = notify(emptyQueue(), n("info", { ttl: 4000 }), 0);
    s = notify(s, n("crit", { severity: "critical", ttl: 2000 }), 1000);
    expect(open(s)).toBe("crit");
    s = tick(s, 3000);
    expect(open(s)).toBe("info");
    // 1 s of its 4 s was used before the critical one came.
    expect(nextDue(s, 3000)).toBe(3000);
  });

  it("makes an equal or weaker notice wait its turn", () => {
    let s = notify(emptyQueue(), n("w1", { severity: "warning", ttl: 2000 }), 0);
    s = notify(s, n("w2", { severity: "warning", ttl: 2000 }), 500);
    s = notify(s, n("i", { ttl: 2000 }), 600);
    expect(open(s)).toBe("w1");
    s = tick(s, 2000);
    expect(open(s)).toBe("w2");
    s = tick(s, 4000);
    expect(open(s)).toBe("i");
  });

  it("updates a repeated notice in place, and opens it again only when its severity rises", () => {
    let s = notify(emptyQueue(), n("a", { ttl: 2000 }), 0);
    s = tick(s, 2000);
    s = notify(s, n("a", { ttl: 2000, title: "again" }), 2500);
    expect(open(s)).toBeNull();
    expect(snapshotOf(s).pending[0].title).toBe("again");
    s = notify(s, n("a", { severity: "warning", ttl: 2000 }), 3000);
    expect(open(s)).toBe("a");
    expect(snapshotOf(s).expanded?.firstAt).toBe(0);
  });

  it(`holds at most ${MAX_ITEMS}, dropping the weakest, oldest`, () => {
    let s = notify(emptyQueue(), n("crit", { severity: "critical" }), 0);
    for (let i = 0; i < MAX_ITEMS; i++) s = notify(s, n(`i${i}`), i + 1);
    expect(s.items).toHaveLength(MAX_ITEMS);
    expect(s.items.some((i) => i.id === "i0")).toBe(false);
    expect(open(s)).toBe("crit");
  });

});

describe("grouping", () => {
  const toast = (id: string, app: string) => n(id, { source: "Notifications", group: app, title: `${app} ${id}`, badge: false });

  it("stacks a group's notices into the newest one with a count, while grouping is on", () => {
    let s = setGrouping(emptyQueue(), true);
    s = notify(s, toast("1", "Discord"), 0);
    s = notify(s, toast("2", "Discord"), 500);
    s = notify(s, toast("3", "Slack"), 600);
    const snap = snapshotOf(s);
    expect(s.items.map((i) => [i.id, i.count])).toEqual([
      ["2", 2],
      ["3", 1],
    ]);
    // The newest of the group took the open place (it reopens for its full time).
    expect(snap.expanded?.id).toBe("2");
    expect(nextDue(s, 600)).toBe(DEFAULT_TTL.info - 100);
  });

});
