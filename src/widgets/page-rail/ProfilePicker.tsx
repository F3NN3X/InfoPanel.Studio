import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import type { RailProfiles } from "@/components/rail-host";
import type { PinnedEdge } from "@/lib/pinned";
import { pickerRows } from "@/lib/profile-switch";
import { chipSeries } from "@/lib/rail";
import { Widget, shell, type ShellProps } from "../kit";
import { series } from "./series";

/*
 * The profile picker (decision 7), as the `profiles` fixture draws it (src/dev/fixtures/pinned/profile-picker.tsx): beside
 * the rail, over the dimmed page, the profiles of this panel's size with their rules, the current one and the one whose
 * rule matches the app in front; "Switch with the app in front" turns auto-switch on or off, and the lock keeps the
 * profile whatever is in front. It is a widget card in the rail's own shell, so it wears the rail's Look. Rows are 64 px,
 * the switch and the lock 56 px. A tap outside or Escape closes it.
 */

const EDGE = "var(--w-track)";
const GAP = 12;
const FOCUS = "focus-visible:[outline:2px_solid_var(--w-accent)] focus-visible:[outline-offset:2px]";

/** Where the sheet and the dimmed page go: beside the rail on its page side, 12 px off it and off the screen's edges. */
export function pickerBox(rail: DOMRect, edge: PinnedEdge, vw: number, vh: number): { sheet: CSSProperties; page: CSSProperties } {
  const side = edge === "left" || edge === "right";
  const page: CSSProperties = edge === "left" ? { left: rail.right, top: 0, right: 0, bottom: 0 } : edge === "right" ? { left: 0, top: 0, width: rail.left, bottom: 0 } : edge === "top" ? { left: 0, top: rail.bottom, right: 0, bottom: 0 } : { left: 0, top: 0, right: 0, height: rail.top };
  const across = side ? vw - rail.width : vw;
  const width = Math.min(520, across - 2 * GAP);
  const maxHeight = (side ? vh : vh - rail.height) - 2 * GAP;
  const sheet: CSSProperties = { width, maxHeight, ...(edge === "right" ? { right: vw - rail.left + GAP } : { left: edge === "left" ? rail.right + GAP : GAP }), ...(edge === "bottom" ? { bottom: vh - rail.top + GAP } : { top: edge === "top" ? rail.bottom + GAP : GAP }) };
  return { sheet, page };
}

/** Lucide's check, drawn here: importing the icon would split it into a chunk of its own in the studio's entry. */
const Tick = () => (
  <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

interface PickerProps {
  profiles: RailProfiles;
  /** The profile shown. */
  current: string;
  edge: PinnedEdge;
  /** The rail's box on screen. */
  rail: DOMRect;
  /** The rail's shell, so the sheet wears its Look. */
  look: ShellProps;
  /** The element the sheet is drawn into (the screen's root, so the page's fonts and Look reach it). */
  host: Element;
}

export function ProfilePicker({ profiles: p, current, edge, rail, look, host }: PickerProps) {
  const rows = pickerRows(p.all, current, p.defaultId, p.front);
  const name = rows.find((r) => r.current)?.name ?? "";
  const locked = p.paused;
  const box = pickerBox(rail, edge, window.innerWidth, window.innerHeight);
  const sheet = useRef<HTMLElement>(null);
  // the current profile's row takes focus; it goes back to the chip when the sheet closes
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>("[aria-current='true']")?.focus();
    return () => was?.focus?.();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return p.close();
    if (e.key !== "Tab") return;
    // focus stays in the sheet
    const all = [...(sheet.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to = e.shiftKey ? (at <= 0 ? all.length - 1 : -1) : at === all.length - 1 ? 0 : -1;
    if (to >= 0) {
      e.preventDefault();
      all[to]?.focus();
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={onKey}>
      <button type="button" tabIndex={-1} aria-label="Close profiles" className="absolute inset-0 cursor-default" onClick={p.close} />
      <div aria-hidden className="pointer-events-none absolute bg-background/70" style={box.page} />
      <section ref={sheet} role="dialog" aria-modal="true" aria-labelledby="profile-picker-title" data-profile-picker className="absolute flex flex-col" style={box.sheet}>
        <Widget {...shell(look)} radius={20} showHeader={false} bleed design={null}>
          <div className="flex h-full min-h-0 flex-col p-4" style={{ color: "var(--w-fg)" }}>
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="profile-picker-title" className="text-[18px] font-semibold">
                Profiles
              </h2>
              {p.front && (
                <span className="truncate text-[13px]" style={{ color: "var(--w-muted)" }}>
                  In front: {p.front}
                </span>
              )}
            </header>
            <ul aria-label="Profiles" className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={r.current ? "true" : undefined}
                    onClick={() => {
                      if (!r.current) p.pick(r.id);
                      p.close();
                    }}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${FOCUS}`}
                    style={{ background: r.current ? "color-mix(in oklab, var(--w-accent) 10%, transparent)" : "color-mix(in oklab, var(--w-fg) 4%, transparent)", boxShadow: r.current ? "inset 0 0 0 2px var(--w-accent)" : `inset 0 0 0 1px ${EDGE}` }}
                  >
                    <span aria-hidden className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: series(chipSeries(r.index)) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-tight">{r.name}</span>
                      <span className="block truncate text-[13px] leading-tight" style={{ color: "var(--w-muted)" }}>
                        {r.detail}
                      </span>
                    </span>
                    {r.current && (
                      <span className="text-[13px] font-semibold" style={{ color: "var(--w-accent)" }}>
                        Current
                      </span>
                    )}
                    {r.matches && (
                      <span className="text-[13px] font-semibold" style={{ color: "var(--w-warn)" }}>
                        Matches now
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <footer className="mt-3 grid gap-3" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
              <button
                type="button"
                role="switch"
                aria-checked={!p.paused}
                onClick={() => p.auto(p.paused)}
                className={`flex h-14 items-center justify-between gap-2 rounded-2xl px-4 text-left text-[14px] ${FOCUS}`}
                style={{ boxShadow: `inset 0 0 0 1px ${EDGE}` }}
              >
                Switch with the app in front
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-background" style={p.paused ? { boxShadow: "inset 0 0 0 1.5px var(--w-muted)" } : { background: "var(--w-accent)" }}>
                  {!p.paused && <Tick />}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={locked}
                onClick={() => (locked ? p.auto(true) : p.auto(false, current))}
                className={`flex h-14 items-center justify-center gap-2 rounded-2xl px-2 text-[14px] font-semibold text-background ${FOCUS}`}
                style={{ background: "var(--w-fg)" }}
              >
                <Lock aria-hidden size={16} /> <span className="truncate">{locked ? `Locked to ${name}` : `Lock to ${name}`}</span>
              </button>
            </footer>
          </div>
        </Widget>
      </section>
    </div>,
    host,
  );
}

