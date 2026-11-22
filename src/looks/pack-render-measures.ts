// The one set of render measures for a worn pack (ledger L71, L79, L94): what the browser drew, read from the page it runs in. The
// specs hand `measurePack` to `page.evaluate` for the built-in packs, the studio's render check runs it in its hidden frame on a
// user pack, so a rule added here holds for both. `measurePack` therefore names nothing outside its own body: it is sent to the
// browser as source text. Everything here is read in one task, with no await, so the demo streams cannot change the page between
// a pack's page and its twin.

import { OPACITY_FLOOR } from "./pack-css";

export interface MeasureOptions {
  /** The pack's Look id. */
  look: string;
  /** The most an overlay or an effect may show (`OVERLAY_MAX`'s rule). */
  alphaMax: number;
  /** The least effective opacity of text and marks. */
  minOpacity: number;
}

export interface GaugeInk {
  key: string;
  lit: boolean;
}

/** A text node's contrast with what is behind it; `ratio` is null where that cannot be read (an image behind it, a gradient fill of its own). */
export interface TextInk {
  key: string;
  ratio: number | null;
  text: string;
}

/** The best contrast a spark, icon, threshold, range or fader draws with: a mark may hold a faint track, so one clear stroke is what says it is there. */
export interface MarkInk {
  key: string;
  part: string;
  ratio: number | null;
}

/** The share of a text's box that the clip-paths above it keep (null: a clip that cannot be read). Only texts a clip touches are listed. */
export interface ClipInk {
  key: string;
  text: string;
  seen: number | null;
}

/** What a card's own clip-path takes: the share of the card's border box it removes, and how many of the four content-box corners it cuts (null: unreadable). */
export interface CardClipInk {
  key: string;
  place: string;
  removed: number | null;
  corners: number | null;
}

/** The lowest alpha the masks above a text leave over its box (null: a mask that cannot be read, a url() one included). Only texts under a mask are listed. */
export interface MaskInk {
  key: string;
  text: string;
  alpha: number | null;
}

export interface Measured {
  masks: MaskInk[];
  /** The texts a clip-path cuts into, and the cards that clip themselves. */
  clips: ClipInk[];
  cardClips: CardClipInk[];
  /** What hides content on this page, one line each. */
  problems: string[];
  cards: number;
  /** The rings that drew a gradient stroke. */
  gradients: number;
  gauges: GaugeInk[];
  texts: TextInk[];
  marks: MarkInk[];
  /** The opaque header and chip bars read, and what sits on one and does not read on it. */
  bars: number;
  barIssues: string[];
}

export interface Twin {
  /** The page with the pack's stylesheet on. */
  worn: Measured;
  /** The same page in the same task with `<style data-pack>` off: what the pack's tokens draw without its CSS. */
  bare: Measured;
}

