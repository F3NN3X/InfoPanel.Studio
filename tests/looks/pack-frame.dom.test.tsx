// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PackDecor, PageSizeCtx, frameClip, lineColour, slotsWithDecor } from "@/looks/pack-frame";
import type { PackFrame, PackOrnament } from "@/looks/pack-json";
import { userPackOf } from "@/looks/user-packs";
import type { PackSource } from "@/looks/pack-validate";

afterEach(cleanup);

const md = { width: 1024, height: 600 };
const sm = { width: 1920, height: 550 };
const view = (props: { frame?: PackFrame; ornaments?: PackOrnament[]; screen?: { width: number; height: number } }) =>
  render(<PackDecor decor={{ frame: props.frame, ornaments: props.ornaments }} screen={props.screen ?? md} />).container;

describe("the card clip of a frame", () => {
  it("cuts only the corners it names, by their own diagonal", () => {
    expect(frameClip({ corners: "cut", size: 12, which: ["tl", "br"] })).toBe("polygon(0 12px, 12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)");
  });

  it("notches a square of the given side, and takes all four corners when none are named", () => {
    const clip = frameClip({ corners: "notch", size: 8 }) as string;
    expect(clip.split(",")).toHaveLength(12);
    expect(clip).toContain("8px 8px");
  });

  it("clips nothing for a frame that only strokes, or a cut of nothing", () => {
    expect(frameClip({ corners: "square", size: 12 })).toBeUndefined();
    expect(frameClip({ corners: "bracket", size: 12 })).toBeUndefined();
    expect(frameClip({ corners: "cut", size: 0 })).toBeUndefined();
    expect(frameClip(undefined)).toBeUndefined();
  });
});

describe("ornaments on a tight card (L110 Q4)", () => {
  const ornaments: PackOrnament[] = [{ kind: "label", at: "tl", text: "SPEC" }];
  const at = (pad?: number) => render(<PackDecor decor={{ frame: { corners: "cut", size: 8 }, ornaments }} screen={md} pad={pad} />).container;

  it("draws none where the card's padding is under the ornament band, and keeps the frame", () => {
    const root = at(6);
    expect(root.querySelector("[data-ornament]")).toBeNull();
    expect(root.querySelector("[data-pack-decor=frame]")).not.toBeNull();
  });

  it("draws them where the padding is over the band (the band is 1 px in and 10 tall, so 10 px of padding would be overlapped), or when it is not known", () => {
    expect(at(10).querySelector("[data-ornament]")).toBeNull();
    cleanup();
    expect(at(11).querySelector('[data-ornament="label"]')?.textContent).toBe("SPEC");
    cleanup();
    expect(at(undefined).querySelector('[data-ornament="label"]')).not.toBeNull();
  });
});

describe("ornaments follow the page's size on the page context (L73)", () => {
  const ornaments: PackOrnament[] = [{ kind: "label", at: "tl", text: "WIDE", minSizeClass: "lg" }];
  const inPage = (page: { width: number; height: number }, screen?: { width: number; height: number }) =>
    render(
      <PageSizeCtx.Provider value={page}>
        <PackDecor decor={{ ornaments }} screen={screen} />
      </PageSizeCtx.Provider>
    ).container;

  it("hides a minSizeClass ornament on a small screen, as the kiosk at that size does", () => {
    expect(inPage(sm).querySelector("[data-ornament]")).toBeNull();
    cleanup();
    expect(view({ ornaments, screen: sm }).querySelector("[data-ornament]")).toBeNull();
  });

  it("shows it on a large screen, and an explicit screen wins over the context", () => {
    expect(inPage({ width: 3840, height: 2160 }).querySelector("[data-ornament]")).not.toBeNull();
    cleanup();
    expect(inPage(sm, { width: 3840, height: 2160 }).querySelector("[data-ornament]")).not.toBeNull();
  });
});

