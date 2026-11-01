import { clippedContent, exceeds, overlaps, type Box } from "../qa-geometry";

export interface Issue {
  selector: string;
  kind: "exceeds" | "overlaps" | "clipped";
  dx: number;
  dy: number;
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** A short CSS-ish path (tag, first classes, nth-child) up to the zone box, to find the element by eye. */
function selectorOf(el: Element, root: Element): string {
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== root && parts.length < 4; n = n.parentElement) {
    const cls = typeof n.className === "string" ? n.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    const idx = n.parentElement ? Array.prototype.indexOf.call(n.parentElement.children, n) + 1 : 1;
    parts.unshift(`${n.tagName.toLowerCase()}${cls ? "." + cls : ""}:nth-child(${idx})`);
  }
  return parts.join(" > ");
}

/** True when an ancestor between `el` and `root` clips that axis, so poking past the box there is invisible. */
function clipped(el: Element, root: Element, axis: "x" | "y"): boolean {
  for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
    const o = getComputedStyle(n);
    if ((axis === "x" ? o.overflowX : o.overflowY) !== "visible") return true;
  }
  return false;
}

/** What overflows, overlaps or is clipped inside one zone box (`[data-qa-box]`). */
export function probeBox(root: Element): Issue[] {
  const rootBox = toBox(root.getBoundingClientRect());
  const issues: Issue[] = [];
  const leaves: { el: Element; box: Box }[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const box = toBox(rect);
    const out = exceeds(box, rootBox, 1);
    const dx = clipped(el, root, "x") ? 0 : out.dx;
    const dy = clipped(el, root, "y") ? 0 : out.dy;
    if (dx || dy) issues.push({ selector: selectorOf(el, root), kind: "exceeds", dx, dy });
    if (el.children.length === 0 && el.textContent?.trim()) leaves.push({ el, box });
    const cs = getComputedStyle(el);
    const cut = clippedContent({
      tag: el.tagName,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      lineClamp: cs.getPropertyValue("-webkit-line-clamp"),
      bleed: el.closest("[data-qa-bleed]") !== null,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    if (cut.dx || cut.dy) issues.push({ selector: selectorOf(el, root), kind: "clipped", ...cut });
  }
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const area = overlaps(leaves[i].box, leaves[j].box, 2);
      if (area) issues.push({ selector: `${selectorOf(leaves[i].el, root)}  X  ${selectorOf(leaves[j].el, root)}`, kind: "overlaps", dx: area, dy: 0 });
    }
  }
  return issues;
}

function probe(fig: Element): Issue[] {
  const root = fig.querySelector("[data-qa-box]");
  return root ? probeBox(root) : [];
}

/** Gallery figures carry `data-qa-gallery` instead, so the sweeps never see them. */
export const PROBE_SELECTOR = "figure[data-qa-module]";

export function overflowReport(): { module: string; span: string; issues: Issue[] }[] {
  return [...document.querySelectorAll(PROBE_SELECTOR)].map((fig) => ({
    module: fig.getAttribute("data-qa-module")!,
    span: fig.getAttribute("data-qa-span")!,
    issues: probe(fig),
  }));
}
