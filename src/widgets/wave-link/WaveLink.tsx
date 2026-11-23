import type { CSSProperties } from "react";
import { SILENCE_DB, formatDb } from "@/lib/audio/decibels";
import { meterKey, useWavelinkMeter, useWavelinkState, type WlChannel, type WlDevice, type WlGain, type WlMix, type WlState } from "@/lib/wavelink";
import type { ModuleSettings } from "@/modules/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useFitRows, ChannelRow, Widget, shell, Icon, Chip, Empty, STATE, meterColour, type BallisticsPreset, type ShellProps, type Tier } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { MeterPair, dbPos, fmtDb, levelBar, useWlLevels, type MeterVariant } from "./meters";
import type { MixerLook } from "../core/mixer-look";
import { MixerViewBody, PERCENT, fitMixer, toneOf, type FaderUnit, type StripChannel } from "../core/mixer-views";
import { meta } from "./meta";
import { fader } from "./fader";

export { meta, fader };

export interface WaveLinkProps extends ShellProps {
  look?: ModuleSettings;
  /** Meter keys to show, comma-separated (`channel:<id>` / `device:<id>` / `mix:<id>`); "" = all. Mixes are all shown unless one is picked. */
  source?: string;
  /** Inputs = the channels and input devices, Outputs = the mixes; default both. */
  flow?: "all" | "output" | "input";
  /** dB readouts and scale; default on. */
  showReadout?: boolean;
  /** Fader level; default on. */
  showFader?: boolean;
  /** Mix routes of each channel and the mixes footer; default on. */
  showMixes?: boolean;
  meterVariant?: MeterVariant;
  /** `vertical` = mixer columns (where the zone is tall enough), `horizontal` = a row per channel. */
  meterOrientation?: "vertical" | "horizontal";
  ballistics?: BallisticsPreset;
  /** Colour of the meters' safe zone; default the accent. */
  levelColor?: string;
  /** The level colour is the widget's own (`levelOwnOf`): it does not give way to the Look's meter colour. */
  levelOwn?: boolean;
  /** Colour of the live dots; default green. */
  liveColor?: string;
  /** Colour of the muted markers and the not-running dot; default red. */
  muteColor?: string;
  /** The view (rows, strips or LCD) and its options; unset = the rows view. */
  mixerLook?: MixerLook;
}

export interface Opts {
  readout: boolean;
  fader: boolean;
  mixes: boolean;
  variant: MeterVariant;
  preset: BallisticsPreset;
  /** Meter colour; default the accent. */
  color?: string;
}

/**
 * Input gain in dB as Wave Link shows it, or % for a gain without a dB scale (plugin 1.2+ sends
 * `valueDb: null` for those). Older plugins send no `valueDb`: a Wave mic's `value × max` is its dB.
 */
export const gainLabel = (gain: WlGain): string => {
  const legacyDb = gain.value !== null && gain.max !== null && gain.max > 1 ? gain.value * gain.max : null;
  const db = gain.valueDb !== undefined ? gain.valueDb : legacyDb;
  if (db !== null) return formatDb(db, { decimals: 1 });
  return gain.value === null ? "—" : `${Math.round(gain.value * 100)}%`;
};
const MuteMark = ({ title = "Muted" }: { title?: string }) => (
  <span role="img" aria-label={title} className="shrink-0 text-body" style={{ color: "var(--wl-mute)" }} title={title}>
    <Icon name="volume_off" />
  </span>
);
const Pip = ({ muted }: { muted: boolean }) => <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: muted ? "var(--wl-mute)" : "var(--wl-live)" }} />;

function MixChips({ channel, state }: { channel: WlChannel; state: WlState }) {
  if (!channel.mixes.length) return null;
  const name = (id: string) => state.mixes.find((m) => m.id === id)?.name ?? id;
  return (
    // one line (rows are counted at one chip line): chips shrink and their names truncate in a narrow row
    <div className="flex min-w-0 gap-1">
      {channel.mixes.map((m) => (
        <span key={m.id} className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[color:var(--w-track)] px-1.5 py-0.5 text-micro text-[color:var(--w-muted)]" title={m.isMuted ? `${name(m.id)} (muted)` : name(m.id)}>
          <Pip muted={m.isMuted} />
          <span className="truncate">{name(m.id)}</span>
        </span>
      ))}
    </div>
  );
}

