// Shared layouts: CompactView (tile / strip / column), StudioView (variant="studio") and the per-skin headers.
// Text and track colours come from the shell's --w-* variables; label case follows the look (`--wp-label-case`).
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { labelStyle } from "@/components/widget-style";
import { clamp, fmt } from "./data";
import { fitRows } from "./layout";
import { mix } from "./tokens";
import { useSkin, TONES } from "./theme";
import { Icon, Bar, Ring, Spark, Img } from "./primitives";
import { scaleX, scaleY, slideY } from "./motion";
import type { Compact, Shape, Studio } from "./types";

const NUM_GLOW: CSSProperties = { color: "color-mix(in oklab, var(--accent) 55%, var(--w-fg))", textShadow: "0 0 4px var(--accent), 0 0 14px var(--accent)" };

/* Compact views — rendered automatically for tile / strip / column shapes when a widget passes `compact`.
   compact = { label, value, unit, d, sub, icon, t, pct, hist, img, kind: 'spark' | 'bar' | 'ring' | 'text' } */
export function CompactView({ c, shape, w, h, icon }: { c: Compact; shape: Shape; w: number; h: number; icon?: string }) {
  const sk = useSkin();
  const kind = c.kind ?? (c.hist ? "spark" : Number.isFinite(c.pct) ? "bar" : "text");
  const val = typeof c.value === "number" ? fmt(c.value, c.d ?? 0) : c.value;
  // numbers shrink to fit the available width instead of overflowing (text values clamp instead)
  const textLen = String(val ?? "–").length + (c.unit ? String(c.unit).length * 0.45 : 0);
  const fit = (base: number, avail: number) => ({ fontSize: Math.round(Math.max(13, Math.min(base, avail / (Math.max(2.5, textLen) * 0.62 * (sk.numWide ?? 1))))) });
  const value = (cls: string, base?: number, avail = 0) => (
    <span className={`${cls} block max-w-full overflow-x-clip whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums`} style={{ ...(base ? fit(base, avail) : null), fontFamily: sk.num, fontWeight: sk.numWeight, ...(sk.numGlow ? NUM_GLOW : null), ...(c.t && c.t !== "ok" ? { color: TONES[c.t] } : null) }}>
      {val ?? "–"}
      {c.unit && <span className="ml-0.5 text-[0.45em] font-medium text-[color:var(--w-muted)]">{c.unit}</span>}
    </span>
  );
  const label = c.label && (
    <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)]" style={labelStyle()}>
      <Icon name={c.icon ?? icon} className="text-[14px] text-[color:var(--accent)]" />
      <span className="truncate">{c.label}</span>
    </div>
  );
  const textVal = kind === "text";
  // Over a cover image the text sits on a black scrim, so it stays light on every surface.
  if (c.img && shape !== "strip")
    return (
      <div className="absolute inset-0 text-zinc-100">
        <Img src={c.img} icon={c.icon ?? icon} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
          <span className="line-clamp-2 text-sm font-semibold leading-tight">{val}</span>
          {c.sub && <span className="truncate text-[11px] text-zinc-300">{c.sub}</span>}
          {c.viz ? <div className="mt-1.5">{c.viz("h-6")}</div> : Number.isFinite(c.pct) && <Bar value={c.pct!} className="mt-1.5 h-1" track="bg-white/20" />}
        </div>
      </div>
    );
  if (shape === "strip")
    return (
      <div className="flex h-full min-w-0 items-center gap-4">
        {c.img ? <Img src={c.img} icon={c.icon ?? icon} className="aspect-square h-full max-h-20 shrink-0 rounded-lg" /> : null}
        <div className={`flex min-w-0 flex-col gap-1.5 ${textVal || c.img ? "flex-1" : "shrink-0"}`}>
          {label}
          {textVal ? value("truncate text-base") : value("", h < 130 ? 24 : 30, w * 0.38)}
          {c.sub && <span className="truncate text-[11px] text-[color:var(--w-faint)]">{c.sub}</span>}
        </div>
        {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className="h-[70%] min-w-0 flex-1" />}
        {kind === "bar" && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Bar value={c.pct!} t={c.t} className="h-2" />
          </div>
        )}
        {kind === "ring" && <Ring value={c.pct!} t={c.t} color={c.color} thickness={11} className="h-[78%] shrink-0" />}
        {c.viz ? <div className="min-w-0 flex-1">{c.viz("h-[56%] max-h-14")}</div> : textVal && Number.isFinite(c.pct) && <Bar value={c.pct!} className="h-1 w-1/4 shrink-0" />}
      </div>
    );
  if (shape === "column")
    return (
      <div className="flex h-full min-w-0 flex-col gap-2">
        {label}
        {textVal ? <span className="line-clamp-3 text-base font-semibold leading-tight">{val}</span> : value("", w < 150 ? 24 : 36, w - 26)}
        {c.sub && <span className="line-clamp-2 text-[11px] text-[color:var(--w-faint)]">{c.sub}</span>}
        <div className="relative mt-auto min-h-0 flex-1">
          {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className="absolute inset-0 h-full" />}
          {(kind === "bar" || kind === "ring") && (
            <div className="absolute inset-y-0 left-0 right-0 mx-auto flex w-full max-w-[56px] flex-col justify-end overflow-hidden rounded-xl bg-[color:var(--w-track)]">
              <div className="h-full w-full rounded-xl transition-transform duration-700 ease-out" style={{ ...slideY(clamp(c.pct!)), background: TONES[c.t ?? "ok"] }} />
            </div>
          )}
        </div>
      </div>
    );
  // tile (1×1) — w/h are the outer size; below ~130px drop the sub line so value + graph always fit
  const tiny = h < 132 || w < 132;
  return (
    <div className="flex h-full min-w-0 flex-col">
      {label}
      {kind === "ring" ? (
        // a size container: the ring takes the smaller side, so a tall box (Summary card: Always) cannot push it past the width
        <div className="flex min-h-0 flex-1 items-center justify-center pt-1.5" style={{ containerType: "size" }}>
          <div className="shrink-0" style={{ width: "100cqmin" }}>
            <Ring value={c.pct!} t={c.t} color={c.color} thickness={10}>
              <span className="font-semibold tabular-nums" style={{ fontSize: Math.max(12, Math.min(18, (w * 0.45) / Math.max(2.5, String(val).length * 0.62))) }}>
                {val}
                <span className="text-[10px] text-[color:var(--w-muted)]">{c.unit}</span>
              </span>
            </Ring>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-auto flex flex-col gap-1">
            {textVal ? <span className={`${tiny ? "text-[13px]" : "text-sm"} line-clamp-2 font-semibold leading-tight`}>{val}</span> : value("", tiny ? 22 : w < 160 || h < 160 ? 24 : 34, w - 26)}
            {c.sub && !(tiny && (kind === "spark" || kind === "bar" || textVal)) && <span className="truncate text-[11px] text-[color:var(--w-faint)]">{c.sub}</span>}
          </div>
          {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className={`${tiny ? "mt-1.5 h-[22%]" : "mt-2 h-[28%]"} shrink-0`} />}
          {kind === "bar" && <Bar value={c.pct!} t={c.t} className={`${tiny ? "mt-2" : "mt-2.5"} h-1.5 shrink-0`} />}
        </>
      )}
    </div>
  );
}

