import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { deckAct, deckPress, iconUrl, streamDeckRefusal, useStreamDeck, useStreamDeckLink, type Deck, type StreamDeckLink } from "@/lib/streamdeck";
import { READ_ONLY_HINT } from "@/lib/write-refusal";
import type { ModuleSettings } from "@/modules/types";
import { chromeOf } from "@/modules/standard-settings";
import { Widget, shell, Icon, Empty, usePane, type ShellProps } from "./kit";
import { ReadOnly } from "./ReadOnly";
import { resolveAccent, skinContext } from "./core/look";
import type { SkinContext } from "./core/types";
import { fitKeys, HOLD_MS, PAGE_ROW, pageText, SLOP_PX, swipeOf, titlePx } from "./StreamDeck/layout";
import { frameSurface, keyLook, keyRadius, pressedOf, type IconOverlay, type KeyFrame, type KeyStyle, type PressedEffect } from "./StreamDeck/look";
import { meta } from "./meta/StreamDeck";

export { meta };

export type { IconOverlay, KeyFrame, KeyStyle, PressedEffect };

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
  /** The keys' surface: `auto` the skin's card (default), `widget` the widget's, `plain`, or a surface's name. */
  keyStyle?: KeyStyle;
  /** How much of the surface shows round the icon. Default thin. */
  keyFrame?: KeyFrame;
  /** Drawn over the icon: the surface's edge (default), a sheen, a glow, or nothing. */
  iconOverlay?: IconOverlay;
  /** The overlay's strength, 0–100 %. Default 100. */
  overlayStrength?: number;
  /** Default skin: glow on the skins that glow, dip on the rest. */
  pressedEffect?: PressedEffect;
}

const DEFAULT_GAP = 8;

