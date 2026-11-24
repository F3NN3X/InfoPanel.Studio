// More pieces the layout variants draw with (layout-parts.tsx has the hatch, section label, reading and signal graph): the kit's
// underline tabs with their counter, a tone chip, a hexagon badge with initials, the "quote" ticket slab, a feed row and a ruler row.
// Every colour is a card variable or a tone; a cyan emphasis is a `num` part, so a pack's numeral colour reaches it as it reaches a
// reading; the slabs are the component treatments' (`data-wp-slab`), in the Look's ink where it draws slabs, else the app's own.
import type { CSSProperties, ElementType, ReactNode } from "react";
import { ownSlabVars, SLAB_INFO_DEFAULT } from "@/looks/treatments";
import { Bar, Icon } from "../core/primitives";
import { STATE, useSkin } from "../core/theme";
import { Part } from "../core/treatments";

export type KitTone = "accent" | "info" | "ok" | "warn" | "crit";

/** A tone's colour on a card (the accent, else the card's status colour with the app's as the fallback). */
export const toneColor = (tone: KitTone): string =>
  tone === "accent" ? "var(--w-accent)" : tone === "info" ? `var(--wp-slab-info, ${SLAB_INFO_DEFAULT})` : `var(--w-${tone}, ${STATE[tone]})`;

/** Two letters for a name: the first of its first two words, else its first two characters. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  const text = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return text.toUpperCase() || "?";
}

/**
 * A tone slab of a layout's own: `data-wp-slab` in `tone` where the card's Look draws slabs (its ink, texture and notch), else the app's
 * own slab in the tone's colour, its ink picked to read 4.5:1 on it. `notches` cuts the kit ticket's two side notches.
 */
export function ToneSlab({ tone, as: Tag = "div", notches, className = "", style, children, ...rest }: { tone: KitTone; as?: ElementType; notches?: boolean; className?: string; style?: CSSProperties; children?: ReactNode } & Record<`data-${string}`, string | undefined>) {
  const sk = useSkin();
  const own = { "data-wp-slab": sk.slab ? tone : "accent", "data-slab-notches": notches ? "" : undefined, className, style, ...rest };
  if (sk.slab) return <Tag {...own}>{children}</Tag>;
  const color = tone === "accent" ? "var(--w-accent)" : tone === "info" ? SLAB_INFO_DEFAULT : STATE[tone];
  return (
    <span className="contents" style={ownSlabVars(color) as CSSProperties}>
      <Tag {...own} style={{ "--wp-slab-cut": "6px", ...style } as CSSProperties}>
        {children}
      </Tag>
    </span>
  );
}

