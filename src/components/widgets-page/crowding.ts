// Crowding on the stage (Phase B2, G19 and B11): after each render the builder measures what each block draws, at the size the stage
// shows, and warns of a block whose text is cut, that runs past the card, or that overlaps another block, by its Layers name. The
// geometry is the overflow probe's (`qa-geometry.ts`, `widget-qa/probe.ts`); unlike the probe, an ellipsis counts, since a cut name
// is what a person sees as "Brevi…". `crowding` is pure; `measureInks` reads the stage's DOM. Builder plan Phase 5: a block in a grid's
// area is measured against its area too (a text past it runs into the next one), and background layers are not content: they are left
// out, so a block over its container's background is no overlap. The free layout: a block in a box is measured against its box ("runs
// past its box"), and blocks in different boxes may overlap on purpose, so that is no finding.
import { exceeds, overlaps, type Box } from "@/widgets/qa-geometry";
import type { Cells, Recipe } from "@/widgets/recipe/types";
import { blockAt, layerName } from "./builder-model";
import type { PlainIssue } from "./plain-issues";

/** What one drawn block paints (its text's line boxes, its pictures), in the zone's px, and whether a text of it is cut. */
export interface Ink {
  /** The block's path (`"0.1"`); the same path once per Repeat item. */
  path: string;
  boxes: Box[];
  cut?: boolean;
  /** A ring or gauge too small for the value in its centre. */
  cramped?: boolean;
  /** The grid area it is drawn in (its own, or the one of the block holding it), when it is in one. */
  area?: Box;
  /** The free box it is drawn in (its own, or the one of the block holding it): that block's path and the box's rect. */
  free?: { path: string; box: Box };
}

/** One crowding finding: `with` is the other block an overlap is with (the same path: the next Repeat item's). */
export interface Crowd {
  path: string;
  kind: "cut" | "cramped" | "past" | "past-area" | "past-box" | "overlaps";
  with?: string;
}

/** Less than this many px² of overlap, or 1 px past the card, is anti-aliasing, not crowding. */
const AREA_TOL = 4;
const EDGE_TOL = 1;

/** The findings for one render, each once, in the order of the blocks' paths. */
export function crowding(inks: readonly Ink[], card: Box): Crowd[] {
  const out = new Map<string, Crowd>();
  const put = (c: Crowd) => out.set(`${c.path} ${c.kind} ${c.with ?? ""}`, c);
  for (const ink of inks) {
    if (ink.cut) put({ path: ink.path, kind: "cut" });
    if (ink.cramped) put({ path: ink.path, kind: "cramped" });
    if (ink.boxes.some((b) => { const o = exceeds(b, card, EDGE_TOL); return o.dx > 0 || o.dy > 0; })) put({ path: ink.path, kind: "past" });
    else if (ink.area && ink.boxes.some((b) => { const o = exceeds(b, ink.area!, EDGE_TOL); return o.dx > 0 || o.dy > 0; })) put({ path: ink.path, kind: "past-area" });
    else if (ink.free && ink.boxes.some((b) => { const o = exceeds(b, ink.free!.box, EDGE_TOL); return o.dx > 0 || o.dy > 0; })) put({ path: ink.path, kind: "past-box" });
  }
  for (let i = 0; i < inks.length; i++)
    for (let j = i + 1; j < inks.length; j++) {
      const [a, b] = [inks[i], inks[j]];
      // two free boxes may overlap: a later one is drawn over an earlier one on purpose
      if (a.free && b.free && a.free.path !== b.free.path) continue;
      if (a.boxes.some((x) => b.boxes.some((y) => overlaps(x, y, AREA_TOL) > 0))) put({ path: b.path, kind: "overlaps", with: a.path });
    }
  const order = (p: string) => p.split(".").map((k) => k.padStart(3, "0")).join(".");
  return [...out.values()].sort((x, y) => order(x.path).localeCompare(order(y.path)));
}

const pathOf = (key: string): number[] => (key ? key.split(".").map(Number) : []);

/** The findings as the problem list's warnings: "At 2×2, Values overlaps Ring", each selecting its block. */
export function crowdIssues(recipe: Recipe, cells: Cells, crowds: readonly Crowd[]): PlainIssue[] {
  const name = (key: string) => {
    const b = blockAt(recipe, pathOf(key));
    return b ? layerName(recipe, b) : "A block";
  };
  const at = `At ${cells[0]}×${cells[1]}`;
  return crowds.map((c) => ({
    text: c.kind === "cut" ? `${at}, ${name(c.path)} is cut` : c.kind === "cramped" ? `${at}, ${name(c.path)} is too small for its value` : c.kind === "past" ? `${at}, ${name(c.path)} runs past the card` : c.kind === "past-area" ? `${at}, ${name(c.path)} runs past its area` : c.kind === "past-box" ? `${at}, ${name(c.path)} runs past its box` : `${at}, ${name(c.path)} overlaps ${c.with === c.path ? "the next item's" : name(c.with!)}`,
    tab: "block",
    path: pathOf(c.path),
    warn: true,
  }));
}

