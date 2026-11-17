import { useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppWindow, ChevronLeft, ChevronRight } from "lucide-react";
import { PlacementKeysContext } from "@/components/placement-keys";
import { RailHostContext } from "@/components/rail-host";
import { pageIcon } from "@/components/studio/page-icons";
import { audio, EMPTY_AUDIO } from "@/lib/audio-control";
import { extras } from "@/lib/extras";
import type { GestureHandlers } from "@/lib/gesture";
import { keyGrid, keyMark, keyMore, keyTap, type KeySlot } from "@/lib/keys";
import type { TouchAction, TouchGesture } from "@/lib/pinned";
import { actionOn } from "@/lib/rail";
import type { ModuleSettings } from "@/modules/types";
import { ButtonTile, Widget, shell, STATE, type ShellProps } from "../kit";
import { series } from "../page-rail/series";
import { useGestures } from "../shared/use-gestures";
import { meta } from "./meta";

export { meta };

/*
 * Keys (pinned layer P7, owner Q2), as the `keys` fixture draws it (src/dev/fixtures/pinned/keys.tsx): a grid of keys, each
 * the press-button tile (`ButtonTile`) with its icon and name, one dot in its corner for a hold action and two for a double
 * tap. A tap, a hold and a double tap go through the one recogniser, from a finger, raw USB or the keyboard (Enter or Space
 * pressed as a finger is: held for a hold, twice for a double tap). Colours are the Look's tokens: a key's glyph in its series
 * colour, a muted toggle in `--w-crit`, a user image its own colours.
 */

export interface KeysProps extends ShellProps {
  look?: ModuleSettings;
  /** Columns; unset picks them from the widget's shape. */
  columns?: number;
  /** The legend for the corner marks, in the header. */
  legend?: boolean;
}

const GAP = 10;

/** Without a screen around it (Widget QA, a preview), the widget draws these: the fixture's first six. */
const SAMPLE: KeySlot[] = [
  { id: "explorer", name: "Explorer", icon: { from: "set", name: "folder" }, series: 3 },
  { id: "terminal", name: "Terminal", icon: { from: "set", name: "square-terminal" }, touch: { hold: { op: "lock" } } },
  { id: "calc", name: "Calculator", icon: { from: "set", name: "calculator" } },
  { id: "shot", name: "Screenshot", icon: { from: "set", name: "camera" }, series: 1, touch: { doubleTap: { op: "lock" } } },
  { id: "desktop", name: "Show desktop", icon: { from: "set", name: "monitor" }, series: 2 },
  { id: "lock", name: "Lock PC", icon: { from: "set", name: "lock" }, touch: { hold: { op: "lock" } } },
];

const BACK: KeySlot = { id: "keys:back", name: "Back" };

/** An asset's URL (`ASSETS_URL` in src/lib/assets.ts, written out as the rail does, so this chunk splits nothing out of an entry). */
const assetUrl = (id: string) => `/api/assets/${encodeURIComponent(id)}`;

/** A key's glyph at `size` px: a set icon, a user image or an app's icon (their own colours), or text. */
function Glyph({ k, size }: { k: KeySlot; size: number }): ReactNode {
  if (k === BACK) return <ChevronLeft aria-hidden size={size} strokeWidth={1.75} />;
  const icon = k.icon;
  if (!icon) return null;
  if (icon.from === "set") {
    const Cmp = pageIcon(icon.name);
    return Cmp ? <Cmp aria-hidden size={size} strokeWidth={1.75} /> : null;
  }
  if (icon.from === "text") return <span className="font-bold">{icon.text}</span>;
  if (icon.from === "app" && !icon.asset) return <AppWindow aria-hidden size={size} strokeWidth={1.75} />;
  const src = assetUrl(icon.from === "app" ? icon.asset! : icon.asset);
  return <img src={src} alt="" draggable={false} style={{ width: size * 1.15, height: size * 1.15, objectFit: "contain" }} />;
}

/** The corner marks: one dot a hold, two a double tap. */
function Marks({ mark }: { mark: "hold" | "double" }) {
  return (
    <span aria-hidden data-key-mark={mark} className="pointer-events-none absolute flex gap-1" style={{ right: 10, top: 10 }}>
      {Array.from({ length: mark === "double" ? 2 : 1 }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.55 }} />
      ))}
    </span>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[12px]" style={{ color: "var(--w-muted)" }}>
      <span className="flex items-center gap-1">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> Hold
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </span>{" "}
        Double tap
      </span>
    </span>
  );
}

