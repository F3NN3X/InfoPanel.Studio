// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PathPaint, writePaint } from "@/components/infopanel/Paint";
import { gradientPaint, type Paint } from "@/lib/infopanel/render/geometry";

const bounds = { left: 10, top: 20, right: 210, bottom: 120 };
const at = (type: Parameters<typeof gradientPaint>[5], angle: number): Paint => gradientPaint(bounds, "#ff0000", "#00ff00", "#0000ff", angle, type);
const markup = (paint: Paint) => renderToStaticMarkup(<svg><PathPaint id="p" d="M0 0H10V10Z" paint={paint} space={{ width: 300, height: 200 }} /></svg>);

describe("writePaint", () => {
  // The ticker writes into markup rendered at angle 0; it must end up as markup rendered at the new angle.
  it.each(["Linear", "Radial", "Diamond", "Reflected", "Sweep", "Spiral"] as const)("turns a %s gradient to what React renders at the new angle", (type) => {
    const host = document.createElement("div");
    host.innerHTML = markup(at(type, 0));
    const svg = host.firstElementChild as Element;
    const target = svg.querySelector("foreignObject > div") ?? svg.querySelector("defs");
    writePaint(target, at(type, 137));
    const expected = document.createElement("div");
    expected.innerHTML = markup(at(type, 137));
    // The DOM re-serialises a style it wrote, so compare a conic's background value, not the markup text.
    const div = (el: Element) => el.querySelector<HTMLElement>("foreignObject > div");
    if (div(host)) expect(div(host)!.style.background).toBe(div(expected)!.style.background);
    else expect(host.innerHTML).toBe(expected.innerHTML);
  });
});