/** A rect in the zone's own px (the stage scales the zone). */
const inZone = (r: DOMRect | Box, z: DOMRect, scale: number): Box => ({ left: (r.left - z.left) / scale, top: (r.top - z.top) / scale, right: (r.right - z.left) / scale, bottom: (r.bottom - z.top) / scale });
const clips = (o: string) => o === "hidden" || o === "clip";

/**
 * A text's box less its font's leading: a range's rect is the font's whole content area, taller than the line it sits on, so two lines
 * set tight (`leading-none`) would read as overlapping.
 */
const LEADING = 0.15;

/**
 * Whether a ring's centre value is too big for it: wider than most of the circle, or taller than most of its middle. `ring` is the
 * ring's box; its circle is as wide as the box's shorter side.
 */
export function cramped(text: Box, ring: Box): boolean {
  const d = Math.min(ring.right - ring.left, ring.bottom - ring.top);
  return text.right - text.left > d * 0.85 || text.bottom - text.top > d * 0.6;
}

/**
 * What each block in the stage's zone paints: its own text (each text node's line boxes, less their leading) and pictures (`svg`,
 * `img`, `canvas`; a ring's box rather than its turned drawing's, whose box is turned with it), not a block's inside it; whether an
 * element holding its text cuts it at the side (an ellipsis, a clipped box), or a ring is too small for its centre value. The card is
 * the box the blocks are laid out in, which the card's shell clips. Undefined before the recipe draws its blocks.
 */
export function measureInks(zone: HTMLElement): { inks: Ink[]; card: Box } | undefined {
  const body = zone.querySelector<HTMLElement>("[data-recipe]");
  if (!body) return undefined;
  const z = zone.getBoundingClientRect();
  const scale = z.width / zone.offsetWidth || 1;
  const own = (el: Element, block: Element) => el.closest("[data-recipe-path]") === block;
  // a background layer (and what it holds) is not content: it is drawn under the blocks on purpose
  const inks = [...zone.querySelectorAll<HTMLElement>("[data-recipe-path]")].filter((el) => !el.closest("[data-recipe-layer]")).map((block): Ink => {
    const boxes: Box[] = [];
    let cut = false;
    let tight = false;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || !n.textContent?.trim() || !own(parent, block) || parent.closest("svg")) continue;
      range.selectNodeContents(n);
      const ring = parent.closest("[data-part='ring']");
      const ringBox = ring && inZone(ring.getBoundingClientRect(), z, scale);
      // what an element between the text and its block clips away is not drawn: the box of a cut text ends at its ellipsis
      let clip: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
      for (let el: HTMLElement | null = parent; el && el !== block.parentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        const [x, y] = [clips(cs.overflowX), clips(cs.overflowY)];
        if (x && el.scrollWidth > el.clientWidth + EDGE_TOL) cut = true;
        if (!x && !y) continue;
        const r = inZone(el.getBoundingClientRect(), z, scale);
        clip = { left: x ? Math.max(clip.left, r.left) : clip.left, right: x ? Math.min(clip.right, r.right) : clip.right, top: y ? Math.max(clip.top, r.top) : clip.top, bottom: y ? Math.min(clip.bottom, r.bottom) : clip.bottom };
      }
      for (const r of range.getClientRects()) {
        if (!(r.width > 0 && r.height > 0)) continue;
        const t = inZone({ left: r.left, right: r.right, top: r.top + r.height * LEADING, bottom: r.bottom - r.height * LEADING }, z, scale);
        const text = { left: Math.max(t.left, clip.left), right: Math.min(t.right, clip.right), top: Math.max(t.top, clip.top), bottom: Math.min(t.bottom, clip.bottom) };
        if (text.right <= text.left || text.bottom <= text.top) continue;
        boxes.push(text);
        if (ringBox && cramped(text, ringBox)) tight = true;
      }
    }
    for (const el of block.querySelectorAll("svg, img, canvas")) {
      if ((el.parentElement?.closest("svg") ?? null) !== null || !own(el, block)) continue;
      const r = (el.closest("[data-part='ring']") ?? el).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) boxes.push(inZone(r, z, scale));
    }
    const area = block.closest("[data-recipe-area]");
    const free = block.closest<HTMLElement>("[data-recipe-box]");
    return {
      path: block.dataset.recipePath ?? "",
      boxes,
      cut,
      cramped: tight,
      ...(area ? { area: inZone(area.getBoundingClientRect(), z, scale) } : {}),
      ...(free ? { free: { path: free.dataset.recipePath ?? "", box: inZone(free.getBoundingClientRect(), z, scale) } } : {}),
    };
  });
  return { inks, card: inZone(body.getBoundingClientRect(), z, scale) };
}
