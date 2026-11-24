// The audiocn views of the mixer widgets (StreamMixer, VolumeMixer, WaveLink): console strips of a fader on its track
// and dB scale, a meter and an LCD readout (`strips`), or one LCD screen with a line per channel (`lcd`). Each widget
// hands over its channels; this file draws them. Imported by the widgets only, so the audiocn code loads with them.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChannelStrip, ChannelStripControls, ChannelStripDescription, ChannelStripFader, ChannelStripHeader, ChannelStripIcon, ChannelStripMeter, ChannelStripStatus, ChannelStripText, ChannelStripTitle, ChannelStripValue } from "@/components/ui/audiocn/channel-strip";
import { ClipIndicator } from "@/components/ui/audiocn/clip-indicator";
import { DbReadout } from "@/components/ui/audiocn/db-readout";
import { Fader, FaderRange, FaderScale, FaderThumb, FaderTrack } from "@/components/ui/audiocn/fader";
import { LcdDisplay, LcdDisplayLabel, LcdDisplayRow, LcdDisplaySeparator, LcdDisplayStatus, LcdDisplayValue, type LcdDisplayAppearance } from "@/components/ui/audiocn/lcd-display";
import { LevelMeter, LevelMeterBar, LevelMeterChannel, LevelMeterChannels, LevelMeterHold, LevelMeterTrack } from "@/components/ui/audiocn/level-meter";
import { Mixer, MixerChannels, MixerMaster, MixerSeparator } from "@/components/ui/audiocn/mixer";
import { useElementSize } from "@/hooks/use-element-size";
import { resolveTaper } from "@/lib/audio/taper";
import type { FrameSource, MeterFrame } from "@/lib/audio/types";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import { meterZones } from "./level-source";
import { Icon } from "./primitives";
import { MIXER_GAP, mixerFit, thinTicks, type MixerFit } from "./mixer-fit";
import type { MixerLook } from "./mixer-look";
import type { SurfaceTone } from "@/looks/materials";
import { resolveSurface, useSkin } from "./theme";
import "./mixer-views.css";

/** A fader's range and how its values read. */
export interface FaderUnit {
  min: number;
  max: number;
  ticks: number[];
  /** A scale label. */
  tick: (v: number) => string;
  /** The value for assistive technology. */
  format: (v: number) => string;
  /** A dB fader takes the look's taper; a % one is always linear. */
  db: boolean;
}

export const PERCENT: FaderUnit = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], tick: (v) => String(v), format: (v) => `${Math.round(v)}%`, db: false };

export interface StripChannel {
  id: string;
  name: string;
  sub?: string;
  /** A Material Symbols name. */
  icon?: string;
  muted: boolean;
  /** The channel's colour: its tag, fader fill and LCD ink. */
  color: string;
  /** Drawn after the separator, as a master strip. */
  master?: boolean;
  /** An input device: a group of its own between the channels and the masters, read-only. */
  input?: boolean;
  /** The fader's value in the unit; none = no fader. */
  value?: number;
  /** The readout (the LCD's text). */
  readout: string;
  /** The channel's level frames (an L/R pair), read in the strip's meter (it may call hooks; it must call the same ones on every render); none = a meter at silence. */
  useLevel?: () => FrameSource<MeterFrame> | undefined;
  /** The meter's safe-zone colour; default the channel's. */
  meterColor?: string;
  /** Beside the mute control: route pips and the like. */
  extra?: ReactNode;
  /** A writable fader: called with the new value while it moves. */
  onChange?: (value: number) => void;
  /** A mute button; none = a read-only mute mark. */
  onMute?: () => void;
  /** The mute button is shown but can't be used (the server refused writes). */
  locked?: boolean;
}

export interface MixerViewProps {
  look: MixerLook;
  fit: MixerFit;
  channels: StripChannel[];
  unit: FaderUnit;
  /** The widget's surface tone, for the LCD's `auto` appearance. */
  tone: SurfaceTone;
  /** The source is up: the LCD's status pixel blinks. */
  live: boolean;
}

