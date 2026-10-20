import {
  COMMON_LOCALES,
  resolveGeneral,
  type GeneralFont,
  type GeneralSettings,
  type MotionChoice,
} from "@/lib/general";
import { FONT_CATALOG } from "@/lib/fonts";
import type { SheetCard } from "./category-sheet";
import { SourceDot } from "./inspector/source-dot";
import { SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";

interface GeneralPanelProps {
  /** `DashboardConfig.general` (only the changed keys). */
  general: GeneralSettings | undefined;
  /** Set one key (undefined = back to its default). */
  onChange: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
}

/** The clocks' 12 / 24 h choice: the themed `clock` of the all-profiles style (config v7, owner decision Q4). */
export interface GeneralClock {
  /** The stored value (auto | 24 | 12); undefined = Locale. */
  value: string | undefined;
  /** Set it (undefined = back to Locale). */
  onChange: (value: string | undefined) => void;
}

const FONTS = FONT_CATALOG.map((f) => ({ value: f.id, label: f.label }));

const CLOCKS = [
  { value: "auto", label: "Locale" },
  { value: "24", label: "24 h" },
  { value: "12", label: "12 h" },
];

const MOTIONS = [
  { value: "system", label: "System" },
  { value: "reduce", label: "Reduce" },
  { value: "full", label: "Full" },
];

/** The frame-rate caps; the value is the stored number as text. */
export const FPS_OPTIONS = [
  { value: "5", label: "5" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "60", label: "60" },
  { value: "0", label: "Unlimited" },
];

/** The locale options: System, the common locales, and a saved one not among them. */
function localeOptions(current: string): { value: string; label: string }[] {
  const known = current === "" || COMMON_LOCALES.some((l) => l.value === current);
  return [
    { value: "", label: "System" },
    ...COMMON_LOCALES.map((l) => ({ value: l.value, label: `${l.label} · ${l.value}` })),
    ...(known ? [] : [{ value: current, label: current }]),
  ];
}

/**
 * The General cards (nothing selected): dashboard-wide preferences for
 * every profile — the page font, how clocks read, motion and the kiosk
 * cursor. Each row has a dot (set here / default; click to reset) and
 * each card counts the keys set in it and resets just those.
 */
export function generalCards(general: GeneralSettings | undefined, onChange: GeneralPanelProps["onChange"], hours: GeneralClock): SheetCard[] {
  const g = resolveGeneral({ general });
  const clock = hours.value === "12" || hours.value === "24" ? hours.value : "auto";
  const dot = (key: keyof GeneralSettings) => (
    <SourceDot
      state={general?.[key] !== undefined ? "here" : "default"}
      onReset={() => onChange(key, undefined)}
    />
  );
  const set = (keys: (keyof GeneralSettings)[]) => keys.filter((k) => general?.[k] !== undefined);
  const reset = (keys: (keyof GeneralSettings)[]) => () => keys.forEach((k) => onChange(k, undefined));
  const type = ["font"] as const;
  const clockKeys = ["showSeconds", "locale"] as const;
  const performance = ["maxFps", "motion"] as const;
  const display = ["hideCursor", "kioskPageNav"] as const;

  return [
    {
      id: "doc:type",
      title: "Type",
      hint: "The page font",
      terms: ["Type", "Font", "Sans", "Serif", "Mono", "Rounded"],
      changed: set([...type]).length,
      onReset: reset([...type]),
      node: (
        <SelectRow
          label="Font"
          lead={dot("font")}
          hint="Every widget whose Font is Theme uses it; a Font set on the widget or in the widget theme still wins."
          options={FONTS}
          value={g.font}
          onChange={(v) => onChange("font", v === "system" ? undefined : (v as GeneralFont))}
        />
      ),
    },
    {
      id: "doc:clock",
      title: "Clock & date",
      hint: "How clocks and dates read",
      terms: ["Clock", "Date", "Time", "Locale", "Show seconds", "12 h", "24 h"],
      changed: set([...clockKeys]).length + (hours.value !== undefined ? 1 : 0),
      onReset: () => {
        reset([...clockKeys])();
        hours.onChange(undefined);
      },
      node: (
        <>
          <SegmentedRow
            label="Clock"
            lead={<SourceDot state={hours.value !== undefined ? "here" : "default"} onReset={() => hours.onChange(undefined)} />}
            hint="Locale follows the date & time locale below. Every clock that follows the theme's Units & format reads it."
            options={CLOCKS}
            value={clock}
            onChange={(v) => hours.onChange(v === "auto" ? undefined : v)}
          />
          <ToggleRow
            label="Show seconds"
            lead={dot("showSeconds")}
            value={g.showSeconds}
            onChange={(v) => onChange("showSeconds", v ? undefined : false)}
          />
          <SelectRow
            label="Date locale"
            lead={dot("locale")}
            hint="For the Clock widget: the date's order and names follow the locale, and so does the clock when it is set to Locale."
            options={localeOptions(g.locale)}
            value={g.locale}
            onChange={(v) => onChange("locale", v === "" ? undefined : v)}
          />
        </>
      ),
    },
    {
      id: "doc:performance",
      title: "Performance",
      hint: "Frame rate and motion",
      terms: ["Performance", "Max FPS", "Frame rate", "FPS", "Unlimited", "Motion", "Disable animations", "Reduce", "Animations"],
      changed: set([...performance]).length,
      onReset: reset([...performance]),
      node: (
        <>
          <SegmentedRow
            label="Max FPS"
            lead={dot("maxFps")}
            hint="The most frames a second animations redraw (gradients, meters, smooth graphs). Lower it on a weak display or GPU; the kiosk URL's &fps= overrides it."
            options={FPS_OPTIONS}
            value={String(g.maxFps)}
            onChange={(v) => onChange("maxFps", v === "60" ? undefined : Number(v))}
          />
          <SegmentedRow
            label="Motion"
            lead={dot("motion")}
            hint="Reduce disables animations: a background video shows its poster, meters and waveforms are calm, gradients and the clock colon hold still. System follows the operating system's setting."
            options={MOTIONS}
            value={g.motion}
            onChange={(v) => onChange("motion", v === "system" ? undefined : (v as MotionChoice))}
          />
        </>
      ),
    },
    {
      id: "doc:display",
      title: "Display",
      hint: "The kiosk cursor and page navigation",
      terms: ["Display", "Hide cursor", "Kiosk", "Pages", "Page dots", "Swipe"],
      changed: set([...display]).length,
      onReset: reset([...display]),
      node: (
        <>
          <ToggleRow
            label="Hide cursor in kiosk mode"
            lead={dot("hideCursor")}
            value={g.hideCursor}
            onChange={(v) => onChange("hideCursor", v ? true : undefined)}
          />
          <ToggleRow
            label="Page dots and swipe"
            lead={dot("kioskPageNav")}
            hint="In the kiosk: tap a dot or swipe to switch pages; long-press the dots to pause or resume auto-rotate"
            value={g.kioskPageNav}
            onChange={(v) => onChange("kioskPageNav", v ? true : undefined)}
          />
        </>
      ),
    },
  ];
}
