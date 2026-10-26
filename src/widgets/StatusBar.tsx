import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useGeneral } from "@/hooks/use-general";
import { usePageIsland } from "@/hooks/use-page-island";
import { useTick } from "@/hooks/use-tick";
import { islandIdleWidth } from "@/components/island/island-model";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, usePane, type RateUnit, type ShellProps, type WeatherIconProps } from "./kit";
import { Bar, barPad, isPreset, type StatusBarView } from "./StatusBar/Bar";
import { cardWidth } from "./StatusBar/card-model";
import { PRIORITY, readingOf, shownOf, type Display, type ItemKey, type Reading } from "./StatusBar/items";
import { barSize, fitByRank, fitSlots, gapWidth, type IslandGapMode, type Slots } from "./StatusBar/layout";
import { useGap } from "./StatusBar/use-gap";
import { meta } from "./meta/StatusBar";

export { meta };

export interface StatusBarProps extends ShellProps {
  look?: ModuleSettings;
  view?: StatusBarView;
  left?: ItemKey[];
  center?: ItemKey[];
  right?: ItemKey[];
  display?: Display;
  /** Thin dividers between the items of a slot (default true). */
  separators?: boolean;
  spacing?: "compact" | "normal" | "roomy";
  logoIcon?: string;
  logoImage?: string;
  text?: string;
  /** The time shows seconds. */
  seconds?: boolean;
  clock?: "auto" | "12" | "24";
  tempUnit?: "c" | "f";
  rateUnit?: RateUnit;
  iconSet?: WeatherIconProps["set"];
  iconStyle?: WeatherIconProps["style"];
  iconAnimated?: boolean;
  islandGap?: IslandGapMode;
  /** The custom island gap's width, px. */
  islandGapPx?: number;
}

const SPACING = { compact: 8, normal: 14, roomy: 22 };
/** Text widths in em, for the narrow-bar drop (an estimate; the text is not measured). */
const CHAR_EM = 0.58;
const MEDIA_MAX_CHARS = 28;

/** The current moment, refreshed on the shared ticker whenever a minute (or a second) passes; it sleeps in between. */
function useNow(seconds: boolean, on: boolean): Date {
  const [now, setNow] = useState(() => Date.now());
  const step = seconds ? 1000 : 60_000;
  useTick(() => {
    const t = Date.now();
    setNow((prev) => (Math.floor(t / step) !== Math.floor(prev / step) ? t : prev));
    return step - (t % step);
  }, on, 0, "statusbar:clock");
  return new Date(now);
}

const KEYS_WITH_CLOCK: readonly ItemKey[] = ["date", "time", "datetime"];