/** How long a moved value is kept after release, for the server's answer to arrive (as the rows view's fader). */
const HOLD_MS = 500;

/** The LCD appearance for the widget's surface: `auto` follows its tone, never the page's colour scheme. */
export const lcdAppearanceFor = (a: LcdDisplayAppearance, tone: SurfaceTone): Exclude<LcdDisplayAppearance, "auto"> => (a !== "auto" ? a : tone === "light" ? "light" : "dark");

/** A fader on its track: writable (a thumb, pointer and keyboard) with `onChange`, else a track and fill with no knob. */
function StripFader({ c, unit, look, label, dense, bare }: { c: StripChannel; unit: FaderUnit; look: MixerLook; label: string; dense: boolean; bare: boolean }) {
  const [held, setHeld] = useState<number | null>(null);
  // the Look's fader knob (`fader-knob-shape: square`) and square cells (`cell-radius: 0`) reach audiocn's round cap and track
  const sk = useSkin();
  const release = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(release.current), []);
  const live = !!c.onChange;
  const value = Math.min(unit.max, held ?? c.value ?? unit.min);
  // ticks a label apart along the measured travel (a label is about 12px tall, and 24px wide on a row)
  const box = useElementSize();
  const taper = unit.db ? look.taper : "linear";
  const ticks = thinTicks(look.ticks ?? unit.ticks, resolveTaper(taper, unit.min, unit.max).toPosition, look.vertical ? box.h : box.w, look.vertical ? 14 : 28);
  const scale = look.scale && !bare && <FaderScale labels={look.scaleLabels} side={look.scaleSide} ticks={ticks} format={unit.tick} />;
  return (
    <Fader
      ref={box.ref}
      aria-label={label}
      value={value}
      min={unit.min}
      max={unit.max}
      step={look.step}
      largeStep={look.step * 10}
      fineStep={unit.db ? 0.1 : 1}
      detents={[]}
      resetValue={value}
      taper={taper}
      allowWheel={live && look.wheel}
      variant={look.faderVariant}
      format={unit.format}
      disabled={!live}
      // a read-only fader stays at full strength: it is a level, not a control turned off
      className={cn("min-h-0 data-disabled:opacity-100", dense && "gap-1")}
      onValueChange={(v) => {
        clearTimeout(release.current);
        setHeld(v);
        c.onChange?.(v);
      }}
      onValueCommitted={() => {
        clearTimeout(release.current);
        release.current = setTimeout(() => setHeld(null), HOLD_MS);
      }}
    >
      {look.scaleSide === "start" && scale}
      <FaderTrack className={cn(sk.cellSquare && "rounded-none")}>
        {look.range && <FaderRange className={cn(sk.cellSquare && "rounded-none")} style={{ background: c.muted ? "var(--w-faint)" : undefined }} />}
        {/* D-21: no knob on a read-only fader; the console cap is the text colour with an inverted line */}
        {live && <FaderThumb className={cn("bg-[color:var(--w-fg)]", look.faderVariant === "console" && "[--foreground:from_var(--ac-inverse)_h_s_l]", sk.knob === "square" && "rounded-none")} />}
      </FaderTrack>
      {look.scaleSide === "end" && scale}
    </Fader>
  );
}

/**
 * The dim labels at 80 % (backlit) or 85 % (glowing) of the lit ink instead of audiocn's 40 %, which read under 4.5:1
 * against the glass in every ink (measured: 1.9 to 2.9 glowing, about 3 backlit).
 */
const LABELS = {
  light: { "--lcd-display-ink-dim": "color-mix(in oklab, var(--lcd-display-lit) 80%, transparent)" },
  dark: { "--lcd-display-ink-dim": "color-mix(in oklab, var(--lcd-display-lit) 85%, transparent)" },
} as Record<"light" | "dark", CSSProperties>;

