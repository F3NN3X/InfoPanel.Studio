// @vitest-environment happy-dom
// A list's rows (src/looks/motion-list.ts): the rows a card had when it mounted stay still; a new row comes in (and decodes), a moved row glides
// from its old place, a row whose words changed is lit, a reading that only ticks is not news, and a hidden page moves nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planMotion } from "@/looks/motion";
import { LIST_ROWS_MAX, watchList } from "@/looks/motion-list";

const list = planMotion({ list: { enter: "slide", decode: true, ms: 200 } }, {}, { level: "full", lite: false, reduceMotion: false })!.list!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  vi.advanceTimersByTime(1100);
});
afterEach(() => {
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** A card with a list whose rows sit 20 px apart, in order. */
function card(rows: [string, string][]) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const ul = document.createElement("ul");
  el.append(ul);
  document.body.append(el);
  const draw = (next: [string, string][]) => {
    ul.replaceChildren(
      ...next.map(([key, words]) => {
        const li = document.createElement("li");
        li.setAttribute("data-mo-key", key);
        li.innerHTML = `<span>${key}</span><span>${words}</span>`;
        return li;
      })
    );
    [...ul.children].forEach((li, i) => ((li as HTMLElement).getBoundingClientRect = () => ({ top: i * 20 }) as DOMRect));
  };
  draw(rows);
  return { el, ul, draw };
}

const row = (ul: HTMLElement, key: string) => ul.querySelector<HTMLElement>(`[data-mo-key="${key}"]`)!;
/** Lets the observer see the change and the frame run. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
  vi.advanceTimersByTime(20);
};

describe("a list's rows", () => {
  it("leaves the rows it starts with still, then brings a new row in with its text decoding", async () => {
    const c = card([["Ada", "online"]]);
    const off = watchList(c.el, list);
    expect(row(c.ul, "Ada").hasAttribute("data-mo-row-in")).toBe(false);
    c.draw([["Ada", "online"], ["Bo", "in game"]]);
    await settle();
    const bo = row(c.ul, "Bo");
    expect(bo.getAttribute("data-mo-row-in")).toBe("slide");
    expect(bo.querySelector("[data-mo-copy]")?.getAttribute("aria-hidden")).toBe("true");
    expect(bo.firstElementChild?.firstChild?.textContent).toBe("Bo");
    vi.advanceTimersByTime(1000);
    expect(bo.hasAttribute("data-mo-row-in")).toBe(false);
    expect(bo.querySelector("[data-mo-copy]")).toBeNull();
    expect(bo.textContent).toBe("Boin game");
    off();
  });

  it("glides a moved row from its old place, by its offset", async () => {
    const c = card([["Ada", "x"], ["Bo", "y"]]);
    const off = watchList(c.el, list);
    c.draw([["Bo", "y"], ["Ada", "x"]]);
    await settle();
    expect(row(c.ul, "Ada").hasAttribute("data-mo-row-move")).toBe(true);
    expect(row(c.ul, "Ada").style.getPropertyValue("--mo-dy")).toBe("-20px");
    expect(row(c.ul, "Bo").style.getPropertyValue("--mo-dy")).toBe("20px");
    vi.advanceTimersByTime(400);
    expect(row(c.ul, "Ada").style.getPropertyValue("--mo-dy")).toBe("");
    off();
  });

  it("lights a row whose words changed, not one whose reading ticked", async () => {
    const c = card([["Ada", "online 3m"], ["Bo", "cpu 12.5%"]]);
    const off = watchList(c.el, list);
    c.draw([["Ada", "in game 4m"], ["Bo", "cpu 13.1%"]]);
    await settle();
    expect(row(c.ul, "Ada").hasAttribute("data-mo-row-hi")).toBe(true);
    expect(row(c.ul, "Bo").hasAttribute("data-mo-row-hi")).toBe(false);
    off();
  });

  it("moves at most a few rows in one change, and nothing on a hidden page", async () => {
    const c = card([]);
    const off = watchList(c.el, list);
    c.draw(Array.from({ length: LIST_ROWS_MAX + 4 }, (_, i): [string, string] => [`r${i}`, "x"]));
    await settle();
    expect(c.ul.querySelectorAll("[data-mo-row-in]")).toHaveLength(LIST_ROWS_MAX);
    vi.advanceTimersByTime(2000);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    c.draw([["new", "x"]]);
    await settle();
    expect(c.ul.querySelectorAll("[data-mo-row-in]")).toHaveLength(0);
    hidden.mockRestore();
    off();
  });
});
