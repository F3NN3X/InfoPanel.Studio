// The one tile a press-button widget draws (AudioButton, ObsButton, a Keys key): glyph and label scale with the box, a
// hairline edge says it can be pressed, and the active state is a tinted fill.
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { Icon } from "./primitives";

export interface ButtonTileProps {
  /** The widget's inner size: the glyph and the text follow the shorter side. */
  w: number;
  h: number;
  icon: string;
  name: ReactNode;
  /** The small word under the name (Live, Muted, On air); from 90px up. */
  status?: ReactNode;
  /** The state colour of the glyph and fill when `active`. */
  tint: string;
  active: boolean;
  /** A solid outline over the edge (the selected output or scene). */
  outline?: string;
  disabled?: boolean;
  corner: string;
  onPress: () => void;
  /** The accessible name; the name when it is a string. */
  label?: string;
  /** Drawn in place of the symbol `icon` names (a key's icon from the icon set, an image or text). */
  glyph?: ReactNode;
  /** The glyph's colour while not active (a key's series colour); unset = the text colour. */
  glyphColor?: string;
  /** Drawn over the tile, which is then the box it is placed in (a key's corner marks). */
  overlay?: ReactNode;
  /** Not a toggle: no pressed state is announced (a key that only acts). */
  plain?: boolean;
  /** Over the name's own size and weight, and the gap between glyph and name, px (a key's, as the `keys` fixture sets them). */
  nameStyle?: CSSProperties;
  gap?: number;
  /** Handlers in place of `onPress`'s click (a key's gestures: pointer, raw USB and keyboard). */
  handlers?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
}

const clampPx = (lo: number, v: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)));

export function ButtonTile({ w, h, icon, name, status, tint, active, outline, disabled, corner, onPress, label, glyph, glyphColor, overlay, plain, nameStyle, gap, handlers }: ButtonTileProps) {
  const side = Math.min(w, h);
  const small = side < 90;
  return (
    <button
      type="button"
      data-part="button"
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      aria-pressed={plain ? undefined : active}
      aria-label={label ?? (typeof name === "string" ? name : undefined)}
      className={`${overlay ? "relative " : ""}flex h-full w-full flex-col items-center justify-center transition active:scale-[0.97] disabled:opacity-50`}
      style={{
        gap: gap ?? clampPx(4, side * 0.03, 14),
        borderRadius: corner,
        color: active ? tint : "var(--w-fg)",
        background: active ? `color-mix(in oklab, ${tint} 16%, transparent)` : "color-mix(in oklab, var(--w-fg) 3%, transparent)",
        boxShadow: outline ? `inset 0 0 0 2px ${outline}` : "inset 0 0 0 1px color-mix(in oklab, var(--w-faint) 70%, transparent)",
      }}
    >
      <span className="leading-none" style={{ fontSize: clampPx(26, side * 0.28, 120), ...(glyphColor && !active ? { color: glyphColor } : {}) }}>
        {glyph ?? <Icon name={icon} />}
      </span>
      <span className="max-w-full truncate px-1 font-semibold leading-tight" style={{ fontSize: clampPx(12, side * 0.07, 28), ...nameStyle }}>{name}</span>
      {!small && status && <span className="text-[color:var(--w-muted)]" style={{ fontSize: clampPx(11, side * 0.05, 18) }}>{status}</span>}
      {overlay}
    </button>
  );
}