function MixFooter({ mixes }: { mixes: WlMix[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--w-track)] pt-2">
      <span className="text-micro uppercase tracking-wider text-[color:var(--w-faint)]">Mixes</span>
      {mixes.map((m) => (
        <span key={m.id} className="flex items-center gap-1.5 text-xs">
          <Pip muted={m.isMuted} />
          <span className="text-[color:var(--w-muted)]">{m.name}</span>
          <span className="tabular-nums">{fader(m.level, m.levelDb)}</span>
        </span>
      ))}
    </div>
  );
}

const SCALE_DB = [0, -12, -24, -48];
/** The scale labels that fit a meter `h` px tall: top down, each at least one label height (14px, the larger skin fonts) below the last. */
export function scaleTicks(h: number): number[] {
  const kept: number[] = [];
  let last = -Infinity;
  for (const db of SCALE_DB) {
    const y = ((100 - dbPos(10 ** (db / 20) * 100)) / 100) * h;
    if (y - last >= 14) {
      kept.push(db);
      last = y;
    }
  }
  return kept;
}

/** A mixer column: name, fader, scale + vertical L/R meters, readouts, mix routes. */
function MixColumn({ channel, state, o, thickness }: { channel: WlChannel; state: WlState; o: Opts; thickness: number }) {
  const levels = useWlLevels(meterKey.channel(channel.id), o.preset);
  const scale = useElementSize();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs font-semibold" title={channel.name}>
          {channel.name}
        </span>
        {channel.isMuted && <MuteMark />}
        {o.fader && <span className="ml-auto shrink-0 text-xs font-bold tabular-nums">{fader(channel.level, channel.levelDb)}</span>}
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-1 py-1.5">
        {o.readout && (
          <div ref={scale.ref} className="relative w-5 shrink-0 font-mono text-micro tabular-nums text-[color:var(--w-muted)]">
            {scaleTicks(scale.h).map((db) => (
              <span key={db} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - dbPos(10 ** (db / 20) * 100)}%` }}>
                {db === 0 ? "0" : `−${-db}`}
              </span>
            ))}
          </div>
        )}
        <MeterPair levels={levels} vertical variant={o.variant} color={o.color ?? "var(--w-accent)"} hot={STATE.crit} thickness={thickness} />
      </div>
      {o.readout && (
        <div className="flex items-center justify-between gap-2 font-mono text-micro tabular-nums">
          <span>
            <span className="mr-1 font-sans text-micro text-[color:var(--w-faint)]">L</span>
            {fmtDb(levels.l.v)}
          </span>
          <span className="font-sans text-micro text-[color:var(--w-faint)]">dB</span>
          <span>
            <span className="mr-1 font-sans text-micro text-[color:var(--w-faint)]">R</span>
            {fmtDb(levels.r.v)}
          </span>
        </div>
      )}
      {o.mixes && <MixChips channel={channel} state={state} />}
    </div>
  );
}

/** A tile: too narrow for the fader value in the row, so it goes in the line under it (w 0 = not measured yet). */
const isNarrow = (w: number): boolean => w > 0 && w < 150;
/** Whether a channel row has a line under it: the mix chips and both dB readouts on a wide row, the left readout on a medium one, the fader value in a tile. */
const hasTrailing = (o: Opts, wide: boolean, narrow: boolean): boolean => (wide ? o.mixes || o.readout : narrow ? o.fader : o.readout);

/** A channel row on the shared mixer row: name, thin L/R meters, the fader value; under it the mix routes and the dB readouts. */
function WaveRow({ channel, state, o, wide, w }: { channel: WlChannel; state: WlState; o: Opts; wide: boolean; w: number }) {
  const levels = useWlLevels(meterKey.channel(channel.id), o.preset);
  const narrow = isNarrow(w);
  const color = o.color ?? "var(--w-accent)";
  const faderText = fader(channel.level, channel.levelDb);
  const mono = "shrink-0 font-mono text-micro tabular-nums text-[color:var(--w-muted)]";
  const trailing = hasTrailing(o, wide, narrow) && (
    <div className="col-span-full mt-1 flex min-w-0 items-center justify-between gap-2">
      {wide && o.mixes ? <MixChips channel={channel} state={state} /> : <span />}
      {narrow ? (
        <span className={mono}>{faderText}</span>
      ) : (
        o.readout && (
          <span className={mono}>
            {wide ? `${fmtDb(levels.l.v)} ${fmtDb(levels.r.v)} dB` : fmtDb(levels.l.v, true)}
          </span>
        )
      )}
    </div>
  );
  return (
    <ChannelRow
      title={channel.name}
      muted={channel.isMuted}
      name={
        <span className="flex items-center gap-1">
          <span className="truncate">{channel.name}</span>
          {channel.isMuted && <MuteMark />}
        </span>
      }
      nameW={wide ? 96 : narrow ? 40 : 64}
      stereo={[levelBar(levels.l, o.variant, color, STATE.crit), levelBar(levels.r, o.variant, color, STATE.crit)]}
      value={o.fader && !narrow ? faderText.replace(/ dB$/, "") : ""}
      valueW={o.fader && !narrow ? (wide ? 52 : 44) : 0}
      trailing={trailing}
    />
  );
}

const DENSE_H = 22,
  DENSE_GAP = 4;
const denseFits = (count: number, h: number): boolean => count * (DENSE_H + DENSE_GAP) - DENSE_GAP <= h;

/** One line per channel: name, fader, thin L/R meters, dB readouts; many channels in a short zone. */
function DenseRow({ channel, o, w }: { channel: WlChannel; o: Opts; w: number }) {
  const levels = useWlLevels(meterKey.channel(channel.id), o.preset);
  const narrow = w > 0 && w < 150;
  return (
    <div className="flex min-w-0 items-center gap-2" style={{ height: DENSE_H }}>
      <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${w >= 260 ? "w-21" : narrow ? "w-10" : "w-16"}`}>
        <span className="truncate" title={channel.name}>
          {channel.name}
        </span>
        {channel.isMuted && <MuteMark />}
      </span>
      {o.fader && !narrow && <span className="w-13.5 shrink-0 whitespace-nowrap text-right text-micro tabular-nums text-[color:var(--w-muted)]">{fader(channel.level, channel.levelDb)}</span>}
      <MeterPair levels={levels} variant={o.variant} color={o.color ?? "var(--w-accent)"} hot={STATE.crit} thickness={6} className="min-w-0 flex-1" />
      {o.readout && w >= 280 && (
        <span className="w-15 shrink-0 text-right font-mono text-micro tabular-nums text-[color:var(--w-muted)]">
          {fmtDb(levels.l.v)} {fmtDb(levels.r.v)}
        </span>
      )}
    </div>
  );
}

/** An input device (a Wave mic): name, input mute, thin L/R meters, gain. */
function DeviceRow({ device, o }: { device: WlDevice; o: Opts }) {
  // Wave Link meters an input device per input (`input:{inputId}`), never as `device:`
  const levels = useWlLevels(meterKey.input(device.inputs[0]?.id ?? device.id), o.preset);
  const input = device.inputs.find((i) => i.gain?.value !== undefined && i.gain?.value !== null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon name="mic" className="shrink-0 text-sm text-[color:var(--w-faint)]" />
      <span className="min-w-0 truncate text-xs font-semibold" title={device.name}>
        {device.name}
      </span>
      {device.inputs.some((i) => i.isMuted) && <MuteMark />}
      <MeterPair levels={levels} variant={o.variant} color={o.color ?? "var(--w-accent)"} hot={STATE.crit} thickness={4} className="min-w-0 flex-1" />
      {o.fader && input?.gain && <span className="shrink-0 text-micro tabular-nums text-[color:var(--w-muted)]">{gainLabel(input.gain)}</span>}
    </div>
  );
}

/** Wave Link's calibrated faders (plugin 1.2+) as dB, from −60 to 0; older plugins send a position, shown in %. */
const DB_UNIT: FaderUnit = { min: -60, max: 0, ticks: [0, -12, -24, -36, -48, -60], tick: (v) => formatDb(v, { decimals: 0, unit: false }), format: (v) => formatDb(v, { decimals: 1 }), db: true };

interface Level {
  level: number | null;
  levelDb?: number | null;
}
/** A fader's value in the unit, and its readout without the unit (the LCD is narrow). */
const valueOf = (x: Level, db: boolean): number | undefined => (db ? (x.levelDb ?? SILENCE_DB) : x.level === null ? undefined : x.level * 100);
const readoutOf = (x: Level, db: boolean): string => (db ? formatDb(x.levelDb ?? SILENCE_DB, { decimals: 1, unit: false }) : fader(x.level));

/** The channels, the input devices (their own group, with the gain the rows show) and (with Mixes) the mixes as strips: read-only, as the rows (the widget writes nothing). */
function stripsOf(channels: WlChannel[], devices: WlDevice[], mixes: WlMix[], state: WlState, o: Opts, db: boolean): StripChannel[] {
  const color = o.color ?? "var(--w-accent)";
  const name = (id: string) => state.mixes.find((m) => m.id === id)?.name ?? id;
  const text = (x: Level, muted: boolean) => (o.fader ? readoutOf(x, db) : muted ? "Mute" : "Live");
  // the channels first: a zone too small for every strip keeps them and counts the mixes
  const masters = (o.mixes ? mixes : []).map((m) => ({
      id: `mix:${m.id}`,
      name: m.name,
      sub: "Mix",
      icon: "speaker",
      muted: m.isMuted,
      color: "var(--w-fg)",
      master: true,
      value: o.fader ? valueOf(m, db) : undefined,
      readout: text(m, m.isMuted),
      meterColor: color,
      useLevel: () => useWavelinkMeter(meterKey.mix(m.id)),
    }));
  // an input has its gain, not a fader: its position isn't on the channels' scale
  const inputs = devices.map((d) => {
    const muted = d.inputs.some((i) => i.isMuted);
    const gain = d.inputs.find((i) => i.gain?.value !== undefined && i.gain?.value !== null)?.gain;
    return {
      id: `input:${d.id}`,
      name: d.name,
      sub: "Input",
      icon: "mic",
      muted,
      color,
      input: true,
      readout: o.fader && gain ? gainLabel(gain).replace(/ dB$/, "") : muted ? "Mute" : "Live",
      // Wave Link meters an input device per input (`input:{inputId}`), never as `device:`
      useLevel: () => useWavelinkMeter(meterKey.input(d.inputs[0]?.id ?? d.id)),
    };
  });
  return [
    ...channels.map((c) => ({
      id: c.id,
      name: c.name,
      icon: "graphic_eq",
      muted: c.isMuted,
      color,
      value: o.fader ? valueOf(c, db) : undefined,
      readout: text(c, c.isMuted),
      useLevel: () => useWavelinkMeter(meterKey.channel(c.id)),
      extra: o.mixes && c.mixes.length > 0 && (
        <span className="flex min-w-0 items-center gap-1">
          {c.mixes.map((m) => (
            <span key={m.id} title={m.isMuted ? `${name(m.id)} (muted)` : name(m.id)} className="flex">
              <Pip muted={m.isMuted} />
            </span>
          ))}
        </span>
      ),
    })),
    ...inputs,
    ...masters,
  ];
}

export interface WaveLinkLayoutProps {
  size: Tier;
  w: number;
  h: number;
  up: boolean;
  state: WlState;
  channels: WlChannel[];
  devices: WlDevice[];
  /** The mixes listed; default all of the state's. */
  mixes?: WlMix[];
  o: Opts;
  vertical: boolean;
}

/** Mixer columns where the zone is tall enough (and `vertical`), else a row per channel; devices and mixes on lg. */
export function WaveLinkLayout({ size, w, h, up, state, channels, devices, mixes = state.mixes, o, vertical }: WaveLinkLayoutProps) {
  // only mixes to show (Show: Outputs): list them
  if (!channels.length && !devices.length && up && mixes.length) return <div className="flex h-full flex-col justify-center"><MixFooter mixes={mixes} /></div>;
  if (!channels.length && !devices.length) return <Empty icon="mic_off" label={up ? "No channels" : "Wave Link is not running"} />;
  const dim = up ? "" : "opacity-60";
  const cols = Math.max(1, Math.min(6, channels.length, Math.floor((w + 12) / (96 + 12))));
  // columns only when they hold every channel, or when one line per channel would not either
  if (vertical && size !== "xs" && size !== "sm" && h >= 150 && (cols >= channels.length || !denseFits(channels.length, h))) {
    const n = cols;
    const side = size === "lg" && devices.length > 0 && w >= n * 108 + 220;
    return (
      <div className={`flex h-full flex-col gap-2 ${dim}`}>
        <div className="flex min-h-0 flex-1 items-stretch gap-3">
          {channels.slice(0, n).map((c) => (
            <MixColumn key={c.id} channel={c} state={state} o={o} thickness={size === "lg" ? 14 : 10} />
          ))}
          {side && (
            <div className="flex w-52 shrink-0 flex-col justify-center gap-1.5 overflow-hidden">
              <span className="text-micro uppercase tracking-wider text-[color:var(--w-faint)]">Devices</span>
              {devices.slice(0, 4).map((d) => (
                <DeviceRow key={d.id} device={d} o={o} />
              ))}
            </div>
          )}
        </div>
        {o.mixes && mixes.length > 0 && size === "lg" && h >= 200 && <MixFooter mixes={mixes} />}
      </div>
    );
  }
  const wide = w > 300 && h >= 100;
  const rowH = hasTrailing(o, wide, isNarrow(w)) ? 44 : 28;
  const n = useFitRows(h, rowH, 8);
  if (channels.length > n) {
    const dn = useFitRows(h, DENSE_H, DENSE_GAP);
    return (
      <div className={`flex h-full flex-col justify-center gap-1 overflow-hidden ${dim}`}>
        {channels.slice(0, dn).map((c) => (
          <DenseRow key={c.id} channel={c} o={o} w={w} />
        ))}
      </div>
    );
  }
  return (
    <ul className={`flex h-full flex-col justify-center gap-2 overflow-hidden ${dim}`}>
      {channels.slice(0, n).map((c) => (
        <WaveRow key={c.id} channel={c} state={state} o={o} wide={wide} w={w} />
      ))}
      {size === "lg" &&
        devices.slice(0, Math.max(0, n - channels.length)).map((d) => (
          <li key={d.id}>
            <DeviceRow device={d} o={o} />
          </li>
        ))}
    </ul>
  );
}

/** The mixer columns with the devices beside them need about this much; the shell grows the content only past it. */
const DESIGN = { w: 780, h: 440 };

export default function WaveLink(p: WaveLinkProps) {
  const state = useWavelinkState();
  const up = state.status === "up";
  const picked = p.source ? p.source.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const inputs = p.flow !== "output",
    outputs = p.flow !== "input";
  const channels = !inputs ? [] : picked ? state.channels.filter((c) => picked.includes(meterKey.channel(c.id))) : state.channels;
  const devices = !inputs ? [] : picked ? state.devices.filter((d) => picked.includes(meterKey.device(d.id))) : state.devices;
  const pickedMixes = picked?.some((k) => k.startsWith("mix:"));
  const mixes = !outputs ? [] : pickedMixes ? state.mixes.filter((m) => picked!.includes(meterKey.mix(m.id))) : state.mixes;
  const o: Opts = { readout: p.showReadout !== false, fader: p.showFader !== false, mixes: p.showMixes !== false, variant: p.meterVariant ?? "solid", preset: p.ballistics ?? "peak", color: meterColour(t3Tokens(p.t3), p.levelColor, p.levelOwn) };
  const first = channels[0];
  const vars = { "--wl-live": p.liveColor || STATE.ok, "--wl-mute": p.muteColor || STATE.crit } as CSSProperties;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Wave Link"}
      icon="mic"
      design={DESIGN}
      fixedType
      style={{ ...vars, ...p.style }}
      right={
        <Chip>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: up ? "var(--wl-live)" : "var(--wl-mute)" }} />
          {up ? (state.appVersion ? `Live · v${state.appVersion}` : "Live") : "Not running"}
        </Chip>
      }
      studio={{ label: "Wave Link", live: up, value: first ? (first.isMuted ? "Muted" : "Live") : up ? "Up" : "Off", sub: first?.name, meters: channels.map((c) => ({ n: c.name, v: c.isMuted ? 0 : (c.level ?? 0) * 100 })) }}
      compact={channels.length > 1 ? undefined : first ? { label: first.name, value: first.isMuted ? "Muted" : "Live", sub: o.fader ? `Fader ${fader(first.level, first.levelDb)}` : undefined, icon: first.isMuted ? "mic_off" : "mic", kind: "value", t: first.isMuted ? "crit" : "ok" } : { label: "Wave Link", value: up ? "Up" : "Off", kind: "value" }}
    >
      {({ size, w, h }) => {
        const look = p.mixerLook;
        if (look && look.view !== "rows") {
          const db = [...channels, ...mixes].some((x) => x.levelDb !== undefined);
          const strips = stripsOf(channels, devices, mixes, state, o, db);
          const fit = fitMixer(look, w, h, strips);
          if (fit.view !== "rows")
            return (
              <div className={`h-full ${up ? "" : "opacity-60"}`}>
                <MixerViewBody look={look} fit={fit} channels={strips} unit={db ? DB_UNIT : PERCENT} tone={toneOf(p)} live={up} />
              </div>
            );
        }
        return <WaveLinkLayout size={size} w={w} h={h} up={up} state={state} channels={channels} devices={devices} mixes={mixes} o={o} vertical={p.meterOrientation !== "horizontal"} />;
      }}
    </Widget>
  );
}
