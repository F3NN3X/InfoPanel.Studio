import { describe, expect, it } from "vitest";
import { dragAxis, dragSettle, swipeDirection } from "@/lib/swipe";

describe("swipeDirection", () => {
  it("is the next page for a quick swipe left, the previous for one right", () => {
    expect(swipeDirection({ dx: -80, dy: 5, ms: 200 })).toBe("next");
    expect(swipeDirection({ dx: 80, dy: 5, ms: 200 })).toBe("prev");
  });

  it("ignores a short, slow or mostly vertical move", () => {
    expect(swipeDirection({ dx: -59, dy: 0, ms: 100 })).toBeNull();
    expect(swipeDirection({ dx: -200, dy: 0, ms: 600 })).toBeNull();
    expect(swipeDirection({ dx: -80, dy: 50, ms: 100 })).toBeNull();
  });
});

describe("drag-follow", () => {
  it("decides the axis once the finger has moved far enough", () => {
    expect(dragAxis(8, 2)).toBeNull();
    expect(dragAxis(-20, 5)).toBe("x");
    expect(dragAxis(10, 20)).toBe("y");
  });

  it("settles on the neighbour past a quarter of the width, or on a flick; else springs back", () => {
    expect(dragSettle({ dx: -260, ms: 2000, width: 1000 })).toBe("next");
    expect(dragSettle({ dx: 260, ms: 2000, width: 1000 })).toBe("prev");
    expect(dragSettle({ dx: -240, ms: 2000, width: 1000 })).toBeNull();
    expect(dragSettle({ dx: -90, ms: 150, width: 1000 })).toBe("next");
  });
});
