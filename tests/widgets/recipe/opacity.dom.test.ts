// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { drawnStep } from "@/widgets/recipe/opacity";

// drawnStep runs after every render of a faded text, and live data re-renders the stage on every reading. Reading a card's colour adds
// a probe to the card (a style pass), so each colour value is read once: the probes per render used to outrun a slow machine's readings.

afterEach(() => {
  document.body.innerHTML = "";
});

/** A card with its fill and a faded text in it. */
function cardWith(fill: string): { card: HTMLElement; text: HTMLElement } {
  const card = document.createElement("div");
  card.dataset.part = "card";
  card.style.setProperty("--w-fill", fill);
  const text = document.createElement("span");
  text.style.color = "#f4f4f5";
  text.textContent = "Load";
  card.append(text);
  document.body.append(card);
  return { card, text };
}

describe("drawnStep", () => {
  it("reads a card's colour once, however often it draws", () => {
    const { card, text } = cardWith("#101012");
    const append = vi.spyOn(card, "append");
    const first = drawnStep(text, 40);
    for (let n = 0; n < 5; n++) expect(drawnStep(text, 40)).toBe(first);
    expect(append).toHaveBeenCalledTimes(1);
    // the probe is gone again
    expect(card.children).toHaveLength(1);
  });

  it("reads a colour it has not seen, so a Look's new fill is drawn against", () => {
    const { card, text } = cardWith("#101013");
    const append = vi.spyOn(card, "append");
    drawnStep(text, 40);
    card.style.setProperty("--w-fill", "#f4f4f6");
    drawnStep(text, 40);
    expect(append).toHaveBeenCalledTimes(2);
  });
});
