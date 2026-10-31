import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { deckAct, deckPress, iconUrl, streamDeckRefusal, useStreamDeck, type Deck } from "@/lib/streamdeck";
import { READ_ONLY_HINT } from "@/lib/write-refusal";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, Empty, type ShellProps } from "./kit";
import { ReadOnly } from "./ReadOnly";
import { fitKeys, HOLD_MS, PAGE_ROW, pageText, SLOP_PX, swipeOf, titlePx } from "./StreamDeck/layout";
import { meta } from "./meta/StreamDeck";

export { meta };

export type PressedEffect = "dip" | "glow" | "none";

export interface StreamDeckProps extends ShellProps {
  look?: ModuleSettings;
  /** The virtual device's id (the server's registry); unset = the widget asks for one. */
  device?: string;
  /** The titles under the icons. Default on. */
  showTitles?: boolean;
  /** The title size. Default medium. */
  titleSize?: "sm" | "md" | "lg";
  /** The page row when the deck has more than one page. Default on. */
  showPages?: boolean;
  /** A sideways swipe over the keys changes the page. Default on. */
  swipe?: boolean;
  /** The gap between keys, px. */
  keyGap?: number;
  /** A key's corner radius, px; unset follows the widget's corners (their radius × 0.62). */
  keyRadius?: number;
  pressedEffect?: PressedEffect;
}

const DEFAULT_GAP = 8;

/** What the deck says when it has no keys to show: its state, or why not. */
function notice(deck: Deck | undefined, enabled: boolean, device: string | undefined, code: string): { icon: string; label: string; sub?: string } | null {
  if (!device) return { icon: "grid_view", label: "Pick or create a device" };
  if (!enabled) return { icon: "power_settings_new", label: "Turn on Stream Deck in Settings › Connections" };
  if (!deck) return { icon: "grid_view", label: "That device is gone", sub: "Pick or create another" };
  switch (deck.status) {
    case "absent":
      return { icon: "grid_view", label: "The Stream Deck app isn't running" };
    case "pairing":
      return { icon: "link", label: code ? `Pairing code ${code}` : "Waiting for pairing", sub: "Confirm it in the Stream Deck app" };
    case "connecting":
      return { icon: "sync", label: "Connecting to the Stream Deck app" };
    case "error":
      return { icon: "error", label: deck.error ?? "The Stream Deck app refused" };
    case "off":
      return { icon: "power_settings_new", label: "Turn on Stream Deck in Settings › Connections" };
    default:
      return null;
  }
}