interface KeyProps {
  k: KeySlot;
  side: number;
  corner: string;
  /** A toggle's state (a mute: on = muted). */
  on?: boolean;
  gestures: GestureHandlers;
}

function Key({ k, side, corner, on, gestures }: KeyProps) {
  const g = useGestures(gestures, "press");
  const mark = keyMark(k);
  const more = keyMore(k);
  const glyph = Math.round(Math.max(26, Math.min(120, side * 0.28)));
  const name = k.keys ? (
    <span className="inline-flex max-w-full items-center">
      <span className="truncate">{k.name}</span>
      <ChevronRight aria-hidden size={14} className="shrink-0" />
    </span>
  ) : (
    k.name
  );
  return (
    <div data-key={k.id} className="min-h-0 min-w-0 touch-manipulation select-none">
      <ButtonTile
        w={side}
        h={side}
        icon=""
        glyph={<Glyph k={k} size={glyph} />}
        glyphColor={k.series ? series(k.series) : undefined}
        name={name}
        label={[k.name, more].filter(Boolean).join(", ")}
        tint={STATE.crit}
        active={on === true}
        plain={on === undefined}
        corner={corner}
        onPress={() => {}}
        overlay={mark ? <Marks mark={mark} /> : undefined}
        handlers={g}
      />
    </div>
  );
}

/** The audio state, read only while a key is a mute (it opens the audio stream). */
function useToggleAudio(on: boolean) {
  const sub = useMemo(() => (on ? audio.subscribe : () => () => {}), [on]);
  return useSyncExternalStore(sub, audio.getState, audio.getState);
}

const useObsMic = () => useSyncExternalStore(extras.subscribe, () => extras.getState().obs.mic?.muted, () => extras.getState().obs.mic?.muted);

/** A key's on state: a mute it taps (muted = on), the OBS mic's; undefined for a key that is no toggle. */
function keyOn(k: KeySlot, audioState: Parameters<typeof actionOn>[1], obsMuted: boolean | undefined): boolean | undefined {
  const tap = k.touch?.tap;
  if (!tap || k.keys) return undefined;
  if (tap.op === "obs" && tap.body.op === "mic") return obsMuted;
  return actionOn(tap, audioState);
}

export default function Keys(p: KeysProps) {
  const stored = useContext(PlacementKeysContext);
  const host = useContext(RailHostContext);
  const keys = stored ?? (host ? [] : SAMPLE);
  const [folderId, setFolderId] = useState<string | null>(null);
  const folder = folderId ? keys.find((k) => k.id === folderId && k.keys) : undefined;
  const level = folder ? [BACK, ...(folder.keys ?? [])] : keys;
  const toggles = level.some((k) => k.touch?.tap?.op === "audio");
  const audioState = useToggleAudio(toggles);
  const obsMuted = useObsMic();
  const run = (a: TouchAction, g: TouchGesture) => host?.run(a, g);
  const gestures = (k: KeySlot): GestureHandlers => {
    if (k === BACK) return { tap: () => setFolderId(null) };
    const tap = keyTap(k);
    return {
      ...(tap === "folder" ? { tap: () => setFolderId(k.id) } : tap ? { tap: () => run(tap, "tap") } : {}),
      ...(k.touch?.hold ? { hold: () => run(k.touch!.hold!, "hold") } : {}),
      ...(k.touch?.doubleTap ? { doubleTap: () => run(k.touch!.doubleTap!, "doubleTap") } : {}),
    };
  };
  const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
  return (
    <Widget {...shell(p)} title={p.title ?? "Keys"} icon="grid_view" showHeader={p.showHeader ?? p.legend === true} right={p.legend ? <Legend /> : undefined} bleed>
      {({ w, h }) => {
        if (!level.length)
          return (
            <div className="flex h-full items-center justify-center p-3 text-center text-[13px]" style={{ color: "var(--w-muted)" }}>
              No keys yet. Add them in Edit, in this widget's Key list.
            </div>
          );
        const { cols, rows } = keyGrid(level.length, w, h, p.columns);
        const side = Math.min((w - GAP * (cols - 1)) / cols, (h - GAP * (rows - 1)) / rows);
        return (
          <div role="group" aria-label={folder ? folder.name : (p.title ?? "Keys")} className="grid h-full w-full" style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {level.map((k) => (
              <Key key={k.id} k={k} side={side} corner={corner} on={keyOn(k, toggles ? audioState : EMPTY_AUDIO, obsMuted)} gestures={gestures(k)} />
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
