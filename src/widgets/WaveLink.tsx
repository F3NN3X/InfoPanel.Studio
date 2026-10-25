import type { CSSProperties } from "react";
import { SILENCE_DB, formatDb } from "@/lib/audio/decibels";
import { meterKey, useWavelinkState, type WlChannel, type WlDevice, type WlGain, type WlMix, type WlState } from "@/lib/wavelink";
import type { ModuleSettings } from "@/modules/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useFitRows, Widget, shell, Icon, Chip, Empty, STATE, type BallisticsPreset, type ShellProps, type Tier, type WidgetMeta } from "./kit";
import { MeterPair, dbPos, fmtDb, useWlLevels, type MeterVariant } from "./WaveLink/meters";

export const meta: WidgetMeta = {
  id: "WaveLink",
  name: "Wave Link",
  category: "Audio",
  icon: "mic",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Elgato Wave Link channels and gain",
  tags: "elgato microphone",
  description: "The Elgato Wave Link mixer: software channels with live L/R meters, fader, mute and mix routes, output devices and the app's mixes.",
};

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
  /** Colour of the live dots; default green. */
  liveColor?: string;
  /** Colour of the muted markers and the not-running dot; default red. */
  muteColor?: string;
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
 * A fader as Wave Link's calibrated gain in dB (plugin 1.2+: `levelDb`, null = −∞), or its
 * position in % from older plugins.
 */
export const fader = (level: number | null, levelDb?: number | null): string => {
  if (levelDb !== undefined) return formatDb(levelDb ?? SILENCE_DB, { decimals: 1 });
  return level === null ? "—" : `${Math.round(level * 100)}%`;
};
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
const MuteMark =({ title = "Muted" }: { title?: string }) => (
  <span className="shrink-0 text-[10px] font-semibold" style={{ color: "var(--wl-mute)" }} title={title}>
    M
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
        <span key={m.id} className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[color:var(--w-track)] px-1.5 py-0.5 text-[10px] text-[color:var(--w-muted)]" title={m.isMuted ? `${name(m.id)} (muted)` : name(m.id)}>
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
      <span className="text-[10px] uppercase tracking-wider text-[color:var(--w-faint)]">Mixes</span>
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
function MixColumn({ channel, state, o }: { channel: WlChannel; state: WlState; o: Opts }) {
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
          <div ref={scale.ref} className="relative w-5 shrink-0 font-mono text-[9px] tabular-nums text-[color:var(--w-faint)]">
            {scaleTicks(scale.h).map((db) => (
              <span key={db} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - dbPos(10 ** (db / 20) * 100)}%` }}>
                {db === 0 ? "0" : `−${-db}`}
              </span>
            ))}
          </div>
        )}
        <MeterPair levels={levels} vertical variant={o.variant} color={o.color ?? "var(--accent)"} hot={STATE.crit} />
      </div>
      {o.readout && (
        <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
          <span>
            <span className="mr-1 font-sans text-[10px] text-[color:var(--w-faint)]">L</span>
            {fmtDb(levels.l.v)}
          </span>
          <span>
            <span className="mr-1 font-sans text-[10px] text-[color:var(--w-faint)]">R</span>
            {fmtDb(levels.r.v)}
          </span>
        </div>
      )}
      {o.mixes && <MixChips channel={channel} state={state} />}
    </div>
  );
}

/** A channel row: name, fader, horizontal L/R meters, dB readouts, mix routes. */
function ChannelRow({ channel, state, o, wide, w }: { channel: WlChannel; state: WlState; o: Opts; wide: boolean; w: number }) {
  const levels = useWlLevels(meterKey.channel(channel.id), o.preset);
  // a tile has no room for the readout column; the name column narrows to fit (w 0 = not measured yet)
  const narrow = w > 0 && w < 150,
    readout = o.readout && !narrow;
  return (
    <div className="min-w-0">
      <div className="grid items-center gap-x-3" style={{ gridTemplateColumns: `${wide ? 96 : narrow ? 40 : 64}px minmax(0,1fr)${readout ? ` ${wide ? 72 : 40}px` : ""}` }}>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-1 text-xs font-semibold">
            <span className="truncate" title={channel.name}>
              {channel.name}
            </span>
            {channel.isMuted && <MuteMark />}
          </span>
          {o.fader && <span className="text-[10.5px] tabular-nums text-[color:var(--w-faint)]">{fader(channel.level, channel.levelDb)}</span>}
        </div>
        <MeterPair levels={levels} variant={o.variant} color={o.color ?? "var(--accent)"} hot={STATE.crit} thickness={wide ? 8 : 6} />
        {readout && (
          <div className="flex flex-col text-right font-mono text-[10px] leading-tight tabular-nums text-[color:var(--w-muted)]">
            <span>{fmtDb(levels.l.v)}</span>
            {wide && <span>{fmtDb(levels.r.v)}</span>}
          </div>
        )}
      </div>
      {o.mixes && wide && (
        <div className="mt-1">
          <MixChips channel={channel} state={state} />
        </div>
      )}
    </div>
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
      <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${w >= 260 ? "w-[84px]" : narrow ? "w-[40px]" : "w-[64px]"}`}>
        <span className="truncate" title={channel.name}>
          {channel.name}
        </span>
        {channel.isMuted && <MuteMark />}
      </span>
      {o.fader && !narrow && <span className="w-[54px] shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-[color:var(--w-muted)]">{fader(channel.level, channel.levelDb)}</span>}
      <MeterPair levels={levels} variant={o.variant} color={o.color ?? "var(--accent)"} hot={STATE.crit} thickness={5} className="min-w-0 flex-1" />
      {o.readout && w >= 280 && (
        <span className="w-[60px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[color:var(--w-muted)]">
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
      <MeterPair levels={levels} variant={o.variant} color={o.color ?? "var(--accent)"} hot={STATE.crit} thickness={4} className="min-w-0 flex-1" />
      {o.fader && input?.gain && <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--w-muted)]">{gainLabel(input.gain)}</span>}
    </div>
  );
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
            <MixColumn key={c.id} channel={c} state={state} o={o} />
          ))}
          {side && (
            <div className="flex w-52 shrink-0 flex-col justify-center gap-1.5 overflow-hidden">
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--w-faint)]">Devices</span>
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
  const rowH = wide && o.mixes ? 56 : 40;
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
    <div className={`flex h-full flex-col justify-center gap-2 overflow-hidden ${dim}`}>
      {channels.slice(0, n).map((c) => (
        <ChannelRow key={c.id} channel={c} state={state} o={o} wide={wide} w={w} />
      ))}
      {size === "lg" && devices.slice(0, Math.max(0, n - channels.length)).map((d) => <DeviceRow key={d.id} device={d} o={o} />)}
    </div>
  );
}

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
  const o: Opts = { readout: p.showReadout !== false, fader: p.showFader !== false, mixes: p.showMixes !== false, variant: p.meterVariant ?? "solid", preset: p.ballistics ?? "peak", color: p.levelColor || undefined };
  const first = channels[0];
  const vars = { "--wl-live": p.liveColor || STATE.ok, "--wl-mute": p.muteColor || STATE.crit } as CSSProperties;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Wave Link"}
      icon="mic"
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
      {({ size, w, h }) => <WaveLinkLayout size={size} w={w} h={h} up={up} state={state} channels={channels} devices={devices} mixes={mixes} o={o} vertical={p.meterOrientation !== "horizontal"} />}
    </Widget>
  );
}
