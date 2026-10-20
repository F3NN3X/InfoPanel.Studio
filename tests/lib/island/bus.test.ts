import { describe, expect, it } from "vitest";
import { createIslandBus } from "@/lib/island/bus";
import { fakeClock } from "@/lib/island/test-clock";

describe("island bus", () => {
  it("notifies listeners and collapses the open notice to a badge on its timer", () => {
    const { clock, advance, pendingTimers } = fakeClock();
    const bus = createIslandBus(clock);
    let calls = 0;
    bus.subscribe(() => calls++);
    bus.notify({ source: "t", id: "a", severity: "info", title: "A", ttl: 1000, badge: true });
    expect(bus.getSnapshot().expanded?.id).toBe("a");
    expect(calls).toBe(1);
    expect(pendingTimers()).toBe(1);
    advance(1000);
    expect(bus.getSnapshot().expanded).toBeNull();
    expect(bus.getSnapshot().pending.map((i) => i.id)).toEqual(["a"]);
    expect(pendingTimers()).toBe(0);
    bus.peek("t", "a", 500);
    expect(bus.getSnapshot().expanded?.id).toBe("a");
    advance(500);
    bus.dismiss("t", "a");
    expect(bus.getSnapshot().pending).toEqual([]);
  });

  it("drops the notices its gate refuses", () => {
    const bus = createIslandBus(fakeClock().clock);
    bus.setGate((n) => n.severity === "critical");
    bus.notify({ source: "t", id: "i", severity: "info", title: "I" });
    expect(bus.getSnapshot().expanded).toBeNull();
    bus.notify({ source: "t", id: "c", severity: "critical", title: "C" });
    expect(bus.getSnapshot().expanded?.id).toBe("c");
    bus.setGate(null);
    bus.notify({ source: "t", id: "i", severity: "info", title: "I" });
    expect(bus.getSnapshot().pending.map((i) => i.id)).toEqual(["i"]);
  });

});
