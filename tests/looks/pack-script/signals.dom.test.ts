// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { readSignals, round01 } from "@/looks/pack-script/signals";

// The privacy boundary: a script reads boxes, a value in hundredths, a threshold state and glyph counts, never a character, and nothing of a quiet card.

afterEach(() => {
  document.body.innerHTML = "";
});

/** happy-dom lays nothing out: each element gets the box its data-box gives. */
function boxed(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  for (const el of root.querySelectorAll<HTMLElement>("[data-box]")) {
    const [x, y, w, h] = el.dataset.box!.split(",").map(Number);
    el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON() {} }) as DOMRect;
  }
  return root;
}
const OVERLAY = { rect: { left: 0, top: 0, width: 800, height: 480 } as DOMRect, scale: 1 };

describe("round01", () => {
  it.each([
    [0.4249, 0.42],
    [0.425, 0.43],
    ["0.5", 0.5],
    [-1, 0],
    [7, 1],
    [Number.NaN, null],
    ["", null],
    [null, null],
    [undefined, null],
    ["abc", null],
  ])("%s is %s", (v, out) => expect(round01(v)).toBe(out));
});

describe("readSignals", () => {
  it("gives each card's box, the first bound value and state, and its texts as boxes and counts only", () => {
    const root = boxed(`
      <div data-part="card" data-box="10,20,200,100">
        <span data-part="label" data-box="12,22,50,10">Secret CPU</span>
        <div data-part="bar" data-fx-value="0.4271" data-fx-state="warn" data-box="0,0,1,1"></div>
        <div data-part="ring" data-fx-value="0.9" data-fx-state="crit"></div>
      </div>`);
    const { signals, quiet } = readSignals(root, OVERLAY, "full");
    expect(quiet).toEqual([]);
    expect(signals).toEqual({ level: "full", width: 800, height: 480, cards: [{ x: 10, y: 20, w: 200, h: 100, value: 0.43, state: "warn", texts: [{ x: 12, y: 22, w: 50, h: 10, n: 10 }] }] });
    expect(JSON.stringify(signals)).not.toContain("Secret");
  });

  it("sends nothing of a card that blurs a value or sits in a quiet zone: its box is erased instead", () => {
    const root = boxed(`
      <div data-part="card" data-box="0,0,100,100"><span class="blur-xs">10.0.0.1</span></div>
      <div data-fx-quiet=""><div data-part="card" data-box="100,0,100,100"><div data-fx-value="0.5"></div></div></div>
      <div data-part="card" data-box="200,0,100,100"><div data-fx-value="x" data-fx-state="bogus"></div></div>`);
    const { signals, quiet } = readSignals(root, OVERLAY, "calm");
    expect(quiet).toEqual([{ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 }]);
    expect(signals.cards).toEqual([{ x: 200, y: 0, w: 100, h: 100, value: null, state: null, texts: [] }]);
    expect(signals.level).toBe("calm");
  });

  it("measures against the overlay and its scale (the studio zooms its canvas)", () => {
    const root = boxed(`<div data-part="card" data-box="110,60,50,50"></div>`);
    const { signals } = readSignals(root, { rect: { left: 100, top: 50, width: 400, height: 240 } as DOMRect, scale: 0.5 }, "full");
    expect(signals.width).toBe(800);
    expect(signals.cards[0]).toMatchObject({ x: 20, y: 20, w: 100, h: 100 });
  });
});