describe("frame shapes the kit has (spine, tab, double line, a kind per corner)", () => {
  it("clips each corner by its own kind", () => {
    expect(frameClip({ corners: "square", size: 10, byCorner: { tl: "cut", br: "notch" } })).toBe("polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)");
    // a kind of its own beats `which`
    expect(frameClip({ corners: "cut", size: 6, which: ["tl"], byCorner: { tl: "square" } })).toBeUndefined();
  });

  it("draws a spine along the named edge and a tab at the named corner, in the accent, never over the content", () => {
    const frame: PackFrame = { corners: "square", size: 0, stroke: 0, spine: { edge: "left", width: 5 }, tab: { at: "tr", width: 56, height: 5 } };
    const root = render(<PackDecor decor={{ frame }} screen={md} pad={12} />).container;
    const spine = root.querySelector("[data-frame-part=spine]") as HTMLElement;
    expect(spine.style.width).toBe("5px");
    expect(spine.style.left).toBe("0px");
    expect(spine.style.background).toContain("--w-accent");
    const tab = root.querySelector("[data-frame-part=tab]") as HTMLElement;
    expect([tab.style.width, tab.style.height, tab.style.top, tab.style.right]).toEqual(["56px", "5px", "0px", "0px"]);
    cleanup();
    // the padding is under the bar: it is left out, and so is the frame when that was all it drew
    expect(render(<PackDecor decor={{ frame }} screen={md} pad={4} />).container.querySelector("[data-pack-decor=frame]")).toBeNull();
  });

  it("keeps a tab clear of a cut corner it sits at", () => {
    const root = render(<PackDecor decor={{ frame: { corners: "cut", size: 10, which: ["tl"], stroke: 0, tab: { at: "tl", width: 40, height: 4 } } }} screen={md} />).container;
    expect((root.querySelector("[data-frame-part=tab]") as HTMLElement).style.left).toBe("10px");
  });

  it("draws a second line inside the first: a second path at each corner, a second ring on a square frame", () => {
    const corners = view({ frame: { corners: "bracket", size: 10, which: ["tl"], stroke: 1, double: true } });
    expect(corners.querySelectorAll("path")).toHaveLength(2);
    cleanup();
    expect(view({ frame: { corners: "bracket", size: 10, which: ["tl"], stroke: 1 } }).querySelectorAll("path")).toHaveLength(1);
    cleanup();
    const square = view({ frame: { corners: "square", size: 0, stroke: 1, double: true } }).querySelector("[data-pack-decor=frame]") as HTMLElement;
    expect(square.children).toHaveLength(1);
    cleanup();
    // no room for the second line (two strokes and the gap): one line
    const tight = render(<PackDecor decor={{ frame: { corners: "square", size: 0, stroke: 1, double: true } }} screen={md} pad={3} />).container;
    expect((tight.querySelector("[data-pack-decor=frame]") as HTMLElement).children).toHaveLength(0);
  });

  it("lays the lines and the spine over the card at the frame's alpha, and keeps the tab solid", () => {
    const frame: PackFrame = { corners: "cut", size: 10, which: ["br"], stroke: 1, alpha: 0.55, spine: { edge: "left", width: 5 }, tab: { at: "tl", width: 56, height: 5 } };
    const root = render(<PackDecor decor={{ frame }} screen={md} pad={12} />).container;
    const mixed = "color-mix(in srgb, var(--w-accent) 55%, transparent)";
    expect(root.querySelector("path")?.getAttribute("stroke")).toBe(mixed);
    // the spine as the page gets it (happy-dom drops a color-mix() background)
    expect(renderToString(<PackDecor decor={{ frame }} screen={md} pad={12} />)).toContain(`data-frame-part="spine" style="position:absolute;background:${mixed}`);
    expect((root.querySelector("[data-frame-part=tab]") as HTMLElement).style.background).toBe("var(--w-accent)");
    cleanup();
    // unset or 1: the accent as before
    expect(view({ frame: { ...frame, alpha: 1 } }).querySelector("path")?.getAttribute("stroke")).toBe("var(--w-accent)");
    expect(lineColour({ corners: "square", size: 0 })).toBe("var(--w-accent)");
  });

  it("keeps a corner ornament clear of a spine on its side as of a cut corner", () => {
    const ornaments: PackOrnament[] = [{ kind: "reticle", at: "tl" }, { kind: "reticle", at: "br" }, { kind: "reticle", at: "tr" }];
    const root = view({ frame: { corners: "cut", size: 10, which: ["br"], stroke: 1, spine: { edge: "left", width: 6 } }, ornaments });
    const [tl, br, tr] = [...root.querySelectorAll("[data-ornament]")] as HTMLElement[];
    expect([tl.style.left, br.style.right, tr.style.right]).toEqual(["10px", "14px", "4px"]);
  });

  it("strokes the corners of a per-corner frame by their kind and leaves the others plain", () => {
    const root = view({ frame: { corners: "square", size: 10, stroke: 1, byCorner: { tl: "cut", br: "bracket" } } });
    expect(root.querySelectorAll("svg")).toHaveLength(2);
  });
});