interface KeyProps {
  index: number;
  title: string;
  /** The icon's URL, or null. */
  icon: string | null;
  on: boolean;
  /** The key's side, px. */
  size: number;
  /** The title's font size, px; 0 hides it. */
  titles: number;
  look: Pick<StreamDeckProps, "keyStyle" | "keyFrame" | "iconOverlay" | "overlayStrength" | "pressedEffect" | "keyRadius" | "radius">;
  /** The skin the keys are drawn in (the widget's frame is not). */
  skin: SkinContext;
  /** The accent the look or the widget sets, if any. */
  accent?: string;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onRelease: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/** One key, drawn in the skin (its own component, so it reads the surface of the widget it is in). */
function Key({ index, title, icon, on, size, titles, look, skin, accent, onPointerDown, onPointerMove, onPointerUp, onRelease }: KeyProps) {
  const pane = usePane();
  const style = look.keyStyle || "auto";
  const face = keyLook({ style, frame: look.keyFrame ?? "thin", overlay: look.iconOverlay ?? "skin", strength: look.overlayStrength ?? 100, size, skin, pane });
  const radius = keyRadius({ keyRadius: look.keyRadius, radius: look.radius, style, skin });
  const effect = pressedOf(look.pressedEffect ?? "skin", skin);
  const [broken, setBroken] = useState(false);
  const shown = icon !== null && !broken;
  const inset = shown ? face.inset : 0;
  const inner = inset > 0 ? `max(0px, calc(${radius} - ${inset}px))` : radius;
  return (
    <div
      role="button"
      aria-label={title || `Key ${index + 1}`}
      aria-pressed={on}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      // Without capture (the touch bridge's pointers) a pointer leaving the key lets go of it; with it this comes after the release.
      onPointerLeave={onRelease}
      data-key-style={style}
      className={`relative flex items-center justify-center overflow-hidden transition-transform duration-75 ${face.className}`}
      style={{
        ...face.style,
        "--accent": resolveAccent(accent, skin, face.tone),
        fontFamily: skin.font,
        borderRadius: radius,
        opacity: icon !== null || title !== "" ? 1 : 0.35,
        transform: on && effect === "dip" ? "scale(0.93)" : undefined,
        filter: on && effect === "dip" ? "brightness(0.75)" : undefined,
        ...(on && effect === "glow" ? { boxShadow: "0 0 0 2px var(--accent, #fff), 0 0 14px var(--accent, #fff)" } : null),
      } as CSSProperties}
    >
      {shown && (
        <img
          src={icon}
          alt=""
          draggable={false}
          className="pointer-events-none absolute object-cover"
          style={{ inset, width: `calc(100% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)`, borderRadius: inner }}
          onError={() => setBroken(true)}
        />
      )}
      {face.overlay && <div aria-hidden className={`pointer-events-none absolute inset-0 ${face.overlay.className}`} style={{ ...face.overlay.style, borderRadius: radius }} />}
      {titles > 0 && title && (
        <span
          className="pointer-events-none relative max-w-full truncate px-1 text-center font-semibold leading-tight"
          style={{
            fontSize: titles,
            // Over an icon the title is white with a shadow, as the app draws it; on a bare key it takes the surface's text colour.
            color: shown ? "#fff" : "var(--w-fg)",
            textShadow: shown ? "0 1px 3px rgba(0,0,0,.85)" : undefined,
            marginTop: shown ? "auto" : undefined,
            marginBottom: shown ? inset + 2 : undefined,
          }}
        >
          {title}
        </span>
      )}
    </div>
  );
}

/** What the deck says when it has no keys to show: its state, or why not. A stream that isn't open has only stale keys. */
function notice(deck: Deck | undefined, enabled: boolean, device: string | undefined, code: string, link: StreamDeckLink): { icon: string; label: string; sub?: string } | null {
  if (!device) return { icon: "grid_view", label: "Pick or create a device" };
  if (link === "connecting") return { icon: "sync", label: "Connecting to the dashboard server" };
  if (link === "lost") return { icon: "cloud_off", label: "The dashboard server isn't answering", sub: "Reconnecting…" };
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
  const link = useStreamDeckLink();
  const deck = state.devices.find((d) => d.id === p.device);
  const readOnly = streamDeckRefusal.use();
  const [down, setDown] = useState<ReadonlySet<number>>(new Set());
  // Keys held by a pointer (pointer id → key). Where a swipe can turn pages the press waits (HOLD_MS, or the pointer
  // lifting) so a swipe that starts on a key never presses it; a sent press gets its release, once, however the contact ends.
  const held = useRef(new Map<number, { device: string; index: number; x: number; y: number; sent: boolean; timer?: ReturnType<typeof setTimeout> }>());
  const swiping = useRef(new Map<number, { x: number; y: number }>());
  const gap = p.keyGap ?? DEFAULT_GAP;
  // The skin styles the keys, not the frame: the shell draws unskinned, and drops a surface only the skin brought in.
  const chrome = useMemo(() => (p.look ? chromeOf(p.look) : undefined), [p.look]);
  const keySkin = useMemo(() => skinContext(p.skin ?? "default", { chrome }), [p.skin, chrome]);
  const frameLook = useMemo(() => p.look && { ...p.look, surface: frameSurface(String(p.look.surface ?? "")) ?? "" }, [p.look]);
  const status = notice(deck, state.enabled, p.device, state.pairingCode, link);
  const ready = deck !== undefined && status === null;

  // Two pointers can hold one key: the key goes down with the first press sent and up when the last of them lets go.
  const holders = (device: string, index: number, sentOnly: boolean) => [...held.current.values()].filter((k) => k.device === device && k.index === index && (!sentOnly || k.sent)).length;
  const send = (pointerId: number) => {
    const key = held.current.get(pointerId);
    if (!key || key.sent) return;
    clearTimeout(key.timer);
    const first = holders(key.device, key.index, true) === 0;
    key.sent = true;
    if (first) void deckPress(key.device, key.index, true);
  };
  const release = (pointerId: number) => {
    const key = held.current.get(pointerId);
    if (!key) return;
    clearTimeout(key.timer);
    held.current.delete(pointerId);
    if (holders(key.device, key.index, false) === 0) setDown((prev) => new Set([...prev].filter((i) => i !== key.index)));
    if (key.sent && holders(key.device, key.index, true) === 0) void deckPress(key.device, key.index, false);
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
      const down = new Set<string>();
      for (const [, key] of keys) {
        clearTimeout(key.timer);
        if (key.sent) down.add(`${key.device}\n${key.index}`);
      }
      keys.clear();
      for (const k of down) {
        const [device, index] = k.split("\n");
        void deckPress(device, Number(index), false);
      }
    };
  }, []);

  const label = deck?.name ?? "Stream Deck";
  const hint = status?.label ?? (deck ? `${deck.keys.length} keys` : "");
  const summary = { label, value: ready ? `${deck.cols}×${deck.rows}` : "–", sub: hint, kind: "text" as const, icon: "grid_view" };
  return (
    <Widget
      {...shell(p)}
      skin={undefined}
      surface={frameSurface(p.surface)}
      look={frameLook}
      title={p.title ?? label}
      icon="grid_view"
      right={readOnly ? <span className="text-[color:var(--w-muted)]">{READ_ONLY_HINT}</span> : undefined}
      // a 2x2 tile with a deck to press shows the keys, not a summary of them
      compact={(box) => (ready && box.shape === "tile" && box.w >= 200 && box.h >= 200 ? undefined : summary)}
      studio={summary}
    >
      {({ w, h }) => {
        if (!ready)
          return (
            <Empty
              icon={status?.icon ?? "grid_view"}
              label={
                <span className="flex flex-col items-center gap-0.5 text-center">
                  <span>{status?.label}</span>
                  {status?.sub && <span className="text-micro opacity-70">{status.sub}</span>}
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
                  return (
                    <Key
                      key={index}
                      index={index}
                      title={key?.title ?? ""}
                      icon={key?.icon ? iconUrl(deck.id, index, key.icon) : null}
                      on={down.has(index)}
                      size={fit.size}
                      titles={titles}
                      look={p}
                      skin={keySkin}
                      accent={chrome?.accent || p.accent}
                      onPointerDown={(e) => onKeyDown(e, index)}
                      onPointerMove={onKeyMove}
                      onPointerUp={onKeyUp}
                      onRelease={(e) => release(e.pointerId)}
                    />
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