/** The LCD readout of a strip, or the whole LCD view (`font` = its text size, px, sized to the zone). */
function Lcd({ look, tone, live, className, font, children }: { look: MixerLook; tone: SurfaceTone; live: boolean; className?: string; font?: number; children: ReactNode }) {
  const appearance = lcdAppearanceFor(look.lcdAppearance, tone);
  // square cells: the bezel and the screen lose their corners with the Look's
  const square = useSkin().cellSquare;
  return (
    <LcdDisplay
      variant={look.lcdVariant}
      appearance={appearance}
      style={{ ...LABELS[appearance], ...(font ? { fontSize: font } : null) }}
      size={look.lcdSize}
      matrix={look.lcdMatrix}
      scanlines={look.lcdScanlines}
      // a dashboard LCD is tighter than audiocn's panel one: a thinner bezel and screen padding
      className={cn("relative min-w-0 p-1 [&_[data-slot=lcd-display-content]]:px-1.5 [&_[data-slot=lcd-display-content]]:py-1", square && "rounded-none [&_[data-slot]]:rounded-none", className)}
    >
      {children}
      {look.lcdStatus && <LcdDisplayStatus state={live ? "idle" : "off"} className="right-1 bottom-1 size-1" />}
    </LcdDisplay>
  );
}

/** Tracks in a strip's meter: the L/R pair every level source gives. */
const METER_TRACKS = [0, 1];

/** A strip's level meter: audiocn's `LevelMeter` painting from the channel's frames (its range, zones and response come from the `Mixer`), with the optional clip light and dB readout. */
function StripMeter({ useLevel, color, look, vertical, locked }: { useLevel?: StripChannel["useLevel"]; color: string; look: MixerLook; vertical: boolean; locked?: boolean }) {
  // a component of its own: its hooks (the source's) are counted with the meter, which mounts and unmounts with it
  const source = useLevel?.();
  const square = useSkin().cellSquare;
  const zones = useMemo(() => meterZones(look.meterWarnDb, look.meterClipDb), [look.meterWarnDb, look.meterClipDb]);
  return (
    <div className={cn("flex min-h-0 min-w-0 items-center", vertical ? "h-full flex-col gap-0.5" : "w-full gap-1.5")}>
      {/* a locked mixer keeps the light but not its reset: a disabled button is neither focusable nor clickable */}
      {look.meterClip && <ClipIndicator source={source} disabled={locked} />}
      <LevelMeter
        source={source}
        channelCount={METER_TRACKS.length}
        variant={look.meterVariant}
        segments={look.meterSegments}
        taper={look.meterTaper}
        orientation={vertical ? "vertical" : "horizontal"}
        // audiocn's vertical meter keeps 8rem; a strip's takes the fader's height. Thin tracks, the safe zone in the channel's colour.
        className={cn("min-h-0", vertical ? "h-full flex-1" : "flex-1")}
        style={{ "--meter-thickness": vertical ? "6px" : "3px", "--meter-gap": vertical ? "3px" : "2px", "--meter-ok": color } as CSSProperties}
      >
        <LevelMeterChannels>
          {METER_TRACKS.map((i) => (
            <LevelMeterChannel key={i} index={i}>
              {/* the bar slides out of its track to show the level: a clip on purpose, as art that bleeds (the overflow probe skips it) */}
              <LevelMeterTrack data-qa-bleed className={cn(square && "rounded-none")}>
                <LevelMeterBar />
                {look.meterHold && <LevelMeterHold />}
              </LevelMeterTrack>
            </LevelMeterChannel>
          ))}
        </LevelMeterChannels>
      </LevelMeter>
      {look.meterValue && <DbReadout source={source} decimals={0} unit={!vertical} floorDb={look.meterMinDb} zones={zones} className="text-micro text-muted-foreground" />}
    </div>
  );
}

function MuteControl({ c }: { c: StripChannel }) {
  const icon = c.muted ? "volume_off" : "volume_up";
  const square = useSkin().cellSquare;
  if (!c.onMute)
    return c.muted ? (
      <span role="img" aria-label="Muted" title="Muted" className="flex size-6 items-center justify-center" style={{ color: "var(--channel-mute)" }}>
        <Icon name={icon} className="text-[17px]" />
      </span>
    ) : null;
  return (
    <button
      type="button"
      onClick={c.onMute}
      disabled={c.locked}
      aria-label={c.muted ? `Unmute ${c.name}` : `Mute ${c.name}`}
      aria-pressed={c.muted}
      className={`flex size-7 items-center justify-center ${square ? "rounded-none" : "rounded-md"} bg-[color:var(--w-track)] transition hover:bg-[color:color-mix(in_oklab,var(--w-fg)_14%,transparent)] active:scale-95`}
      style={{ color: c.muted ? "var(--channel-mute)" : "var(--w-muted)" }}
    >
      <Icon name={icon} className="text-[17px]" />
    </button>
  );
}

