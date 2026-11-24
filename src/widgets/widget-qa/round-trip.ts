/**
 * The switch round trip (`window.__qaRoundTrip(b)`): what a Look leaves behind when the page switches to another and back. A snapshot
 * holds each frame's computed colours, the custom properties set on the root, the body and each card, the `<style>` and `<link>`
 * elements in the document and the root's and body's classes and data attributes; the trip snapshots the Look worn now (a fresh load
 * of it), wears `b`, wears the first again and lists every difference from the fresh snapshot.
 */

export interface QaSnapshot {
  /** `<frame>|<element index>|<property>` to the computed value. */
  colours: Record<string, string>;
  /** `root|--x`, `body|--x`, `<frame>|card <n>|--x` to the value. */
  vars: Record<string, string>;
  /** Every `<style>` and `<link>` by its tag, data attributes and the start of its text (a pack's sheet, a font face). */
  sheets: string[];
  /** `root|class`, `root|data-x`, `body|...` to the value. */
  attrs: Record<string, string>;
}

const COLOUR_PROPS = ["color", "background-color", "border-top-color", "fill", "stroke"] as const;
/** React's generated ids (a gradient's `url(#…)`) are new on every mount: written alike, as the overflow runner writes them. */
const REACT_ID = /:r[0-9a-z]+:|_r_[0-9a-z]+_|«r[0-9a-z]+»/g;

const frameOf = (fig: Element): string =>
  fig.getAttribute("data-qa-surface") ?? `${fig.getAttribute("data-qa-module") ?? fig.getAttribute("data-qa-view-of") ?? fig.getAttribute("data-qa-layout-of")} ${fig.getAttribute("data-qa-span") ?? fig.getAttribute("data-qa-view") ?? fig.getAttribute("data-qa-layout")}`;

const customProps = (el: HTMLElement): [string, string][] => [...el.style].filter((p) => p.startsWith("--")).map((p) => [p, el.style.getPropertyValue(p).trim()]);

const attrsOf = (el: Element): [string, string][] => [["class", el.getAttribute("class") ?? ""], ...[...el.attributes].filter((a) => a.name.startsWith("data-")).map((a): [string, string] => [a.name, a.value])];

/** What the page shows now (see the module comment). */
export function qaSnapshot(): QaSnapshot {
  const colours: Record<string, string> = {};
  const vars: Record<string, string> = {};
  for (const fig of document.querySelectorAll("figure[data-qa-module], figure[data-qa-view], figure[data-qa-layout], [data-qa-surface]")) {
    const frame = frameOf(fig);
    const box = fig.querySelector("[data-qa-box]") ?? fig;
    [...box.querySelectorAll("*")].forEach((el, i) => {
      const s = getComputedStyle(el);
      for (const p of COLOUR_PROPS) colours[`${frame}|${i}|${p}`] = s.getPropertyValue(p).replace(REACT_ID, ":r:");
    });
    [...box.querySelectorAll<HTMLElement>("[data-wp-tier]")].forEach((card, n) => {
      for (const [p, v] of customProps(card)) vars[`${frame}|card ${n}|${p}`] = v;
    });
  }
  for (const [name, el] of [["root", document.documentElement], ["body", document.body]] as const) for (const [p, v] of customProps(el)) vars[`${name}|${p}`] = v;
  const sheets = [...document.querySelectorAll("style, link[rel]")].map((el) => `${el.tagName.toLowerCase()} ${attrsOf(el).filter(([a]) => a !== "class").map(([a, v]) => `${a}=${v}`).join(" ")} ${(el.textContent ?? el.getAttribute("href") ?? "").slice(0, 60)}`.trim()).sort();
  const attrs: Record<string, string> = {};
  for (const [name, el] of [["root", document.documentElement], ["body", document.body]] as const) for (const [a, v] of attrsOf(el)) attrs[`${name}|${a}`] = v;
  return { colours, vars, sheets, attrs };
}

export interface TripDiff {
  /** Frames whose computed colours differ, with how many values and the first few. */
  colours: { frame: string; changed: number; sample: string[] }[];
  /** A custom property, attribute or class that is not as the fresh load had it: `key: fresh -> after`. */
  vars: string[];
  attrs: string[];
  /** Sheets the trip added (`+`) or took away (`-`). */
  sheets: string[];
}

const keyDiff = (a: Record<string, string>, b: Record<string, string>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort().map((k) => `${k}: ${a[k] ?? "(none)"} -> ${b[k] ?? "(none)"}`);

/**
 * What `after` holds that `fresh` does not, and the other way (see `TripDiff`). `still`, a second snapshot of the fresh page taken a
 * moment later, names what moves on its own (a demo stream's value, a meter): a colour that differs between the two is left out.
 */
export function diffSnapshots(fresh: QaSnapshot, after: QaSnapshot, still: QaSnapshot = fresh): TripDiff {
  const byFrame = new Map<string, string[]>();
  for (const k of new Set([...Object.keys(fresh.colours), ...Object.keys(after.colours)])) {
    if (fresh.colours[k] === after.colours[k] || fresh.colours[k] !== still.colours[k]) continue;
    const [frame, i, prop] = k.split("|");
    byFrame.set(frame, [...(byFrame.get(frame) ?? []), `#${i} ${prop}: ${fresh.colours[k] ?? "(none)"} -> ${after.colours[k] ?? "(none)"}`]);
  }
  const count = (list: string[]) => list.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map<string, number>());
  const a = count(fresh.sheets), b = count(after.sheets);
  const sheets = [...new Set([...a.keys(), ...b.keys()])].flatMap((s) => {
    const d = (b.get(s) ?? 0) - (a.get(s) ?? 0);
    return d > 0 ? [`+ ${s}`] : d < 0 ? [`- ${s}`] : [];
  });
  return {
    colours: [...byFrame].map(([frame, list]) => ({ frame, changed: list.length, sample: list.slice(0, 4) })).sort((x, y) => y.changed - x.changed),
    vars: keyDiff(fresh.vars, after.vars),
    attrs: keyDiff(fresh.attrs, after.attrs),
    sheets,
  };
}
