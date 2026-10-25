// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { surfaceOf } from "../../../../src/lib/infopanel/native/convert-view.ts";

/** A zone holding a widget root (`data-wp-tier`) drawn with `style`. */
function zone(style: string): HTMLElement {
  const el = document.createElement("div");
  const root = document.createElement("div");
  root.dataset.wpTier = "md";
  root.setAttribute("style", style);
  el.append(root);
  document.body.append(el);
  return el;
}

describe("surfaceOf", () => {
  it("is the widget's own surface colour and corner radius, the studio zoom taken out", () => {
    expect(surfaceOf(zone("background-color: rgb(20, 20, 22); border-radius: 12px"), 2)).toEqual({ color: "#FF141416", radius: 6 });
  });

  it("is nothing for a see-through widget, so no card is drawn under its items", () => {
    expect(surfaceOf(zone("background-color: rgba(0, 0, 0, 0)"))).toBeNull();
    expect(surfaceOf(zone(""))).toBeNull();
  });
});