function Strip({ c, look, fit, unit, tone, live, meter }: { c: StripChannel; look: MixerLook; fit: MixerFit; unit: FaderUnit; tone: SurfaceTone; live: boolean; meter: boolean }) {
  const vertical = look.vertical;
  const sk = useSkin();
  const square = sk.cellSquare;
  // a Look's readout treatment (`readout-*`) reaches the LCD's value as its other readouts do (pack CSS `[data-part=num]`)
  const readout = sk.readout ? "num" : undefined;
  return (
    <ChannelStrip
      variant={c.master ? "master" : look.stripVariant}
      accent={look.accent ? c.color : undefined}
      muted={c.muted}
      // audiocn's strips are sized for a page; a widget's are as tall as the zone and as wide as the fit shares out
      // the fit's last step before leaving channels out (dense) tightens the padding and the gaps; a row strip shares
      // the height left over, its parts centred
      className={cn("min-h-0", fit.dense ? "p-1 [&>[data-slot=channel-strip-layout]]:gap-x-1" : "p-2 [&>[data-slot=channel-strip-layout]]:gap-x-2", vertical ? "h-full" : "flex flex-auto flex-col justify-center", square && "rounded-none")}
      style={{ ...(vertical ? { "--channel-strip-width": `${fit.stripW}px` } : {}), "--channel-accent": c.color } as CSSProperties}
    >
      <ChannelStripHeader className={vertical ? "gap-1" : undefined}>
        {look.icon && c.icon && !vertical && !fit.bare && (
          <ChannelStripIcon className="size-7" style={{ color: c.muted ? "var(--w-faint)" : c.color }}>
            <Icon name={c.icon} className="text-[17px]" />
          </ChannelStripIcon>
        )}
        <ChannelStripText className={vertical ? "w-full items-center" : undefined}>
          <ChannelStripTitle className={cn("max-w-full", c.muted && "text-[color:var(--w-faint)]")} title={c.name}>
            {c.name}
          </ChannelStripTitle>
          {look.sub && !fit.bare && c.sub && (
            <ChannelStripDescription className="max-w-full" title={c.sub}>
              {c.sub}
            </ChannelStripDescription>
          )}
        </ChannelStripText>
        {look.status && !vertical && !fit.bare && <ChannelStripStatus tone={c.muted ? "muted" : "live"}>{c.muted ? "Muted" : "Live"}</ChannelStripStatus>}
      </ChannelStripHeader>
      {meter && (
        <ChannelStripMeter className={vertical ? "py-0" : look.meterClip || look.meterValue ? "min-h-5" : "h-2"}>
          <StripMeter useLevel={c.useLevel} color={c.meterColor ?? c.color} look={look} vertical={vertical} locked={c.locked} />
        </ChannelStripMeter>
      )}
      {c.value !== undefined && (
        <ChannelStripFader>
          <StripFader c={c} unit={unit} look={look} label={`${c.name} level`} dense={fit.dense} bare={fit.bare} />
        </ChannelStripFader>
      )}
      <ChannelStripValue className={cn("min-w-0", fit.lcd && "font-sans")}>
        {fit.lcd ? (
          <Lcd look={look} tone={tone} live={live}>
            <LcdDisplayValue data-part={readout} className="whitespace-nowrap text-center">{c.readout}</LcdDisplayValue>
          </Lcd>
        ) : (
          <span className="text-[color:var(--w-muted)]">{c.readout}</span>
        )}
      </ChannelStripValue>
      <ChannelStripControls className="min-w-0">
        <MuteControl c={c} />
        {c.extra}
      </ChannelStripControls>
    </ChannelStrip>
  );
}

