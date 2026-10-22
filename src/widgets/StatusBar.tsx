import { useRef, useState, type CSSProperties } from "react";
import { useGeneral } from "@/hooks/use-general";
import { usePageIsland } from "@/hooks/use-page-island";
import { useTick } from "@/hooks/use-tick";
import { islandIdleWidth } from "@/components/island/island-model";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, type RateUnit, type ShellProps, type WeatherIconProps, type WidgetMeta } from "./kit";
import { Bar, type StatusBarView } from "./StatusBar/Bar";
import { readingOf, shownOf, type Display, type ItemKey, type Reading } from "./StatusBar/items";
import { fitSlots, gapWidth, type IslandGapMode, type Slots } from "./StatusBar/layout";
import { useGap } from "./StatusBar/use-gap";

export const meta: WidgetMeta = {
  id: "StatusBar",
  name: "Status Bar",
  category: "System",
  icon: "panel_top",
  prefixes: [],
  defaultSize: [12, 1],
  minSize: [3, 1],
  blurb: "Top bar with slots for any readout",
  tags: "status bar top strip notch island taskbar",
  description: "A one-row bar with a left, a centre and a right slot, each holding any of the date, time, weather, load, temperature, network, volume, battery and more. Leaves room for the Dynamic Island.",
  views: [
    { id: "edge", name: "Edge", blurb: "Flush bar with rounded bottom corners" },
    { id: "pill", name: "Pill", blurb: "A floating capsule", tags: "capsule rounded" },
    { id: "islands", name: "Islands", blurb: "Each slot in its own pill", tags: "waybar separate" },
  ],
};

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

/** The current moment, refreshed on the shared ticker whenever a minute (or a second) passes. */
function useNow(seconds: boolean, on: boolean): Date {
  const [now, setNow] = useState(() => Date.now());
  const step = seconds ? 1000 : 60_000;
  useTick(() => {
    const t = Date.now();
    setNow((prev) => (Math.floor(t / step) !== Math.floor(prev / step) ? t : prev));
  }, on);
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
  const style: CSSProperties =
    view === "pill"
      ? { borderRadius: 9999, margin: 4, width: "calc(100% - 8px)", height: "calc(100% - 8px)" }
      : view === "islands"
        ? { background: "transparent", border: "none", boxShadow: "none", backdropFilter: "none", WebkitBackdropFilter: "none", borderRadius: 0 }
        : { borderRadius: `0 0 ${corner} ${corner}` };

  return (
    <Widget {...shell(p)} title={p.title ?? "Status Bar"} icon="panel_top" showHeader={false} bleed compactView="off" style={{ ...p.style, ...style }} studio={{ label: "Status Bar", value: "" }}>
      {({ w, h }) => {
        const fs = Math.min(22, Math.max(13, Math.round(h * 0.36)));
        // an item's width: its icon, its text at ~0.58em a character and the spacing (and divider) after it
        const cost = (k: ItemKey) => {
          const r = readings[k]!;
          const shown = shownOf(r, display);
          const chars = Math.min(shown.value?.length ?? 0, k === "media" ? MEDIA_MAX_CHARS : Infinity);
          return (shown.icon ? fs * 1.6 : 0) + chars * fs * CHAR_EM + spacing * (separators ? 2 : 1) + (separators ? 1 : 0);
        };
        const room = w - 2 * fs * 1.1 - (gap ? gap.width : 0) - 24;
        const fit = w > 0 ? fitSlots(have, room, cost) : have;
        return <Bar view={view} slots={fit} readings={readings} display={display} separators={separators} spacing={spacing} fs={fs} gap={gap} barRef={barRef} icons={{ set: p.iconSet, style: p.iconStyle, animated: p.iconAnimated }} />;
      }}
    </Widget>
  );
}