export default function StreamDeck(p: StreamDeckProps) {
  const state = useStreamDeck();
  const deck = state.devices.find((d) => d.id === p.device);
  const readOnly = streamDeckRefusal.use();
  const [down, setDown] = useState<ReadonlySet<number>>(new Set());
  // Keys held by a pointer (pointer id → key). Where a swipe can turn pages the press waits (HOLD_MS, or the pointer
  // lifting) so a swipe that starts on a key never presses it; a sent press gets its release, once, however the contact ends.
  const held = useRef(new Map<number, { device: string; index: number; x: number; y: number; sent: boolean; timer?: ReturnType<typeof setTimeout> }>());
  const swiping = useRef(new Map<number, { x: number; y: number }>());
  const effect = p.pressedEffect ?? "dip";
  const gap = p.keyGap ?? DEFAULT_GAP;
  const radius = p.keyRadius !== undefined && p.keyRadius > 0 ? `${p.keyRadius}px` : p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
  const status = notice(deck, state.enabled, p.device, state.pairingCode);
  const ready = deck !== undefined && status === null;

  const send = (pointerId: number) => {
    const key = held.current.get(pointerId);
    if (!key || key.sent) return;
    clearTimeout(key.timer);
    key.sent = true;
    void deckPress(key.device, key.index, true);
  };
  const release = (pointerId: number) => {
    const key = held.current.get(pointerId);
    if (!key) return;
    clearTimeout(key.timer);
    held.current.delete(pointerId);
    setDown((prev) => new Set([...prev].filter((i) => i !== key.index)));
    if (key.sent) void deckPress(key.device, key.index, false);
  };
  const travelled = (pointerId: number, x: number, y: number) => {
    const key = held.current.get(pointerId);
    return key !== undefined && Math.hypot(x - key.x, y - key.y) > SLOP_PX;
  };
  // The keys going away under a held pointer (the deck not ready, another device, the screen turning read-only, which
  // remounts the grid) let go of them: no pointer event reaches a key that is gone.
  const grid = `${ready}:${readOnly}:${deck?.id ?? ""}`;
  useEffect(() => {
    for (const id of [...held.current.keys()]) release(id);
  }, [grid]);
  // A deck taken off the screen (or a widget replaced) mid-press lets go of its keys.
  useEffect(() => {
    const keys = held.current;
    return () => {
      for (const [, key] of keys) {
        clearTimeout(key.timer);
        if (key.sent) void deckPress(key.device, key.index, false);
      }
      keys.clear();
    };
  }, []);

  const label = deck?.name ?? "Stream Deck";
  const hint = status?.label ?? (deck ? `${deck.keys.length} keys` : "");
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? label}
      icon="grid_view"
      right={readOnly ? <span className="text-[color:var(--w-muted)]">{READ_ONLY_HINT}</span> : undefined}
      compact={{ label, value: ready ? `${deck.cols}×${deck.rows}` : "–", sub: hint, kind: "text", icon: "grid_view" }}
    >
      {({ w, h }) => {
        if (!ready)
          return (
            <Empty
              icon={status?.icon ?? "grid_view"}
              label={
                <span className="flex flex-col items-center gap-0.5 text-center">
                  <span>{status?.label}</span>
                  {status?.sub && <span className="text-[10.5px] opacity-70">{status.sub}</span>}
                </span>
              }
            />
          );
        const pages = deck.page.total > 1 && p.showPages !== false;
        const fit = fitKeys(w, h - (pages ? PAGE_ROW + gap : 0), deck.cols, deck.rows, gap);
        const titles = p.showTitles !== false ? titlePx(fit.size, p.titleSize ?? "md") : 0;
        const byIndex = new Map(deck.keys.map((k) => [k.index, k]));
        const turn = (to: "next" | "prev") => void deckAct({ op: "page", device: deck.id, to });
        const swipes = deck.page.total > 1 && p.swipe !== false;
        const onKeyDown = (e: ReactPointerEvent<HTMLDivElement>, index: number) => {
          if (e.button > 0) return;
          // A pointer that is down again lost its last up somewhere: that press ends first.
          release(e.pointerId);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // The touch bridge's synthetic pointers can't be captured; it routes them to the key itself.
          }
          const id = e.pointerId;
          held.current.set(id, { device: deck.id, index, x: e.clientX, y: e.clientY, sent: false });
          setDown((prev) => new Set(prev).add(index));
          if (!swipes) return send(id);
          const key = held.current.get(id);
          if (key) key.timer = setTimeout(() => send(id), HOLD_MS);
        };
        const onKeyMove = (e: ReactPointerEvent<HTMLDivElement>) => {
          if (held.current.get(e.pointerId)?.sent === false && travelled(e.pointerId, e.clientX, e.clientY)) release(e.pointerId);
        };
        const onKeyUp = (e: ReactPointerEvent<HTMLDivElement>) => {
          // A tap shorter than HOLD_MS still presses; a pointer that travelled before its press went out was a swipe.
          if (!travelled(e.pointerId, e.clientX, e.clientY)) send(e.pointerId);
          release(e.pointerId);
        };
        const onGridUp = (e: ReactPointerEvent<HTMLDivElement>) => {
          const from = swiping.current.get(e.pointerId);
          swiping.current.delete(e.pointerId);
          if (!from || !swipes) return;
          const way = swipeOf(e.clientX - from.x, e.clientY - from.y);
          if (way !== 0) turn(way > 0 ? "next" : "prev");
        };
        return (
          <ReadOnly on={readOnly}>
            <div className="flex h-full flex-col items-center justify-center" style={{ gap }}>
              <div
                data-testid="streamdeck-grid"
                className="grid select-none"
                style={{ touchAction: "none", gap, width: fit.width, height: fit.height, gridTemplateColumns: `repeat(${deck.cols}, ${fit.size}px)`, gridAutoRows: `${fit.size}px` }}
                onPointerDown={(e) => swiping.current.set(e.pointerId, { x: e.clientX, y: e.clientY })}
                onPointerUp={onGridUp}
                onPointerCancel={(e) => swiping.current.delete(e.pointerId)}
              >
                {Array.from({ length: deck.cols * deck.rows }, (_, index) => {
                  const key = byIndex.get(index);
                  const filled = key !== undefined && (key.icon !== null || key.title !== "");
                  const on = down.has(index);
                  return (
                    <div
                      key={index}
                      role="button"
                      aria-label={key?.title || `Key ${index + 1}`}
                      aria-pressed={on}
                      onPointerDown={(e) => onKeyDown(e, index)}
                      onPointerMove={onKeyMove}
                      onPointerUp={onKeyUp}
                      onPointerCancel={(e) => release(e.pointerId)}
                      onLostPointerCapture={(e) => release(e.pointerId)}
                      // Without capture (the touch bridge's pointers) a pointer leaving the key lets go of it; with it this comes after the release.
                      onPointerLeave={(e) => release(e.pointerId)}
                      className="relative flex items-center justify-center overflow-hidden bg-white/[0.06] transition-transform duration-75"
                      style={{
                        borderRadius: radius,
                        opacity: filled ? 1 : 0.35,
                        transform: on && effect === "dip" ? "scale(0.93)" : undefined,
                        filter: on && effect === "dip" ? "brightness(0.75)" : undefined,
                        boxShadow: on && effect === "glow" ? "0 0 0 2px var(--accent, #fff), 0 0 14px var(--accent, #fff)" : "inset 0 0 0 1px rgba(255,255,255,.05)",
                      }}
                    >
                      {key?.icon && (
                        <img
                          src={iconUrl(deck.id, index, key.icon)}
                          alt=""
                          draggable={false}
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      {titles > 0 && key?.title && (
                        <span
                          className="pointer-events-none relative max-w-full truncate px-1 text-center font-semibold leading-tight text-white"
                          style={{ fontSize: titles, textShadow: "0 1px 3px rgba(0,0,0,.85)", marginTop: key.icon ? "auto" : undefined, marginBottom: key.icon ? 2 : undefined }}
                        >
                          {key.title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {pages && (
                <div className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-[color:var(--w-muted)]" style={{ height: PAGE_ROW }}>
                  <button type="button" aria-label="Previous page" onClick={() => turn("prev")} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.07]">
                    <Icon name="chevron_left" className="text-[18px]" />
                  </button>
                  <span>{pageText(deck.page.current, deck.page.total)}</span>
                  <button type="button" aria-label="Next page" onClick={() => turn("next")} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.07]">
                    <Icon name="chevron_right" className="text-[18px]" />
                  </button>
                </div>
              )}
            </div>
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
