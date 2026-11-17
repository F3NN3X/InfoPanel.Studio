// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { gridPinTakesTouch, type PinnedGridItem } from "@/lib/pinned";
import { dragAxis, dragSettle, startsOnPinned, swipeDirection } from "@/lib/swipe";

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

describe("a press on the pinned layer", () => {
  const pin = (module: string, extra: object = {}): PinnedGridItem => ({ id: "p", at: { colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1 }, show: "all", visible: true, placement: { id: "w", module, ...extra } });
  // the kiosk's markup: PinnedGrid marks a grid pin that doesn't take touch with data-pinned-swipe
  const press = (item: PinnedGridItem | "edge") => {
    const host = document.createElement("div");
    const attrs = item === "edge" ? "" : gridPinTakesTouch(item) ? "" : "data-pinned-swipe";
    host.innerHTML = `<div data-pinned-item="p" ${attrs}><span id="in"></span></div><i id="page"></i>`;
    return { in: host.querySelector("#in"), page: host.querySelector("#page") };
  };

  it("is a page swipe on a plain grid pin, and the pin's own on one with a tap action, an interactive kind, or on the rail", () => {
    expect(startsOnPinned(press(pin("Clock")).in)).toBe(false);
    expect(startsOnPinned(press(pin("Clock", { touch: { tap: { op: "page", to: "next" } } })).in)).toBe(true);
    expect(startsOnPinned(press(pin("AudioFader")).in)).toBe(true);
    expect(startsOnPinned(press("edge").in)).toBe(true);
    expect(startsOnPinned(press(pin("Clock")).page)).toBe(false);
  });
});