/** "+n": the channels a fit leaves out. */
function More({ n, vertical }: { n: number; vertical: boolean }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[color:var(--w-track)] text-micro font-semibold leading-none tabular-nums text-[color:var(--w-muted)]", vertical ? "w-7 self-stretch" : "h-4.5")}
      title={`${n} more`}
      data-mixer-more={n}
    >
      +{n}
    </span>
  );
}

/** The grid of a mixer's groups: the channels, then (each after a separator) the inputs and the masters. */
export function mixerGrid(vertical: boolean, inputs: boolean, masters: boolean): { areas: string; tracks: string } {
  const cells = ["channels", ...(inputs ? ["separator-in", "inputs"] : []), ...(masters ? ["separator", "master"] : [])];
  const tracks = cells.map((c) => (c === "channels" ? "minmax(0,1fr)" : "auto")).join(" ");
  return vertical ? { areas: `'${cells.join(" ")}'`, tracks } : { areas: cells.map((c) => `'${c}'`).join(" "), tracks };
}

function StripsView({ look, fit, channels, unit, tone, live }: MixerViewProps) {
  const shown = channels.slice(0, fit.n);
  const masters = shown.filter((c) => c.master),
    inputs = shown.filter((c) => c.input),
    rest = shown.filter((c) => !c.master && !c.input);
  // a channel with no level data draws its meter at silence, so the strips stay level; none has any, no meter
  const meter = look.meter && channels.some((c) => c.useLevel);
  const strip = (c: StripChannel) => <Strip key={c.id} c={c} look={look} fit={fit} unit={unit} tone={tone} live={live} meter={meter} />;
  const zones = useMemo(() => meterZones(look.meterWarnDb, look.meterClipDb), [look.meterWarnDb, look.meterClipDb]);
  const grid = mixerGrid(look.vertical, inputs.length > 0, masters.length > 0);
  return (
    <Mixer
      orientation={look.vertical ? "vertical" : "horizontal"}
      size={fit.size}
      // the meters' range, zones and response, shared by every strip's LevelMeter
      minDb={look.meterMinDb}
      maxDb={look.meterMaxDb}
      zones={zones}
      ballistics={look.meterBallistics}
      // no header: the widget's own; the channels take the zone and scroll never (the fit counts what's left out)
      // (a template with a group fewer has a track fewer: an empty one would still take its gap)
      className="h-full"
      style={{ gap: fit.gap, "--mixer-gap": `${fit.gap}px`, gridTemplateAreas: grid.areas, [look.vertical ? "gridTemplateColumns" : "gridTemplateRows"]: grid.tracks, [look.vertical ? "gridTemplateRows" : "gridTemplateColumns"]: "minmax(0,1fr)" } as CSSProperties}
    >
      {/* a row strip's fader keeps a touch area past its edge (audiocn's `before:` inset): the padding holds it */}
      <MixerChannels scrollable={false} className={cn("overflow-hidden", !look.vertical && "pb-1")}>
        {rest.map(strip)}
        {fit.more > 0 && <More n={fit.more} vertical={look.vertical} />}
      </MixerChannels>
      {inputs.length > 0 && (
        <>
          <MixerSeparator className="[grid-area:separator-in]" />
          <MixerMaster className="gap-(--mixer-gap) [grid-area:inputs]">{inputs.map(strip)}</MixerMaster>
        </>
      )}
      {masters.length > 0 && (
        <>
          <MixerSeparator />
          <MixerMaster className="gap-(--mixer-gap)">{masters.map(strip)}</MixerMaster>
        </>
      )}
    </Mixer>
  );
}

/** Which group a channel is drawn in: the channels, then the inputs, then the masters. */
const groupOf = (c: StripChannel): number => (c.master ? 2 : c.input ? 1 : 0);

