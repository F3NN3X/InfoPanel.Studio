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