/** The kit's badge: a solid tone slab with a square lamp where the Look draws slabs, else an outline in the tone. */
export function ToneChip({ tone, children, lamp = true }: { tone: KitTone; children: ReactNode; lamp?: boolean }) {
  const sk = useSkin();
  const body = (
    <>
      {lamp && <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-current" />}
      {children}
    </>
  );
  const cls = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 py-px text-micro font-semibold uppercase leading-tight tracking-[0.08em]";
  if (sk.slab)
    return (
      <span data-part="chip" data-wp-slab={tone} className={cls}>
        {body}
      </span>
    );
  return (
    <span data-part="chip" className={cls} style={{ color: toneColor(tone), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${toneColor(tone)} 60%, transparent)` }}>
      {body}
    </span>
  );
}

/**
 * The kit's underline tabs: upper-case, the active one in the numbers' colour over a 2 px bar, the rest in the accent, a rule under the row
 * and a `01 / 03` counter at its end. Buttons when `onPick` is given (a layout's own filter), else labels.
 */
export function KitTabs({ tabs, active, onPick, count = true }: { tabs: readonly { id: string; label: string }[]; active: string; onPick?: (id: string) => void; count?: boolean }) {
  const at = Math.max(0, tabs.findIndex((t) => t.id === active));
  const Tag = onPick ? "button" : "span";
  return (
    <div role={onPick ? "tablist" : undefined} className="flex min-w-0 items-end gap-3 border-b border-[color:color-mix(in_srgb,var(--w-accent)_40%,transparent)]">
      {tabs.map((t, i) => (
        <Tag
          key={t.id}
          {...(onPick ? { type: "button", role: "tab", "aria-selected": i === at, onClick: () => onPick(t.id) } : null)}
          data-part="tab"
          data-active={i === at ? "" : undefined}
          className="relative min-w-0 truncate pb-1 text-caption font-semibold uppercase leading-none tracking-[0.08em] text-[color:var(--w-accent)]"
        >
          {i === at ? <span data-part="num">{t.label}</span> : t.label}
          {i === at && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-current" style={{ color: "inherit", boxShadow: "0 0 6px currentColor" }} />}
        </Tag>
      ))}
      {count && (
        <span data-part="mono" className="ml-auto shrink-0 pb-1 text-micro leading-none tracking-[0.06em] text-[color:var(--w-muted)]">
          {`${String(at + 1).padStart(2, "0")} / ${String(tabs.length).padStart(2, "0")}`}
        </span>
      )}
    </div>
  );
}

/** A hexagon badge with initials (the kit's crew avatar): the tone's tint inside a 1 px hexagon with a second line inside it. */
export function HexBadge({ text, color = "var(--w-accent)", size }: { text: string; color?: string; size: number }) {
  return (
    <span data-part="avatar" data-avatar="hex" className="relative flex shrink-0 items-center justify-center font-bold leading-none" style={{ width: size, height: size * 1.1, color, fontSize: Math.max(11, size * 0.36) }}>
      <svg aria-hidden viewBox="0 0 20 22" className="absolute inset-0 h-full w-full overflow-visible">
        <path d="M10 0.5 19.5 5.75V16.25L10 21.5 0.5 16.25V5.75Z" fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d="M10 3 17.3 7V15L10 19 2.7 15V7Z" fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="relative">{text}</span>
    </span>
  );
}

/**
 * The kit's "quote" ticket: a solid slab in `tone` (yellow by default) with its scan lines and side notches. A head line (icon, title, a tag at
 * the right), a dashed rule, then the detail lines at the left and the value large at the right, all in the slab's ink.
 */
export function QuoteSlab({ tone = "warn", icon, title, tag, lines, value, unit, px, ip }: { tone?: KitTone; icon?: string; title: string; tag?: string; lines: readonly string[]; value: ReactNode; unit?: string; px: number; ip?: Record<string, string | number> }) {
  return (
    <ToneSlab tone={tone} notches data-layout-part="quote" className="flex min-w-0 shrink-0 flex-col gap-1.5 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-caption font-semibold leading-tight">
        {icon && <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{title}</span>
        {tag && <span className="ml-auto shrink-0 text-micro uppercase tracking-[0.08em]">{tag}</span>}
      </div>
      <div aria-hidden className="h-px w-full border-t border-dashed border-current opacity-50" />
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col text-caption leading-tight">
          {lines.map((l, i) => (
            <span key={i} className={`truncate ${i === 0 ? "font-semibold" : ""}`}>
              {l}
            </span>
          ))}
        </div>
        <span data-part="num" {...ip} className="shrink-0 whitespace-nowrap font-bold leading-none tabular-nums" style={{ fontSize: px }}>
          {value}
          {unit && <span style={{ fontSize: "0.55em", marginLeft: "0.1em" }}>{unit}</span>}
        </span>
      </div>
    </ToneSlab>
  );
}

/** A feed row (the kit's channel inbox): the time in mono, a hollow square, the sender in tracked capitals in its colour, the text under the name. */
export function FeedRow({ time, name, text, color = "var(--w-accent)", rowKey }: { time?: string; name: string; text: string; color?: string; rowKey?: string }) {
  return (
    <Part as="li" kind="row" rowKey={rowKey} className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 py-1 text-caption leading-tight">
      <span data-part="mono" className="text-micro tabular-nums text-[color:var(--w-muted)]">{time ?? ""}</span>
      <span aria-hidden className="h-1.5 w-1.5 self-center border border-current text-[color:var(--w-muted)]" />
      <span className="truncate text-micro font-semibold uppercase tracking-[0.08em]" style={{ color }}>
        {name}
      </span>
      <span className="col-start-3 line-clamp-2 text-[color:var(--w-fg)]">{text}</span>
    </Part>
  );
}

/** A labelled level on the kit's tick ruler: the name in the accent at the left, the reading at the right, the ruler and its thumb under them. */
export function RulerRow({ label, value, pct, color }: { label: string; value: ReactNode; pct: number; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 items-baseline justify-between gap-2 leading-none">
        <span data-part="label" className="truncate text-micro font-semibold uppercase tracking-[0.08em] text-[color:var(--w-accent)]">
          {label}
        </span>
        <span data-part="num" className="shrink-0 text-caption tabular-nums">
          {value}
        </span>
      </div>
      <Bar value={pct} style="ruler" color={color} />
    </div>
  );
}