/** Reads the page with the pack's stylesheet on, and off. Sent to the browser as source: see the file's head. */
export function measurePack({ look, alphaMax, minOpacity }: MeasureOptions): Twin {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const seen = new Map<string, number[]>();
  // a colour string of any syntax as [r, g, b, a]: the canvas parses color-mix and the rest
  const rgba = (c: string): number[] => {
    const known = seen.get(c);
    if (known) return known;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const read = [d[0], d[1], d[2], d[3] / 255];
    seen.set(c, read);
    return read;
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x: number[], y: number[]) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
  const over = (top: number[], under: number[], alpha = top[3]) => [0, 1, 2].map((k) => top[k] * alpha + under[k] * (1 - alpha)).concat(1);
  const alphaOf = (c: string) => (c.startsWith("rgba") ? Number(c.split(",")[3].replace(")", "")) : c === "transparent" ? 0 : 1);
  // one read of a page of hundreds of cards: each element's opacity down from its card once
  const faded = new Map<Element, number>();
  const effective = (el: Element, stopAt: Element): number => {
    if (el === stopAt.parentElement) return 1;
    const known = faded.get(el);
    if (known !== undefined) return known;
    const o = Number(getComputedStyle(el).opacity) * (el.parentElement ? effective(el.parentElement, stopAt) : 1);
    faded.set(el, o);
    return o;
  };
  // the card's face: the nearest opaque background up the tree
  const cardBg = (card: Element) => {
    for (let n: Element | null = card; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.9) return c;
    }
    return [0, 0, 0, 1];
  };
  /** The colours an element's text may sit on: its backgrounds laid over the first opaque one up the tree; a gradient that fills the box gives one per stop, an image none (undefined). Art in corners or strips (several layers, or a size of its own) is not the surface. */
  const behind = (el: Element): number[][] | undefined => {
    const layers: number[][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const image = cs.backgroundImage;
      if (image !== "none" && image.match(/(gradient|url)\(/g)?.length === 1 && cs.backgroundSize === "auto") {
        const stops = image.match(/rgba?\([^)]*\)/g);
        if (!stops || image.includes("url(")) return undefined;
        return stops.map((stop) => layers.reduceRight((under, layer) => over(layer, under), over(rgba(stop), [0, 0, 0, 1])));
      }
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0.9) return [layers.reduceRight((under, layer) => over(layer, under), over(c, [0, 0, 0, 1], 1))];
      if (c[3] > 0) layers.push(c);
    }
    return [layers.reduceRight((under, layer) => over(layer, under), [0, 0, 0, 1])];
  };

  // The shape measures (clip-path, mask-image, a pack's pseudo-elements): the computed values the browser hands back, read as geometry in
  // viewport px. What cannot be read is `null`, and every caller refuses on it: this check fails closed.
  type Inside = (x: number, y: number) => boolean;
  type Alpha = (x: number, y: number) => number;
  /** Splits a value at the commas or the white space that are not inside a function. */
  const parts = (s: string, sep: "," | " "): string[] => {
    const out: string[] = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i <= s.length; i++) {
      const ch = s[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (i === s.length || (depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch)))) {
        const piece = s.slice(from, i).trim();
        if (piece) out.push(piece);
        from = i + 1;
      }
    }
    return out;
  };
  /** A px, % or calc() of those joined by + and -, in viewport px (`ref` is what % is of, `z` the zoom of the element). */
  const length = (s: string, ref: number, z: number): number | null => {
    const inner = (/^calc\((.*)\)$/.exec(s.trim())?.[1] ?? s).replace(/\s+([+-])\s+/g, " $1").trim();
    if (!inner || /[()*/]/.test(inner)) return null;
    let sum = 0;
    for (const term of inner.split(/\s+/)) {
      const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%)?$/i.exec(term);
      if (!m || (!m[2] && Number(m[1]) !== 0)) return null;
      sum += m[2] === "%" ? (Number(m[1]) / 100) * ref : Number(m[1]) * z;
    }
    return sum;
  };
  const four = <T>(list: T[]): T[] => [list[0], list[1] ?? list[0], list[2] ?? list[0], list[3] ?? list[1] ?? list[0]];
  const zoomOf = (el: Element, rect: DOMRect) => (el instanceof HTMLElement && el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1);
  const unit = { deg: 1, rad: 180 / Math.PI, turn: 360, grad: 0.9 };
  /** A computed `clip-path` (inset with round, or polygon) against a border box: which points it keeps. */
  const shape = (value: string, box: DOMRect, z: number): Inside | null => {
    const m = /^(inset|polygon)\((.*)\)$/.exec(value.trim());
    if (!m) return null;
    const [w, h] = [box.width, box.height];
    if (m[1] === "polygon") {
      const args = parts(m[2], ",");
      const rule = /^(nonzero|evenodd)$/.exec(args[0] ?? "")?.[1];
      const ring: number[][] = [];
      for (const a of rule ? args.slice(1) : args) {
        const xy = parts(a, " ");
        const [x, y] = [length(xy[0] ?? "", w, z), length(xy[1] ?? "", h, z)];
        if (xy.length !== 2 || x === null || y === null) return null;
        ring.push([box.left + x, box.top + y]);
      }
      if (ring.length < 3) return null;
      return (x, y) => {
        let wind = 0;
        let odd = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, ay] = ring[j];
          const [bx, by] = ring[i];
          if (ay <= y !== by <= y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) {
            odd = !odd;
            wind += by > ay ? 1 : -1;
          }
        }
        return rule === "evenodd" ? odd : wind !== 0;
      };
    }
    const [edge, round] = m[2].split(/\s+round\s+/);
    const e = four(parts(edge, " "));
    if (parts(edge, " ").length > 4 || !e[0]) return null;
    const [top, right, bottom, left] = [length(e[0], h, z), length(e[1], w, z), length(e[2], h, z), length(e[3], w, z)];
    if (top === null || right === null || bottom === null || left === null) return null;
    const [x0, y0, x1, y1] = [box.left + left, box.top + top, box.left + w - right, box.top + h - bottom];
    let radii = [[0, 0], [0, 0], [0, 0], [0, 0]];
    if (round !== undefined) {
      const rr = parts(round, " ");
      if (round.includes("/") || rr.length > 4) return null;
      const [rx, ry] = [four(rr).map((v) => length(v ?? "", w, z)), four(rr).map((v) => length(v ?? "", h, z))];
      if (rx.includes(null) || ry.includes(null)) return null;
      radii = rx.map((v, i) => [Math.max(0, v as number), Math.max(0, ry[i] as number)]);
    }
    const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]];
    return (x, y) =>
      x >= x0 && x <= x1 && y >= y0 && y <= y1 &&
      corners.every(([cx, cy, sx, sy], i) => {
        const [rx, ry] = radii[i];
        const [dx, dy] = [(x - cx) * sx, (y - cy) * sy];
        return !(rx > 0 && ry > 0 && dx < rx && dy < ry) || ((rx - dx) / rx) ** 2 + ((ry - dy) / ry) ** 2 <= 1;
      });
  };
  /** The share of `rect` that every clip keeps, sampled on a grid. */
  const kept = (rect: DOMRect, clips: Inside[], cols: number, rows: number) => {
    if (!clips.length || rect.width <= 0 || rect.height <= 0) return 1;
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (clips.every((f) => f(rect.left + ((c + 0.5) / cols) * rect.width, rect.top + ((r + 0.5) / rows) * rect.height))) n++;
    return n / (cols * rows);
  };
  /** The alpha of a gradient mask layer at a point of its tile (`w` by `h`): linear and radial, repeating or not, stops of any colour syntax. */
  const gradient = (value: string, w: number, h: number, z: number): Alpha | null => {
    const m = /^(repeating-)?(linear|radial)-gradient\((.*)\)$/.exec(value.trim());
    if (!m || w <= 0 || h <= 0) return null;
    const args = parts(m[3], ",");
    const configured = m[2] === "radial" ? /^(circle|ellipse|closest-|farthest-|at\s|-?[\d.]+(px|%))/.test(args[0] ?? "") : /^(to\s|-?[\d.]+(deg|rad|turn|grad)$)/.test(args[0] ?? "");
    const config = (configured ? args.shift() : "") as string;
    let len = 0;
    let at: (u: number, v: number) => number;
    if (m[2] === "linear") {
      let [dx, dy] = [0, 1];
      const to = /^to\s+(.*)$/.exec(config);
      const turn = /^(-?[\d.]+(?:e[+-]?\d+)?)(deg|rad|turn|grad)$/.exec(config);
      if (to) {
        const sides = to[1].split(/\s+/);
        if (sides.length > 2 || sides.some((s) => !/^(top|bottom|left|right)$/.test(s))) return null;
        const [hz, vt] = [sides.includes("right") ? 1 : sides.includes("left") ? -1 : 0, sides.includes("bottom") ? 1 : sides.includes("top") ? -1 : 0];
        // a corner: the line is perpendicular to the diagonal the 50% line runs along
        [dx, dy] = hz && vt ? [(hz * h) / Math.hypot(w, h), (vt * w) / Math.hypot(w, h)] : [hz, vt];
      } else if (turn) {
        const a = ((Number(turn[1]) * unit[turn[2] as "deg"]) * Math.PI) / 180;
        [dx, dy] = [Math.sin(a), -Math.cos(a)];
      } else if (config) return null;
      len = Math.abs(w * dx) + Math.abs(h * dy);
      at = (u, v) => (u - w / 2) * dx + (v - h / 2) * dy + len / 2;
    } else {
      const [, size = "", where] = /^(.*?)\s*(?:\bat\s+(.*))?$/.exec(config.trim()) ?? [];
      const place = { left: "0%", top: "0%", right: "100%", bottom: "100%", center: "50%" };
      const pos = parts(where ?? "50% 50%", " ").map((p) => place[p as "left"] ?? p);
      const [cx, cy] = [length(pos[0] ?? "", w, z), length(pos[1] ?? "", h, z)];
      if (pos.length !== 2 || /^(top|bottom)/.test(where ?? "") || cx === null || cy === null) return null;
      const words = parts(size, " ");
      const keyword = words.find((p) => /^(closest|farthest)-(side|corner)$/.test(p)) ?? "farthest-corner";
      const explicit = words.filter((p) => !/^(circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)$/.test(p));
      const circle = words.includes("circle") || (explicit.length === 1 && !words.includes("ellipse"));
      const sides = [cx, w - cx, cy, h - cy];
      const corners = [Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)];
      const [nx, ny, fx, fy] = [Math.min(cx, w - cx), Math.min(cy, h - cy), Math.max(cx, w - cx), Math.max(cy, h - cy)];
      let [rx, ry] = [0, 0];
      if (explicit.length) {
        if (explicit.length !== (circle ? 1 : 2)) return null;
        rx = length(explicit[0], circle ? 0 : w, z) ?? 0;
        ry = circle ? rx : length(explicit[1], h, z) ?? 0;
      } else if (circle) rx = ry = keyword === "closest-side" ? Math.min(...sides) : keyword === "farthest-side" ? Math.max(...sides) : keyword === "closest-corner" ? Math.min(...corners) : Math.max(...corners);
      else [rx, ry] = keyword === "closest-side" ? [nx, ny] : keyword === "farthest-side" ? [fx, fy] : keyword === "closest-corner" ? [nx * Math.SQRT2, ny * Math.SQRT2] : [fx * Math.SQRT2, fy * Math.SQRT2];
      if (!(rx > 0 && ry > 0)) return null;
      len = rx;
      at = (u, v) => Math.hypot((u - cx) / rx, (v - cy) / ry) * rx;
    }
    const stops: { a: number; p: number | null }[] = [];
    for (const arg of args) {
      const [color, ...where] = parts(arg, " ");
      const a = CSS.supports("color", color) ? rgba(color)[3] : null;
      const ps = where.map((p) => length(p, len, z));
      if (a === null || where.length > 2 || ps.includes(null)) return null;
      if (!ps.length) stops.push({ a, p: null });
      for (const p of ps) stops.push({ a, p });
    }
    if (stops.length < 2) return null;
    if (stops[0].p === null) stops[0].p = 0;
    if (stops[stops.length - 1].p === null) stops[stops.length - 1].p = len;
    let high = -Infinity;
    for (const s of stops) if (s.p !== null) high = s.p = Math.max(s.p, high);
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].p !== null) continue;
      let j = i;
      while (stops[j].p === null) j++;
      const [from, to] = [stops[i - 1].p as number, stops[j].p as number];
      for (let k = i; k < j; k++) stops[k].p = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    }
    const [first, last] = [stops[0].p as number, stops[stops.length - 1].p as number];
    if (m[1] && last <= first) return null;
    return (u, v) => {
      let p = at(u, v);
      if (m[1]) p = first + ((((p - first) % (last - first)) + (last - first)) % (last - first));
      if (p <= first) return stops[0].a;
      for (let i = 1; i < stops.length; i++) {
        const [a, b] = [stops[i - 1], stops[i]];
        if (p < (b.p as number)) return a.a + ((b.a - a.a) * (p - (a.p as number))) / ((b.p as number) - (a.p as number));
      }
      return stops[stops.length - 1].a;
    };
  };
  /** An element's mask (one gradient layer, tiled by its mask-size, -position and -repeat): the alpha it leaves at a point. */
  const maskOf = (cs: CSSStyleDeclaration, box: DOMRect, z: number): Alpha | null => {
    const prop = (name: string) => cs.getPropertyValue(name).trim() || cs.getPropertyValue(`-webkit-${name}`).trim();
    const layers = parts(prop("mask-image"), ",");
    if (layers.length !== 1) return null;
    const [w, h] = [box.width, box.height];
    const size = parts(prop("mask-size") || "auto", " ");
    const side = (v: string | undefined, whole: number) => (v === undefined || v === "auto" || v === "cover" || v === "contain" ? whole : length(v, whole, z));
    const [tw, th] = [side(size[0], w), side(size[1] ?? size[0], h)];
    if (tw === null || th === null || tw <= 0 || th <= 0) return null;
    const pos = parts(prop("mask-position") || "0% 0%", " ");
    const [ox, oy] = [length(pos[0] ?? "", w - tw, z), length(pos[1] ?? "", h - th, z)];
    const rep = parts(prop("mask-repeat") || "repeat", " ").flatMap((r) => (r === "repeat-x" ? ["repeat", "no-repeat"] : r === "repeat-y" ? ["no-repeat", "repeat"] : [r]));
    const [rx, ry] = [rep[0], rep[1] ?? rep[0]];
    const g = gradient(layers[0], tw, th, z);
    if (!g || pos.length !== 2 || ox === null || oy === null || !/^(no-)?repeat$/.test(rx) || !/^(no-)?repeat$/.test(ry)) return null;
    const tile = (n: number, whole: number, repeat: string) => (repeat === "repeat" ? ((n % whole) + whole) % whole : n);
    return (x, y) => {
      const [u, v] = [tile(x - box.left - ox, tw, rx), tile(y - box.top - oy, th, ry)];
      return u < 0 || u >= tw || v < 0 || v >= th ? 0 : g(u, v);
    };
  };
  /** The most a pseudo-element paints: its backgrounds, borders and, when it has text, its text colour, times its opacity (a mask is ignored: conservative). */
  const pseudoPaint = (cs: CSSStyleDeclaration): number => {
    const stops = (cs.backgroundImage.match(/(?:rgba?|color|color-mix|hsla?|hwb|lab|lch|oklab|oklch)\([^()]*(?:\([^()]*\)[^()]*)*\)/g) ?? []).map((c) => rgba(c)[3]);
    const image = cs.backgroundImage === "none" ? 0 : cs.backgroundImage.includes("url(") || !stops.length ? 1 : Math.max(...stops);
    const edges = ["top", "right", "bottom", "left"].map((s) => (parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 ? rgba(cs.getPropertyValue(`border-${s}-color`))[3] : 0));
    const text = /^["'](?!["']$)|^(counter|attr)\(/.test(cs.content) ? rgba(cs.webkitTextFillColor || cs.color)[3] : 0;
    return Math.max(rgba(cs.backgroundColor)[3], image, ...edges, text, cs.borderImageSource !== "none" ? 1 : 0) * Number(cs.opacity);
  };
  /** A pseudo-element's box after its transform: [left, top, right, bottom] in viewport px, null where it cannot be placed. */
  const pseudoBox = (host: HTMLElement, cs: CSSStyleDeclaration): number[] | null => {
    if (cs.position !== "absolute") return null;
    // the box it is placed in: the nearest ancestor that is positioned (or that a transform or filter makes the block of)
    let cb: HTMLElement | null = host;
    while (cb) {
      const own = getComputedStyle(cb);
      if (own.position !== "static" || own.transform !== "none" || own.filter !== "none") break;
      cb = cb.parentElement;
    }
    const cbRect = cb?.getBoundingClientRect();
    const z = cb && cbRect ? zoomOf(cb, cbRect) : 1;
    const origin = cb && cbRect ? [cbRect.left + cb.clientLeft * z, cbRect.top + cb.clientTop * z] : [-scrollX, -scrollY];
    const n = (name: string) => parseFloat(cs.getPropertyValue(name));
    const extra = cs.boxSizing === "content-box" ? [n("padding-left") + n("padding-right") + n("border-left-width") + n("border-right-width"), n("padding-top") + n("padding-bottom") + n("border-top-width") + n("border-bottom-width")] : [0, 0];
    const [left, top, w, h] = [n("left") + n("margin-left"), n("top") + n("margin-top"), n("width") + extra[0], n("height") + extra[1]];
    // translate, rotate and scale apply before `transform`, all about the origin
    const o = parts(cs.transformOrigin, " ").map(parseFloat);
    const translate = parts(cs.getPropertyValue("translate"), " ").filter((p) => p !== "none");
    const rotate = cs.getPropertyValue("rotate").trim();
    const scale = parts(cs.getPropertyValue("scale"), " ").filter((p) => p !== "none").map(Number);
    const turn = rotate === "none" || !rotate ? ["0", "deg"] : (/^(-?[\d.]+(?:e[+-]?\d+)?)(deg|rad|turn|grad)$/.exec(rotate)?.slice(1) ?? []);
    const [tx, ty] = translate.length ? [length(translate[0], w, 1), length(translate[1] ?? "0", h, 1)] : [0, 0];
    const [sx, sy] = scale.length ? [scale[0], scale[1] ?? scale[0]] : [1, 1];
    if (![left, top, w, h, ...extra, ...o, sx, sy].every(Number.isFinite) || o.length < 2 || tx === null || ty === null || turn.length !== 2 || scale.length > 2) return null;
    const m = new DOMMatrix()
      .translateSelf(o[0], o[1])
      .translateSelf(tx, ty)
      .rotateSelf(Number(turn[0]) * unit[turn[1] as "deg"])
      .scaleSelf(sx, sy)
      .multiplySelf(new DOMMatrix(cs.transform === "none" ? undefined : cs.transform))
      .translateSelf(-o[0], -o[1]);
    const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
    const [xs, ys] = [pts.map((p) => origin[0] + (left + p.x) * z), pts.map((p) => origin[1] + (top + p.y) * z)];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };

  const read = (): Measured => {
    const problems: string[] = [];
    const clips: ClipInk[] = [];
    const cardClips: CardClipInk[] = [];
    const dimmed: MaskInk[] = [];
    // per element, the clips and masks on it and above it (null: one cannot be read); read once per page
    const clipped = new Map<Element, Inside[] | null>();
    const maskOfEl = new Map<Element, Alpha[] | null>();
    const clipsOf = (el: Element | null): Inside[] | null => {
      if (!el) return [];
      if (clipped.has(el)) return clipped.get(el) as Inside[] | null;
      const above = clipsOf(el.parentElement);
      const value = getComputedStyle(el).clipPath;
      let chain = above;
      if (value && value !== "none") {
        const rect = el.getBoundingClientRect();
        const inside = shape(value, rect, zoomOf(el, rect));
        chain = above && inside ? [...above, inside] : null;
      }
      clipped.set(el, chain);
      return chain;
    };
    const masksOf = (el: Element | null): Alpha[] | null => {
      if (!el) return [];
      if (maskOfEl.has(el)) return maskOfEl.get(el) as Alpha[] | null;
      const above = masksOf(el.parentElement);
      const cs = getComputedStyle(el);
      let chain = above;
      if ([cs.getPropertyValue("mask-image"), cs.getPropertyValue("-webkit-mask-image")].some((v) => v && v !== "none")) {
        const rect = el.getBoundingClientRect();
        const alpha = maskOf(cs, rect, zoomOf(el, rect));
        chain = above && alpha ? [...above, alpha] : null;
      }
      maskOfEl.set(el, chain);
      return chain;
    };
    /** A card's text, clips, masks and the pseudo-elements a pack adds, measured in one go so that nothing scrolls between the boxes. */
    const shapes = (card: Element, c: number, place: string) => {
      const boxes: { rect: DOMRect; words: string }[] = [];
      const face = card.getBoundingClientRect();
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let k = 0;
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent?.trim() || !t.parentElement) continue;
        const el = t.parentElement;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const words = t.textContent.trim().slice(0, 20);
        const range = document.createRange();
        range.selectNodeContents(t);
        // the part of the text that is on the card: the card clips what runs past it, so that part is not seen with or without the pack
        const whole = range.getBoundingClientRect();
        const [left, top] = [Math.max(whole.left, face.left), Math.max(whole.top, face.top)];
        const rect = new DOMRect(left, top, Math.max(0, Math.min(whole.right, face.right) - left), Math.max(0, Math.min(whole.bottom, face.bottom) - top));
        if (rect.width > 0 && rect.height > 0) boxes.push({ rect, words });
        const chain = clipsOf(el);
        const seen = chain && kept(rect, chain, 24, 8);
        if (seen !== 1) clips.push({ key: `${c}:${k}`, text: words, seen });
        const masks = masksOf(el);
        if (!masks || masks.length) {
          let low: number | null = 1;
          if (!masks) low = null;
          else if (rect.width > 0 && rect.height > 0) for (let r = 0; r < 8; r++) for (let q = 0; q < 24; q++) low = Math.min(low as number, masks.reduce((a, f) => a * f(rect.left + ((q + 0.5) / 24) * rect.width, rect.top + ((r + 0.5) / 8) * rect.height), 1));
          dimmed.push({ key: `${c}:${k}`, text: words, alpha: low });
        }
        k++;
      }
      // the card's own clip: how much of the card it takes, and whether the corners of its content stay
      const clip = getComputedStyle(card).clipPath;
      if (clip && clip !== "none") {
        const rect = card.getBoundingClientRect();
        const cs = getComputedStyle(card);
        const z = zoomOf(card, rect);
        // the shell pads a card's content inside the card (`--wp-pad`), so the content's corners sit that far in
        const shell = parseFloat(cs.getPropertyValue("--wp-pad")) || 0;
        const inset = (side: string) => (parseFloat(cs.getPropertyValue(`padding-${side}`)) + parseFloat(cs.getPropertyValue(`border-${side}-width`)) + shell) * z;
        const [l, t, r, b] = [rect.left + inset("left"), rect.top + inset("top"), rect.right - inset("right"), rect.bottom - inset("bottom")];
        const edge = shape(clip, rect, z);
        cardClips.push({ key: `${c}`, place, removed: edge ? 1 - kept(rect, [edge], 40, 40) : null, corners: edge ? [[l, t], [r, t], [r, b], [l, b]].filter(([x, y]) => !edge(x, y)).length : null });
      }
      // what the pack adds with ::before and ::after: where its box goes, and what it paints over the text
      for (const host of [card, ...card.querySelectorAll("*")]) {
        if (!(host instanceof HTMLElement)) continue;
        for (const which of ["::before", "::after"] as const) {
          const cs = getComputedStyle(host, which);
          if (cs.content === "none" || cs.content === "normal" || cs.display === "none" || cs.visibility === "hidden") continue;
          const path: string[] = [];
          for (let n: Element = host; n !== card; n = n.parentElement as Element) path.unshift(String([...(n.parentElement as Element).children].indexOf(n)));
          const name = `${which} of ${[host.tagName.toLowerCase(), host.getAttribute("data-part"), ...path].filter(Boolean).join(" ")} ${`[${place}]`}`;
          const box = pseudoBox(host, cs);
          const hostRect = host.getBoundingClientRect();
          if (!box) problems.push(`${name} cannot be placed`);
          else if (Math.max(hostRect.left - box[0], box[2] - hostRect.right, hostRect.top - box[1], box[3] - hostRect.bottom) > 1) problems.push(`${name} reaches outside its element`);
          const paint = pseudoPaint(cs);
          const over = box && boxes.find(({ rect }) => rect.left < box[2] && rect.right > box[0] && rect.top < box[3] && rect.bottom > box[1]);
          if (over && paint > alphaMax) problems.push(`${name} paints at ${paint.toFixed(2)} over text "${over.words}"`);
        }
      }
    };
    // the stage: layers and effects never take a click and the overlays stay under the cap
    for (const el of document.querySelectorAll("[data-pack-layer], [data-pack-effect]")) {
      const cs = getComputedStyle(el);
      if (cs.pointerEvents !== "none") problems.push(`${el.getAttribute("data-pack-effect") ?? "layer"} takes pointer events`);
      if (el.hasAttribute("data-pack-effect") && Number(cs.opacity) > alphaMax) problems.push(`effect ${el.getAttribute("data-pack-effect")} opacity ${cs.opacity} is over ${alphaMax}`);
      if (el.getAttribute("data-pack-layer") === "overlay" && alphaOf(cs.backgroundColor) > alphaMax) problems.push(`overlay background alpha ${cs.backgroundColor}`);
    }
    const marks: Record<string, number> = {};
    const cards = [...document.querySelectorAll("[data-wp-tier]")];
    const texts: TextInk[] = [];
    const inks: MarkInk[] = [];
    // each card's track colour, from a probe in it: all appended first and read after, so the page restyles once, not once per card
    const probes = cards.map((card) => {
      const probe = document.createElement("i");
      probe.style.background = "var(--w-track)";
      card.appendChild(probe);
      return probe;
    });
    const tracks = new Map(cards.map((card, c) => [card, getComputedStyle(probes[c]).backgroundColor]));
    for (const probe of probes) probe.remove();
    if (!cards.length) problems.push("no cards");
    else if (!cards.some((c) => c.textContent?.trim())) problems.push("no card has text");
    cards.forEach((card, c) => {
      const track = rgba(tracks.get(card) as string);
      // the frame the card is in (a widget and its span) and, below, the text in it: a problem cancels only against the same text in the twin, not the same words elsewhere
      const fig = card.closest("figure[data-qa-module]");
      const place = fig ? `${fig.getAttribute("data-qa-module")}@${fig.getAttribute("data-qa-span")}` : `card ${c}`;
      faded.clear();
      shapes(card, c, place);
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let k = 0;
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent?.trim() || !t.parentElement) continue;
        const el = t.parentElement;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const words = t.textContent.trim().slice(0, 20);
        const where = `[${place} #${k}]`;
        const gradientText = cs.webkitTextFillColor === "rgba(0, 0, 0, 0)" && cs.backgroundClip === "text" && cs.backgroundImage !== "none";
        if (alphaOf(cs.webkitTextFillColor || cs.color) === 0 && !gradientText) problems.push(`text "${words}" has a transparent fill ${where}`);
        const o = effective(el, card);
        if (o < minOpacity) problems.push(`text "${words}" is at opacity ${o.toFixed(2)} ${where}`);
        const ink = rgba(cs.webkitTextFillColor || cs.color);
        const under = gradientText ? undefined : behind(el);
        texts.push({ key: `${c}:${k++}`, ratio: under ? Math.min(...under.map((b) => ratio(over(ink, b, ink[3] * o), b))) : null, text: words });
        // what the eye meets at the text: the element, one around it or one inside it. Anything else paints over the text, whatever the colours say.
        // (A pack cannot set pointer-events, so the text skipped for it and a cover that elementsFromPoint skips are the page's own.)
        if (cs.pointerEvents !== "none") {
          const range = document.createRange();
          range.selectNodeContents(t);
          // the part of the text's box that is also its element's box
          const area = () => {
            const [x, y] = [range.getBoundingClientRect(), el.getBoundingClientRect()];
            const [left, right, top, bottom] = [Math.max(x.left, y.left), Math.min(x.right, y.right), Math.max(x.top, y.top), Math.min(x.bottom, y.bottom)];
            return right > left && bottom > top ? [left, right, top, bottom] : null;
          };
          let box = area();
          if (box && ((box[0] + box[1]) / 2 < 0 || (box[2] + box[3]) / 2 < 0 || (box[0] + box[1]) / 2 >= innerWidth || (box[2] + box[3]) / 2 >= innerHeight)) {
            el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
            box = area();
          }
          // elementsFromPoint answers nothing outside the viewport: the point is the middle of the part that is inside it
          const [left, right, top, bottom] = box ? [Math.max(box[0], 0), Math.min(box[1], innerWidth), Math.max(box[2], 0), Math.min(box[3], innerHeight)] : [0, 0, 0, 0];
          const at = right > left && bottom > top ? [(left + right) / 2, (top + bottom) / 2] : null;
          if (box && !at) problems.push(`text "${words}" is outside the page and could not be checked ${where}`);
          // down the stack from the top to the element or one related to it: the first that paints a background, at a strength that hides, is what covers it (a transparent wrapper does not)
          for (const n of at ? document.elementsFromPoint(at[0], at[1]) : []) {
            if (n === el || n.contains(el) || el.contains(n)) break;
            const ns = getComputedStyle(n);
            if (Number(ns.opacity) >= minOpacity && (rgba(ns.backgroundColor)[3] >= 0.5 || ns.backgroundImage !== "none")) {
              problems.push(`text "${words}" is covered by a ${n.tagName.toLowerCase()}${n.getAttribute("data-part") ? ` (${n.getAttribute("data-part")})` : ""} ${where}`);
              break;
            }
          }
        }
      }
      // the marks with no value of their own to test: anything they paint, read against what is behind it
      card.querySelectorAll('[data-part="spark"], [data-part="icon"], [data-part="threshold"], [data-part="range"], [data-part="fader"]').forEach((mark, m) => {
        const under = behind(mark);
        const paints = [mark, ...mark.querySelectorAll("*")].flatMap((el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") return [];
          const shape = el instanceof SVGGeometryElement;
          return [shape ? (cs.stroke !== "none" ? cs.stroke : cs.fill) : cs.backgroundColor].filter((p) => p !== "none" && !p.startsWith("url(")).map((p) => ({ ink: rgba(p), o: Number(cs.opacity) * (shape ? Number(cs.strokeOpacity) : 1) }));
        });
        const drawn = paints.filter(({ ink, o }) => ink[3] * o > 0);
        inks.push({ key: `${c}:${m}`, part: mark.getAttribute("data-part") as string, ratio: under && drawn.length ? Math.max(...drawn.flatMap(({ ink, o }) => under.map((back) => ratio(over(ink, back, ink[3] * o), back)))) : null });
      });
      // every gauge has a value mark you can see: a ring's value arc, a bar's or meter's lit cells
      for (const gauge of card.querySelectorAll('[data-part="ring"], [data-part="bar"], [data-part="meter"]')) {
        const part = gauge.getAttribute("data-part");
        if (part === "ring") {
          for (const arc of gauge.querySelectorAll("circle[data-wp-ring]")) {
            marks.ring = (marks.ring ?? 0) + 1;
            const cs = getComputedStyle(arc);
            const trackArc = arc.previousElementSibling ? getComputedStyle(arc.previousElementSibling) : null;
            // a gradient stroke (`ring-fill`): every stop of the gradient it names is drawn, and each shows against the card
            const gradient = /^url\(["']?#([^"')]+)/.exec(cs.stroke);
            if (gradient) {
              const stops = [...(arc.closest("svg")?.querySelectorAll(`#${CSS.escape(gradient[1])} stop`) ?? [])].map((stop) => getComputedStyle(stop));
              marks.gradient = (marks.gradient ?? 0) + 1;
              if (stops.length < 2) problems.push("a ring's gradient has fewer than two stops");
              for (const stop of stops) if (rgba(stop.stopColor)[3] === 0 || Number(stop.stopOpacity) < minOpacity) problems.push("a ring's gradient has a stop that is not drawn");
              else if (ratio(rgba(stop.stopColor), cardBg(card)) < 1.3) problems.push(`a ring's gradient stop ${stop.stopColor} has no contrast with the card`);
              if (!(parseFloat(cs.strokeWidth) > 0) || effective(arc, card) * Number(cs.strokeOpacity) < minOpacity) problems.push("a ring's gradient arc is not drawn");
              continue;
            }
            const [r, g, b, a] = rgba(cs.stroke);
            if (cs.stroke === "none" || a === 0) problems.push("a ring's value arc has no stroke");
            else if (!(parseFloat(cs.strokeWidth) > 0)) problems.push("a ring's value arc has no stroke width");
            else if (effective(arc, card) * Number(cs.strokeOpacity) < minOpacity) problems.push("a ring's value arc is faint");
            else if (trackArc && cs.stroke === trackArc.stroke) problems.push("a ring's value arc is drawn in its track colour");
            else if (ratio([r, g, b], cardBg(card)) < 1.3) problems.push(`a ring's value arc ${cs.stroke} has no contrast with the card`);
          }
          continue;
        }
        // the lit cells and the fill: painted descendants that are not the track colour
        const lit = [...gauge.querySelectorAll("*")].filter((n) => {
          const cs = getComputedStyle(n);
          return (rgba(cs.backgroundColor)[3] > 0 && rgba(cs.backgroundColor).join() !== track.join()) || cs.backgroundImage !== "none";
        });
        const bg = cardBg(card);
        for (const n of lit) {
          const cs = getComputedStyle(n);
          if (effective(n, card) < minOpacity || cs.visibility === "hidden") problems.push(`a ${part}'s value mark is hidden`);
          else if (cs.backgroundImage === "none" && ratio(rgba(cs.backgroundColor), bg) < 1.3) problems.push(`a ${part}'s value mark ${cs.backgroundColor} has no contrast with the card`);
        }
        marks[part as string] = (marks[part as string] ?? 0) + lit.length;
      }
    });
    // a value of 0 lights nothing, so a bar may be empty, but across the screen every gauge kind that is drawn has a value mark
    for (const part of ["ring", "bar", "meter"]) if (cards.some((c) => c.querySelector(`[data-part="${part}"]`)) && !marks[part]) problems.push(`no ${part} on the screen has a lit value mark`);

    // each Widget QA frame's gauges by place: lit means a mark that is not the card's track
    const gauges: GaugeInk[] = [];
    [...document.querySelectorAll("figure[data-qa-module]")].forEach((fig, i) => {
      const card = fig.querySelector("[data-wp-tier]");
      if (!card) return;
      fig.querySelectorAll('[data-part="ring"], [data-part="bar"], [data-part="meter"]').forEach((gauge, n) => {
        const ring = gauge.getAttribute("data-part") === "ring";
        const ink = [...gauge.querySelectorAll(ring ? "circle[data-wp-ring]" : "*")].filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || Number(cs.opacity) < 0.1) return false;
          if (ring) return cs.stroke !== "none" && rgba(cs.stroke)[3] > 0 && Number(cs.strokeOpacity) > 0.1;
          return (rgba(cs.backgroundColor)[3] > 0 && cs.backgroundColor !== tracks.get(card)) || cs.backgroundImage !== "none";
        });
        gauges.push({ key: `${i}:${fig.getAttribute("data-qa-module")}#${n}`, lit: ink.length > 0 });
      });
    });

    // what sits on a header or chip bar reads on it, 4.5:1 for text and 3:1 for icons (the P10 review's M4)
    const barIssues: string[] = [];
    let bars = 0;
    for (const bar of document.querySelectorAll(`[data-look="${look}"] [data-part="chip"], [data-look="${look}"] [data-part="tab"], [data-look="${look}"] [data-part="legend"]`)) {
      // a widget that sets its own surface (the Stream Deck's) is not wearing the pack's card, and its text colours do not follow it
      if (bar.closest("[data-wp-tier]")?.getAttribute("data-mat") !== `look-${look}`) continue;
      const bg = rgba(getComputedStyle(bar).backgroundColor);
      if (bg[3] < 0.9) continue;
      bars++;
      for (const el of [bar, ...bar.querySelectorAll("*")]) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.5) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
        const icon = el instanceof SVGElement && el.tagName.toLowerCase() === "svg";
        if (!own && !icon) continue;
        const r = ratio(rgba(cs.color), bg);
        if (r < (icon ? 3 : 4.5)) barIssues.push(`${el.outerHTML.slice(0, 200)} ${icon ? "icon" : "text"} ${cs.color} on ${getComputedStyle(bar).backgroundColor} is ${r.toFixed(2)}:1 (${bar.getAttribute("data-part")})`);
      }
    }
    // A pack that paints no bar (Neon Stripe, Swiss Mono, Holo) reads its headers on the card's own flat colour.
    if (bars === 0) {
      for (const header of document.querySelectorAll(`[data-wp-tier][data-look="${look}"][data-mat="look-${look}"] [data-part="header"]`)) {
        const card = header.closest("[data-wp-tier]") as HTMLElement;
        const face = rgba(getComputedStyle(card).getPropertyValue("--w-mat-export").trim());
        if (face[3] < 0.9) continue;
        bars++;
        const r = ratio(rgba(getComputedStyle(header).color), face);
        if (r < 4.5) barIssues.push(`header ${header.textContent?.slice(0, 20)} ${getComputedStyle(header).color} on ${getComputedStyle(card).getPropertyValue("--w-mat-export")} is ${r.toFixed(2)}:1`);
      }
    }
    return { clips, cardClips, masks: dimmed, problems, cards: cards.length, gradients: marks.gradient ?? 0, gauges, texts, marks: inks, bars, barIssues: [...new Set(barIssues)] };
  };

  const worn = read();
  const sheets = [...document.querySelectorAll<HTMLStyleElement>("style[data-pack]")];
  for (const sheet of sheets) (sheet as HTMLStyleElement & { disabled: boolean }).disabled = true;
  const bare = read();
  for (const sheet of sheets) (sheet as HTMLStyleElement & { disabled: boolean }).disabled = false;
  return { worn, bare };
}