/* ───────── Studio variant ─────────
   Minimal stat-first layout from the Studio app: mono micro-label, big tight value anchored low, quiet sub, 3px bar.
   Driven by the widget's `studio` descriptor (falls back to `compact`):
   { label, value, unit, d, sub, t, pct, hist, img, live, right, kind: 'text'|'value',
     rows: [{ n, v, pct?, dot? }], meters: [{ n, v 0-100 }], cells: [0-100…], progress: { a, b, pct } } */
export function StudioView({ c, w, h, icon }: { c: Studio; w: number; h: number; icon?: string }) {
  const sk = useSkin();
  const val = typeof c.value === "number" ? fmt(c.value, c.d ?? 0) : c.value;
  // The skin's UI face, else the shell's (the look's Font or the page font): no fixed mono, so the summary follows the styling.
  const mono = sk.font ? { fontFamily: sk.font } : undefined;
  const glow = sk.numGlow ? { textShadow: "0 0 4px var(--accent), 0 0 14px var(--accent)" } : null;
  const toneC = c.t && c.t !== "ok" ? TONES[c.t] : undefined;
  const label = (className = "") => (c.label || c.right || c.live != null) && (
    <div className={`flex min-w-0 shrink-0 items-center gap-1.5 text-[9.5px] uppercase tracking-[0.06em] text-[color:var(--w-muted)] ${className}`} style={{ ...mono, ...labelStyle() }}>
      {c.live != null && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: c.live ? "oklch(0.75 0.15 150)" : "#52525b" }} />}
      {c.label && <span className="truncate">{c.label}</span>}
      {c.right && <span className="ml-auto shrink-0 normal-case tracking-normal text-[color:var(--w-muted)]">{c.right}</span>}
    </div>
  );
  const thin = (pct: number, className = "") => (
    <div className={`h-[3px] shrink-0 overflow-hidden rounded-[2px] bg-[color:var(--w-track)] ${className}`}>
      <div className="h-full w-full transition-transform duration-500" style={{ ...scaleX(clamp(pct)), background: toneC ?? "var(--accent)" }} />
    </div>
  );
  const len = String(val ?? "–").length + (c.unit ? String(c.unit).length * 0.5 : 0);
  const fitPx = (max: number) => Math.round(Math.max(11, Math.min(max, (w - 26) / (Math.max(2.5, len) * 0.68 * (sk.numWide ?? 1)))));
  const big = (max: number): ReactNode =>
    c.kind === "text" ? (
      <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{val ?? "—"}</span>
    ) : (
      <span className="block max-w-full overflow-x-clip whitespace-nowrap font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums" style={{ fontSize: fitPx(max), fontFamily: sk.num, fontWeight: sk.numWeight ?? 600, color: toneC, ...glow }}>
        {val ?? "–"}
        {c.unit && <span className="ml-0.5 text-[0.5em] font-medium text-[color:var(--w-muted)]">{c.unit}</span>}
      </span>
    );
  // single-row zones: label ← → value
  if (h < 100 || (w / h >= 2.6 && h < 130))
    return (
      <div className="flex h-full min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {label()}
          {c.sub && w > 260 && <span className="truncate text-[10px] text-[color:var(--w-muted)]">{c.sub}</span>}
        </div>
        {c.hist && w > 300 ? <Spark values={c.hist} min={c.min} max={c.max} graph="line" fill={false} className="h-[46%] min-w-0 flex-1 opacity-80" /> : Number.isFinite(c.pct) && w > 300 ? thin(c.pct!, "min-w-0 flex-1") : <span className="flex-1" />}
        <span className="shrink-0 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] tabular-nums" style={{ fontFamily: sk.num, color: toneC, ...glow }}>
          {val ?? "–"}
          {c.unit && <span className="ml-0.5 text-[10px] font-medium text-[color:var(--w-muted)]">{c.unit}</span>}
        </span>
      </div>
    );
  const bigMax = h >= 280 ? 44 : h >= 190 ? 34 : 26;
  if (c.img) {
    const pr = c.progress;
    return (
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex min-h-0 flex-1 items-center gap-2.5">
          <div className="aspect-square h-full max-h-[160px] shrink-0 overflow-hidden rounded-md" style={{ maxWidth: Math.max(24, Math.round((w - 26) * 0.5)) }}>
            <Img src={c.img} icon={c.icon ?? icon} className="h-full w-full" />
          </div>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className={`${h > 200 ? "text-[17px]" : "text-sm"} line-clamp-2 font-semibold leading-tight`}>{val}</span>
            {c.sub && <span className="truncate text-[11px] text-[color:var(--w-muted)]">{c.sub}</span>}
          </div>
        </div>
        {c.viz && <div className="mt-2 shrink-0">{c.viz("h-7")}</div>}
        {(pr || Number.isFinite(c.pct)) && (
          <div className="mt-2 flex shrink-0 items-center gap-2 text-[9px] text-[color:var(--w-muted)]" style={mono}>
            {pr?.a && <span className="min-w-0 truncate">{pr.a}</span>}
            {thin(pr?.pct ?? c.pct ?? 0, "min-w-6 flex-1")}
            {pr?.b && <span className="shrink-0">{pr.b}</span>}
          </div>
        )}
      </div>
    );
  }
  if (c.meters && h >= 120) {
    const n = Math.max(1, Math.min(c.meters.length, Math.floor((w + 8) / 26)));
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        <div className="mt-2 flex min-h-0 flex-1 gap-2">
          {c.meters.slice(0, n).map((m, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-[3px] bg-[color:var(--w-track)]">
                <div className="absolute inset-0 transition-transform duration-300" style={{ ...scaleY(clamp(m.v)), background: "var(--accent)" }} />
              </div>
              <span className="truncate text-center text-[9px] text-[color:var(--w-muted)]">{m.n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (c.rows && h >= 130) {
    const head = h >= 210 && c.value != null;
    // a row is the 10.5px line + 3px bar (≈22px) with a 7px gap
    const n = fitRows(h - (head ? 86 : 34), 22, 7);
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        {head && <div className="mt-2">{big(26)}</div>}
        <div className="mt-auto flex flex-col gap-[7px] pt-2">
          {c.rows.slice(0, n).map((r, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-[10.5px]">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {r.dot != null && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: r.dot ? "oklch(0.75 0.15 150)" : "#52525b" }} />}
                  <span className="truncate">{r.n}</span>
                </span>
                <span className="min-w-0 truncate tabular-nums text-[color:var(--w-muted)]">{r.v}</span>
              </div>
              {Number.isFinite(r.pct) && thin(r.pct!)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (c.cells && h >= 120) {
    const cols = Math.max(2, Math.min(c.cells.length, Math.round(Math.sqrt(c.cells.length * (w / Math.max(1, h - 60))))));
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        <div className="mt-2 grid min-h-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
          {c.cells.map((v, i) => (
            <span key={i} className="rounded-[3px]" style={{ background: `color-mix(in oklab, var(--accent) ${8 + clamp(v) * 0.92}%, var(--w-track))` }} />
          ))}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          {big(22)}
          {c.sub && <span className="truncate text-[10px] text-[color:var(--w-muted)]">{c.sub}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-w-0 flex-col">
      {label()}
      {c.hist && h >= 150 && (
        <div className="relative mt-2 min-h-0 flex-1">
          <Spark values={c.hist} min={c.min} max={c.max} graph="line" fill={false} className="absolute inset-0 h-full opacity-70" />
        </div>
      )}
      <div className={`${c.hist && h >= 150 ? "mt-2" : "mt-auto"} flex min-w-0 flex-col`}>
        {big(bigMax)}
        {c.sub && <span className="mt-1 truncate text-[10px] text-[color:var(--w-muted)]">{c.sub}</span>}
        {Number.isFinite(c.pct) && thin(c.pct!, "mt-1.5")}
      </div>
    </div>
  );
}

export interface SkinHeaderProps {
  kind?: string;
  title: ReactNode;
  icon?: string;
  right?: ReactNode;
  bleed?: boolean;
  /** What the tui header patches paint over the box edge: the surface background. */
  bg?: string;
}
/** Whether the tui header's right slot fits on the box edge beside the title; it is dropped when it does not. */
function useTuiRightFits(on: boolean) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  // the slot's last measured width, kept while it is dropped so a wider box can bring it back
  const rightW = useRef(0);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const left = leftRef.current;
    const host = left?.parentElement;
    if (!on || !left || !host) return;
    const check = () => {
      if (rightRef.current) rightW.current = rightRef.current.offsetWidth;
      // both slots sit 12px in from the edges (left-3 / right-3), 8px apart
      setFits(left.offsetWidth + rightW.current + 8 <= host.clientWidth - 24);
    };
    const ro = new ResizeObserver(check);
    ro.observe(host);
    ro.observe(left);
    if (rightRef.current) ro.observe(rightRef.current);
    check();
    return () => ro.disconnect();
  }, [on, fits]);
  return { leftRef, rightRef, fits };
}

/** The most space under a section header the look's gap may add. */
export const HEADER_GAP_MAX = 12;

export function SkinHeader({ kind, title, icon, right, bleed, bg = "#0b0b0d" }: SkinHeaderProps) {
  const sk = useSkin();
  const tuiRight = useTuiRightFits(kind === "tui" && !!right);
  // The look's gap replaces the space under the header (capped: a wide gap is for the items, and the body's
  // own rows are counted without it); its label case applies to every header.
  const st = (def: "uppercase" | "none"): CSSProperties => ({ ...labelStyle(def), ...(sk.gap !== undefined ? { marginBottom: Math.min(sk.gap, HEADER_GAP_MAX) } : null) });
  const r = right && <span className="ml-auto flex shrink-0 items-center gap-1.5 normal-case tracking-normal">{right}</span>;
  if (kind === "tui")
    return (
      <>
        <div ref={tuiRight.leftRef} className="absolute left-3 top-[5px] z-10 flex max-w-[70%] -translate-y-1/2 items-center px-1 text-[11px] leading-none" style={{ background: bg }}>
          <span style={{ color: mix(55, "#52525b") }}>┐</span>
          <span className="truncate px-0.5 font-semibold lowercase text-[color:var(--accent)]" style={{ textTransform: "var(--wp-label-case, lowercase)" as CSSProperties["textTransform"] }}>{title}</span>
          <span style={{ color: mix(55, "#52525b") }}>┌</span>
        </div>
        {right && tuiRight.fits && <div ref={tuiRight.rightRef} className="absolute right-3 top-[5px] z-10 flex -translate-y-1/2 items-center gap-1 px-1 text-[10.5px] leading-none text-[color:var(--w-muted)]" style={{ background: bg }}>{right}</div>}
      </>
    );
  const base = "relative z-10 flex min-w-0 items-center";
  if (kind === "macos")
    return (
      <header className={`${base} mb-2 gap-1.5 text-[13px] font-semibold text-[color:var(--accent)]`} style={st("none")}>
        {icon && <Icon name={icon} fill className="text-[16px]" />}
        <span className="truncate">{title}</span>
        {r && <span className="ml-auto text-[12px] font-normal text-[color:var(--w-muted)]">{right}</span>}
      </header>
    );
  if (kind === "fluent")
    return (
      <header className={`${base} mb-2 gap-2 text-[12px] font-medium text-[color:var(--w-fg)]`} style={st("none")}>
        {icon && <Icon name={icon} className="text-[16px] text-[color:var(--accent)]" />}
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "hud")
    return (
      <header className={`${base} mb-2 gap-2 text-[9.5px] uppercase tracking-[0.28em] text-[color:var(--accent)]`} style={st("uppercase")}>
        <span className="truncate">{title}</span>
        <span className="h-px min-w-[12px] flex-1" style={{ background: mix(35) }} />
        {right && <span className="shrink-0 tracking-[0.1em] text-[color:var(--w-muted)]">{right}</span>}
      </header>
    );
  if (kind === "ink")
    return (
      <header className={`${base} mb-3 gap-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--w-faint)]`} style={st("uppercase")}>
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "ios")
    return (
      <header className={`${base} mb-1.5 gap-1.5 text-[12.5px] font-semibold text-[color:var(--accent)]`} style={st("none")}>
        {icon && <Icon name={icon} fill className="text-[15px]" />}
        <span className="truncate">{title}</span>
        {r && <span className="ml-auto text-[12px] font-medium text-[color:var(--w-faint)]">{right}</span>}
      </header>
    );
  if (kind === "android")
    return (
      <header className={`${base} mb-2.5 gap-2 text-[13px] font-medium`} style={{ color: mix(55, "var(--w-fg)"), ...st("none") }}>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: mix(28, "#1b1b1f") }}>
            <Icon name={icon} fill className="text-[16px]" />
          </span>
        )}
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "synth")
    return (
      <header className={`${base} mb-2 gap-2 text-[11px] font-bold uppercase italic tracking-[0.18em]`} style={st("uppercase")}>
        <span className="truncate bg-gradient-to-r from-[#ff4fd8] to-[#38e8ff] bg-clip-text text-transparent">{title}</span>
        {r}
      </header>
    );
  if (kind === "brutal")
    return (
      <header className={`${base} -mx-[2px] -mt-[2px] mb-3 gap-2`} style={st("uppercase")}>
        <span className="truncate bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black">{title}</span>
        {r}
      </header>
    );
  if (kind === "cyber")
    return (
      <header className={`${base} mb-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]`} style={st("uppercase")}>
        <span className="h-3 w-1 shrink-0 bg-[var(--accent)]" />
        <span className="truncate">{title}</span>
        <span className="text-[9.5px] font-normal text-[color:var(--w-faint)]">{"//"}{String(title).length.toString(16).padStart(2, "0")}</span>
        {r}
      </header>
    );
  if (kind === "nixie")
    return (
      <header className={`${base} mb-2 gap-2 text-[10px] uppercase tracking-[0.3em] text-[#a8805e]`} style={st("uppercase")}>
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "instrument")
    return (
      <header className={`${base} mb-3 items-baseline gap-2.5`} style={st("none")}>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-[color:var(--w-fg)]">{title}</span>
        {r}
      </header>
    );
  if (kind === "retro")
    return (
      <header className={`${base} mb-1.5 gap-1 text-[17px] uppercase leading-none text-[color:var(--accent)]`} style={st("uppercase")}>
        <span className="truncate">&gt; {title}</span>
        <span className="animate-pulse">_</span>
        {r}
      </header>
    );
  return (
    <header className={`${base} mb-2 gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)] ${bleed ? "px-4 pt-3" : ""}`} style={st("uppercase")}>
      {icon && <Icon name={icon} className="text-[15px] text-[color:var(--accent)]" />}
      <span className="truncate">{title}</span>
      {r}
    </header>
  );
}