export default function StatusBar(p: StatusBarProps) {
  const { locale } = useGeneral();
  const { island, page } = usePageIsland();
  const slots: Slots<ItemKey> = { left: p.left ?? ["logo"], center: p.center ?? ["date", "time"], right: p.right ?? ["weather", "network", "volume", "battery"] };
  const keys = [...slots.left, ...slots.center, ...slots.right];
  const now = useNow(p.seconds === true, keys.some((k) => KEYS_WITH_CLOCK.includes(k)));
  const ctx = { d: p.data, now, locale, clock: p.clock ?? "auto", seconds: p.seconds === true, tempUnit: p.tempUnit ?? "c", rateUnit: p.rateUnit, logoIcon: p.logoIcon ?? "monitor", logoImage: p.logoImage, text: p.text ?? "" };
  const readings: Partial<Record<ItemKey, Reading>> = {};
  for (const k of new Set(keys)) {
    const r = readingOf(k, ctx);
    if (r) readings[k] = r;
  }
  // an item with no data is out of its slot, so no divider or gap is left for it
  const present = (list: ItemKey[]) => list.filter((k) => readings[k]);
  const have: Slots<ItemKey> = { left: present(slots.left), center: present(slots.center), right: present(slots.right) };

  const view = p.view ?? "edge";
  const display = p.display ?? "both";
  const separators = p.separators !== false;
  const spacing = SPACING[p.spacing ?? "normal"];
  const barRef = useRef<HTMLDivElement | null>(null);
  const width = gapWidth(p.islandGap ?? "auto", p.islandGapPx ?? 160, islandIdleWidth(island, page));
  const gap = useGap(barRef, width, page.width);

  const radius = chromeOf(p.look ?? {})?.radius ?? p.radius;
  const corner = radius === undefined ? "var(--radius, 1rem)" : `${radius}px`;
  // A capsule (pill and the presets) is drawn inside a clear zone, at the height its items fit at, centred.
  const capsule = view === "pill" || isPreset(view);
  const style: CSSProperties = capsule || view === "islands" ? CLEAR : { borderRadius: `0 0 ${corner} ${corner}` };

  return (
    <Widget {...shell(p)} title={p.title ?? "Status Bar"} icon="panel_top" showHeader={false} bleed compactView="off" design={null} style={{ ...p.style, ...style }} studio={{ label: "Status Bar", value: "" }}>
      {({ w, h }) => {
        // a capsule keeps 4px off the zone's edges
        const bw = capsule ? w - 8 : w,
          bh = capsule ? h - 8 : h;
        // an item's width: its icon, its text at ~0.58em a character and the spacing (and divider) after it
        const cost = (k: ItemKey, fs: number, u: number) => {
          const r = readings[k]!;
          if (r.card) return cardWidth(r.card, u) + spacing * (separators ? 2 : 1) + (separators ? 1 : 0);
          const shown = shownOf(r, display);
          const chars = Math.min(shown.value?.length ?? 0, k === "media" ? MEDIA_MAX_CHARS : Infinity);
          return (shown.icon ? fs * 1.6 : 0) + chars * fs * CHAR_EM + spacing * (separators ? 2 : 1) + (separators ? 1 : 0);
        };
        const roomAt = (fs: number, u: number) => bw - 2 * barPad(view, fs, u) - (gap ? gap.width : 0) - 24;
        const sum = (list: ItemKey[], fs: number, u: number) => list.reduce((s, k) => s + cost(k, fs, u), 0);
        // The side slots share the width left of the centre equally (Meters and a gap lay out their own way).
        const need = (fs: number, u: number) => (view === "meters" || gap ? sum([...have.left, ...have.center, ...have.right], fs, u) : sum(have.center, fs, u) + 2 * Math.max(sum(have.left, fs, u), sum(have.right, fs, u)));
        // The text follows the bar's height and shrinks before any item is dropped.
        const { fs, u } = barSize(bh, Math.max(0, bh - 8), (fs, u) => need(fs, u) <= roomAt(fs, u));
        const room = roomAt(fs, u);
        const costAt = (k: ItemKey) => cost(k, fs, u);
        const fit = w <= 0 ? have : isPreset(view) ? fitByRank(have, room, costAt, (k) => PRIORITY[k] ?? 0) : fitSlots(have, room, costAt);
        const bar = <Bar view={view} u={u} slots={fit} readings={readings} display={display} separators={separators} spacing={spacing} fs={fs} gap={gap} barRef={barRef} icons={{ set: p.iconSet, style: p.iconStyle, animated: p.iconAnimated }} />;
        return capsule ? <Capsule height={Math.min(bh, Math.round(Math.max(u + 8, fs * 2.2)))}>{bar}</Capsule> : bar;
      }}
    </Widget>
  );
}

/** The zone itself drawn clear: the islands' pills and the capsule carry the surface. */
const CLEAR: CSSProperties = { background: "transparent", border: "none", boxShadow: "none", backdropFilter: "none", WebkitBackdropFilter: "none", borderRadius: 0 };

/** The pill and the presets' capsule: the widget's surface, `height` px tall, centred in the zone. */
function Capsule({ height, children }: { height: number; children: ReactNode }) {
  const pane = usePane();
  return (
    <div className="flex h-full w-full items-center justify-center p-1">
      <div className={`w-full min-w-0 overflow-hidden ${pane.className}`} style={{ ...pane.style, borderRadius: 9999, height }}>
        {children}
      </div>
    </div>
  );
}