/** Text this far under its card is not read (the validator's `HIDDEN_TEXT_MIN`). */
export const READABLE_MIN = 3;
/** A mark this close to what is behind it is not seen (the bar a value mark is held to). */
export const MARK_MIN = 1.3;
/** A text keeps at least this share of its box under the clip-paths above it, of what it kept without the pack. */
export const CLIP_SEEN_MIN = 0.9;
/** A card's clip-path removes at most this share of its border box. */
export const CARD_CLIP_MAX = 0.1;

/** The gauges `ref` lights and `now` does not. */
export function unlit(ref: readonly GaugeInk[], now: readonly GaugeInk[]): string[] {
  const at = new Map(now.map((g) => [g.key, g.lit]));
  return ref.filter((g) => g.lit && at.get(g.key) !== true).map((g) => g.key);
}

/** What a pack's CSS hides or makes unreadable: what its page shows that the same page without the CSS does not, one line each. The tokens were held to contrast by the validator, so only what the stylesheet changed is the stylesheet's. */
export function renderRefusals({ worn, bare }: Twin): string[] {
  const out: string[] = [];
  if (worn.cards === 0 || bare.cards === 0) out.push("no widget was drawn, so nothing could be checked");
  if (worn.texts.length === 0 || worn.texts.length !== bare.texts.length) out.push("the text of the widgets could not be read");
  const mine = (list: readonly string[], ref: readonly string[]) => [...new Set(list)].filter((p) => !ref.includes(p));
  out.push(...mine(worn.problems, bare.problems), ...mine(worn.barIssues, bare.barIssues));
  const hidden = unlit(bare.gauges, worn.gauges);
  if (hidden.length) out.push(`${hidden.length} gauge${hidden.length === 1 ? " is" : "s are"} no longer lit (${hidden[0]})`);
  const seenBare = new Map(bare.clips.map((t) => [t.key, t.seen]));
  const cut = worn.clips.filter((t) => {
    const was = seenBare.has(t.key) ? seenBare.get(t.key) : 1;
    return t.seen === null ? was !== null : was !== null && was !== undefined && t.seen < CLIP_SEEN_MIN * was;
  });
  if (cut.length) out.push(`${cut.length} text${cut.length === 1 ? " is" : "s are"} cut by a clip-path ("${cut[0].text}" keeps ${cut[0].seen === null ? "an unreadable share" : `${Math.round(cut[0].seen * 100)}%`} of its box)`);
  const alphaBare = new Map(bare.masks.map((t) => [t.key, t.alpha]));
  const dim = worn.masks.filter((t) => {
    const was = alphaBare.has(t.key) ? alphaBare.get(t.key) : 1;
    return t.alpha === null ? was !== null : was !== null && was !== undefined && t.alpha < OPACITY_FLOOR && t.alpha < was;
  });
  if (dim.length) out.push(`${dim.length} text${dim.length === 1 ? " is" : "s are"} under a mask that leaves less than ${OPACITY_FLOOR} of ${dim.length === 1 ? "it" : "them"} ("${dim[0].text}" is ${dim[0].alpha === null ? "under one that cannot be read" : `at ${dim[0].alpha.toFixed(2)}`})`);
  const cardBare = new Map(bare.cardClips.map((k) => [k.key, k]));
  for (const k of worn.cardClips) {
    const was = cardBare.get(k.key);
    if (k.removed === null || k.corners === null) {
      if (was?.removed !== null || was?.corners !== null) out.push(`the clip-path of a card cannot be read [${k.place}]`);
    } else if (k.removed > CARD_CLIP_MAX && k.removed > (was?.removed ?? 0)) out.push(`a clip-path removes ${Math.round(k.removed * 100)}% of a card, over ${CARD_CLIP_MAX * 100}% [${k.place}]`);
    else if (k.corners > (was?.corners ?? 0)) out.push(`a clip-path cuts ${k.corners} of the corners of a card's content [${k.place}]`);
  }
  const before = new Map(bare.texts.map((t) => [t.key, t.ratio]));
  const faint = worn.texts.filter((t) => {
    const was = before.get(t.key);
    return t.ratio !== null && t.ratio < READABLE_MIN && (was === null || was === undefined || t.ratio < was);
  });
  if (faint.length) out.push(`${faint.length} text${faint.length === 1 ? " is" : "s are"} under ${READABLE_MIN}:1 on what is behind ${faint.length === 1 ? "it" : "them"} ("${faint[0].text}" is ${(faint[0].ratio as number).toFixed(2)}:1)`);
  const was = new Map(bare.marks.map((m) => [m.key, m.ratio]));
  const lost = worn.marks.filter((m) => {
    const before = was.get(m.key);
    return before !== null && before !== undefined && (m.ratio === null || (m.ratio < MARK_MIN && m.ratio < before));
  });
  if (lost.length) out.push(`${lost.length} mark${lost.length === 1 ? " is" : "s are"} not seen on what is behind ${lost.length === 1 ? "it" : "them"} (a ${lost[0].part})`);
  return out;
}
