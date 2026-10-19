/** Small geometry helpers shared by the vector gauge's shapes and parts. Degrees run clockwise from 12 o'clock. */

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const fmt = (n: number) => String(Math.round(n * 100) / 100);
export const rad = (deg: number) => (deg * Math.PI) / 180;

/** The point at `deg` on a circle. */
export const polar = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))] as const;

/** An SVG arc path from `a0` to `a1` degrees (clockwise); a full turn is two halves. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const span = a1 - a0;
  if (span <= 0) return "";
  const pt = (deg: number) => polar(cx, cy, r, deg).map(fmt).join(" ");
  if (span >= 360) {
    const mid = a0 + 180;
    return `M${pt(a0)}A${fmt(r)} ${fmt(r)} 0 1 1 ${pt(mid)}A${fmt(r)} ${fmt(r)} 0 1 1 ${pt(a0 + 359.99)}`;
  }
  return `M${pt(a0)}A${fmt(r)} ${fmt(r)} 0 ${span > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

export const circlePath = (x: number, y: number, r: number) =>
  `M${fmt(x - r)} ${fmt(y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`;

/** A rectangle with rounded corners as a path (for clipping), the radius capped at half the short side. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = clamp(r, 0, Math.min(w, h) / 2);
  if (k === 0) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`;
  const arc = (dx: number, dy: number) => `a${fmt(k)} ${fmt(k)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
  return `M${fmt(x + k)} ${fmt(y)}h${fmt(w - 2 * k)}${arc(k, k)}v${fmt(h - 2 * k)}${arc(-k, k)}h${fmt(-(w - 2 * k))}${arc(-k, -k)}v${fmt(-(h - 2 * k))}${arc(k, -k)}Z`;
}

/** A closed polygon through points. */
export const polygon = (pts: readonly (readonly [number, number])[]) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z`;

export type ContainerShape = "circle" | "rect" | "diamond" | "hexagon";

/**
 * A container shape in a box, `inset` px inside its edge: a rect fills the box (corners of `radius`); the
 * others sit centred in it at its short side (a diamond and a point-up hexagon reach its top and bottom).
 */
export function containerPath(shape: ContainerShape, box: { x: number; y: number; w: number; h: number }, inset: number, radius = 0): string {
  if (shape === "rect") return roundedRectPath(box.x + inset, box.y + inset, Math.max(1, box.w - 2 * inset), Math.max(1, box.h - 2 * inset), Math.max(0, radius - inset));
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const r = Math.max(1, Math.min(box.w, box.h) / 2 - inset);
  if (shape === "circle") return circlePath(cx, cy, r);
  const step = shape === "diamond" ? 90 : 60;
  return polygon(Array.from({ length: 360 / step }, (_, i) => polar(cx, cy, r, i * step)));
}