describe("the frame the app draws", () => {
  it("is a click-through layer marked as the app's, with a stroke in the Look's accent at each named corner", () => {
    const root = view({ frame: { corners: "bracket", size: 10, which: ["tl", "bl"], stroke: 2 } });
    const layer = root.querySelector("[data-pack-decor=frame]") as HTMLElement;
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    const paths = layer.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("stroke")).toBe("var(--w-accent)");
    expect(paths[0].getAttribute("stroke-width")).toBe("2");
  });

  it("draws a hairline for square corners and nothing for a stroke of 0", () => {
    expect((view({ frame: { corners: "square", size: 0 } }).querySelector("[data-pack-decor=frame]") as HTMLElement).style.boxShadow).toContain("var(--w-accent)");
    expect(view({ frame: { corners: "cut", size: 12, stroke: 0 } }).querySelector("[data-pack-decor]")).toBeNull();
  });
});

describe("the ornaments the app draws", () => {
  it("writes the text as a text node, so markup in it stays text", () => {
    const root = view({ ornaments: [{ kind: "micro-print", at: "bl", text: "<b>x</b> url(a)" }] });
    const item = root.querySelector("[data-ornament=micro-print]") as HTMLElement;
    expect(item.textContent).toBe("<b>x</b> url(a)");
    expect(item.querySelector("b")).toBeNull();
  });

  it("keeps each in a band of at most 10 px, in the muted colour for micro-print", () => {
    const root = view({ ornaments: [{ kind: "micro-print", at: "bl", text: "A" }, { kind: "ticks", at: "top" }, { kind: "reticle", at: "br" }] });
    for (const item of root.querySelectorAll<HTMLElement>("[data-ornament]")) expect(Number.parseInt(item.style.height, 10)).toBeLessThanOrEqual(10);
    expect((root.querySelector("[data-ornament=micro-print]") as HTMLElement).style.color).toBe("var(--w-muted)");
  });

  it("hides one under its size class, and draws none when all are hidden", () => {
    const ornaments: PackOrnament[] = [{ kind: "micro-print", at: "bl", text: "A", minSizeClass: "md" }, { kind: "label", at: "tr", text: "B" }];
    expect(view({ ornaments, screen: md }).querySelectorAll("[data-ornament]")).toHaveLength(2);
    expect([...view({ ornaments, screen: sm }).querySelectorAll("[data-ornament]")].map((o) => o.textContent)).toEqual(["B"]);
    cleanup();
    expect(view({ ornaments: [ornaments[0]], screen: sm }).querySelector("[data-pack-decor]")).toBeNull();
  });

  it("keeps a corner ornament clear of the cut at its corner", () => {
    const frame: PackFrame = { corners: "cut", size: 12, which: ["bl"] };
    const root = view({ frame, ornaments: [{ kind: "label", at: "bl", text: "A" }, { kind: "label", at: "tl", text: "B" }] });
    const [bl, tl] = [...root.querySelectorAll<HTMLElement>("[data-ornament]")];
    expect(bl.style.left).toBe("16px");
    expect(tl.style.left).toBe("4px");
  });
});

describe("a user pack's frame and ornaments reach the card", () => {
  const src = (extra: object): PackSource =>
    ({ pack: { id: "p", fonts: [], stage: { layers: [] }, burnIn: "static-safe", ...extra }, look: { id: "p", fonts: {}, t1: {} } }) as unknown as PackSource;

  it("copies frame and ornaments, and reads an old chamfer edge as a frame", () => {
    const frame: PackFrame = { corners: "cut", size: 8 };
    const ornaments: PackOrnament[] = [{ kind: "ticks", at: "top" }];
    const pack = userPackOf(src({ frame, ornaments }), true);
    expect([pack.frame, pack.ornaments]).toEqual([frame, ornaments]);
    expect(userPackOf(src({ edge: { kind: "chamfer", cut: 6 } }), true).frame).toEqual({ corners: "cut", size: 6, which: ["tl", "tr", "br", "bl"], stroke: 0 });
    const none = userPackOf(src({}), true);
    expect([none.frame, none.ornaments]).toEqual([undefined, undefined]);
  });

  it("goes into the widget's slots beside the others, and nothing is added without them", () => {
    const frame: PackFrame = { corners: "notch", size: 6 };
    const icons = { a: { viewBox: "0 0 1 1", d: "M0 0" } };
    expect(slotsWithDecor({ slots: { icons }, frame })).toEqual({ icons, decor: { frame, ornaments: undefined } });
    const slots = { icons };
    expect(slotsWithDecor({ slots })).toBe(slots);
    expect(slotsWithDecor(undefined)).toBeUndefined();
  });
});