function LcdView({ look, fit, channels, tone, live }: MixerViewProps) {
  const shown = channels.slice(0, fit.n);
  const readout = useSkin().readout ? "num" : undefined;
  const text = (c: StripChannel) => (c.muted ? "Mute" : c.readout);
  // the text is sized to the zone (`fit.font`); lines and columns are spaced in em, so they scale with it
  const cols = Math.ceil((shown.length + (fit.more ? 1 : 0)) / fit.rows);
  return (
    <Lcd look={look} tone={tone} live={live} font={fit.font} className="flex h-full flex-col [&_[data-slot=lcd-display-content]]:h-full [&_[data-slot=lcd-display-screen]>div]:h-full [&>[data-slot=lcd-display-screen]]:flex-1">
      {look.vertical ? (
        <div className="flex min-h-0 flex-1 flex-col justify-evenly">
          {shown.map((c, i) => (
            <div key={c.id} className="min-w-0">
              {i > 0 && groupOf(c) !== groupOf(shown[i - 1]) && <LcdDisplaySeparator />}
              <LcdDisplayRow className="min-w-0 gap-[1em] py-[0.25em]">
                <LcdDisplayLabel className="min-w-0 truncate" title={c.name}>
                  {c.name}
                </LcdDisplayLabel>
                <LcdDisplayValue data-part={readout} className="shrink-0">{text(c)}</LcdDisplayValue>
              </LcdDisplayRow>
            </div>
          ))}
          {fit.more > 0 && (
            <LcdDisplayRow className="py-[0.25em]">
              <LcdDisplayLabel>+{fit.more} more</LcdDisplayLabel>
            </LcdDisplayRow>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-evenly items-center" style={{ gap: MIXER_GAP, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {shown.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-col items-center gap-[0.5em]">
              <LcdDisplayLabel className="max-w-full truncate" title={c.name}>
                {c.name}
              </LcdDisplayLabel>
              <LcdDisplayValue data-part={readout} className="whitespace-nowrap">{text(c)}</LcdDisplayValue>
            </div>
          ))}
          {fit.more > 0 && <LcdDisplayLabel className="justify-self-center">+{fit.more}</LcdDisplayLabel>}
        </div>
      )}
    </Lcd>
  );
}

/** A mixer widget's audiocn view, inside the scope that maps audiocn's colours to the widget's. */
export function MixerViewBody(p: MixerViewProps) {
  return (
    <div className="audiocn h-full min-h-0 min-w-0" data-mixer-view={p.fit.view}>
      {p.fit.view === "lcd" ? <LcdView {...p} /> : <StripsView {...p} />}
    </div>
  );
}

/** A vertical strip's meter: two 6px tracks, 3px apart. */
const STRIP_METER_W = 15;

/** How `channels` (in the order they give way: the last left out first) fit w×h in the look's view. */
export function fitMixer(look: MixerLook, w: number, h: number, channels: StripChannel[]): MixerFit {
  return mixerFit({
    view: look.view,
    vertical: look.vertical,
    w,
    h,
    count: channels.length,
    masters: channels.filter((c) => c.master).length,
    inputs: channels.filter((c) => c.input).length,
    size: look.stripSize,
    meter: look.meter && channels.some((c) => c.useLevel),
    meterW: STRIP_METER_W,
    meterClip: look.meterClip,
    meterValue: look.meterValue,
    fader: channels.some((c) => c.value !== undefined),
    writable: channels.some((c) => c.onChange),
    // a mute button, else a mute mark on a muted channel, else route dots
    controls: channels.some((c) => c.onMute) ? 28 : channels.some((c) => c.muted) ? 24 : channels.some((c) => c.extra) ? 8 : 0,
    scale: look.scale,
    console: look.faderVariant === "console",
    lcd: look.lcd,
    lcdSize: look.lcdSize,
    chars: Math.max(4, ...channels.map((c) => c.readout.length)),
    nameChars: Math.max(4, ...channels.map((c) => c.name.trim().length)),
  });
}

/** The tone of the surface a widget draws (as the shell resolves it), for the LCD's `auto` appearance. */
export const toneOf = (p: { look?: ModuleSettings; surface?: string; skin?: string }): SurfaceTone => resolveSurface(p.look?.surface ? String(p.look.surface) : p.surface, p.skin).tone;
