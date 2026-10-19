import type { ModuleSettings } from "@/modules/types";
import { useFastSensors } from "@/hooks/useSensors";
import { AUDIO } from "./audio-device";
import { Widget, useFitRows, shell, fmt, Num, Spark, LedLadder, STATE, hue, useHistory, useMeterBallistics, clamp, type BallisticsPreset, type ShellProps, type WidgetMeta } from "./kit";
import { audioIds, readDevice, type AudioDevice } from "./audio-data";

export const meta: WidgetMeta = {
  id: "AudioMeter",
  name: "Audio Meter",
  category: "Audio",
  icon: "graphic_eq",
  prefixes: ["plugins.audio-level-meter."],
  defaultSize: [2, 1],
  minSize: [1, 1],
  description: "L/R level, peak, RMS and peak-hold for one device, or a meter bridge for all devices.",
};

/** The amber and hot zones' defaults in dBFS: the LED ladder's 72 % and 90 % of full scale (before config v8 fixed). */
export const AUDIO_WARN_DB = 20 * Math.log10(0.72);
export const AUDIO_HOT_DB = 20 * Math.log10(0.9);

/** A dBFS level as the meter's % of full scale (linear amplitude, as Meter Bridge reads the levels), to 0.001 %; off (Infinity) never trips. */
const pctOf = (db: number): number => (Number.isFinite(db) ? Math.round(100 * 10 ** (db / 20) * 1000) / 1000 : db > 0 ? Number.POSITIVE_INFINITY : 0);

const P = (a: number, r: number, cx = 50, cy = 56): [number, number] => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
// Analog VU: needle springs with a slight overshoot
function Vu({ v, label, color, hot }: { v: number; label: string; color: string; hot: string }) {
  const a = -48 + (Math.min(100, Math.max(0, v)) / 100) * 96;
  return (
    <svg viewBox="0 0 100 64" className="h-full w-full">
      {Array.from({ length: 13 }, (_, i) => {
        const ang = -48 + i * 8;
        const [x1, y1] = P(ang, 38);
        const [x2, y2] = P(ang, i % 2 ? 41 : 44);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i >= 10 ? hot : "var(--w-muted)"} strokeWidth={i % 2 ? 0.6 : 1} />;
      })}
      <path d={`M${P(32, 46).join(",")}A46,46 0 0 1 ${P(48, 46).join(",")}`} fill="none" stroke={hot} strokeWidth="2" />
      <path d={`M${P(-48, 46).join(",")}A46,46 0 0 1 ${P(32, 46).join(",")}`} fill="none" stroke={color} strokeWidth="1" opacity=".6" />
      <text x="50" y="40" textAnchor="middle" fontSize="7" fill="var(--w-faint)" letterSpacing="1">
        VU · {label}
      </text>
      <g style={{ transform: `rotate(${a}deg)`, transformOrigin: "50px 56px", transition: "transform .45s cubic-bezier(.34,1.7,.5,1)" }}>
        <line x1="50" y1="58" x2="50" y2="12" stroke="var(--w-fg)" strokeWidth="1.1" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="56" r="3.2" fill="var(--w-track)" stroke="var(--w-faint)" strokeWidth=".6" />
    </svg>
  );
}

export interface AudioMeterProps extends ShellProps {
  look?: ModuleSettings;
  /** container id, default "default-audio" */
  device?: string;
  mode?: "single" | "bridge";
  segments?: number;
  /** `bar` is the accent → amber → red gradient fill, `solid` one colour that turns hot. */
  meterStyle?: "led" | "bar" | "solid" | "vu" | "ring" | "mirror" | "wave";
  /** Bridge only: a column per device (default) or a row per device. */
  orientation?: "vertical" | "horizontal";
  /** Device name (header, bridge labels); default on. */
  showDevice?: boolean;
  /** Peak / RMS / hold / level readouts; default on. */
  showDetails?: boolean;
  /** Muted marker (from the volume plugin); default on. */
  showMute?: boolean;
  /** Device volume; default off. */
  showVolume?: boolean;
  /** Meter response; unset = peak (the template always sends one). */
  ballistics?: BallisticsPreset;
  /** Colour of the level, default the accent. */
  levelColor?: string;
  /** Colour of the hot zone (clip / above 85 %), default red. */
  hotColor?: string;
  /**
   * The Audio level threshold, dBFS: where the LED ladders turn amber and hot (default 72 % / 90 % of
   * full scale); the mirror ladders' zones and the ring's and solid bar's hot point scale with them.
   * The VU dial and the bar gradient keep their fixed scale.
   */
  warnDb?: number;
  hotDb?: number;
}

export default function AudioMeter(p: AudioMeterProps) {
  useFastSensors(AUDIO);
  const d = p.data;
  const all = audioIds(d);
  const bridge = p.mode === "bridge";
  const one = readDevice(d, p.device ?? (all.includes("default-audio") ? "default-audio" : all[0] ?? ""));
  const lH = useHistory(one.l, 72, 0.6);
  const rH = useHistory(one.r, 72, 0.6);
  const step = useMeterBallistics(p.ballistics ?? "peak");
  const st = p.meterStyle ?? "led";
  const lc = p.levelColor || "var(--accent)";
  const hc = p.hotColor || STATE.crit;
  const warnAt = pctOf(p.warnDb ?? AUDIO_WARN_DB),
    hotAt = pctOf(p.hotDb ?? AUDIO_HOT_DB);
  const zones: [number, number] = [warnAt, hotAt];
  const mirrorZones: [number, number] = [(warnAt * 62) / 72, (hotAt * 81) / 90];
  const hotFill = (hotAt * 85) / 90;
  const showDevice = p.showDevice !== false,
    showDetails = p.showDetails !== false,
    showMute = p.showMute !== false;
  const ls = step("l", one.l),
    rs = step("r", one.r);
  const holdPct = ls.hold !== undefined || rs.hold !== undefined ? Math.max(ls.hold ?? 0, rs.hold ?? 0) : undefined;
  const channels: [string, number, number | undefined][] = [
    ["L", ls.v, ls.hold],
    ["R", rs.v, rs.hold],
  ];
  const devices: AudioDevice[] = bridge ? all.map((id) => readDevice(d, id)) : [];
  const name = showDevice ? one.name : "Audio";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? (bridge ? "Audio levels" : name)}
      icon="graphic_eq"
      studio={
        bridge
          ? { label: "Audio levels", meters: devices.map((m) => ({ n: m.name, v: Math.max(m.l, m.r) })) }
          : { label: name, value: one.peak, d: 1, unit: "dB", meters: [{ n: "L", v: one.l }, { n: "R", v: one.r }] }
      }
      compact={bridge ? undefined : { label: name, value: one.peak, d: 1, pct: one.level, unit: "dB", sub: showMute && one.muted ? "Muted" : `L ${fmt(one.l)}% · R ${fmt(one.r)}%`, t: showMute && one.muted ? "crit" : undefined }}
      right={
        bridge ? undefined : (
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-[color:var(--w-muted)]">
            {showMute && one.muted && <span style={{ color: STATE.crit }}>Muted</span>}
            {fmt(one.peak, 1)} dB
          </span>
        )
      }
    >
      {({ size, h }) => {
        if (bridge && p.orientation === "horizontal") {
          // every device (up to 6) gets a row: the row shrinks to fit, down to two thin ladders
          const gap = 4,
            minRow = 16,
            n = Math.max(1, Math.min(devices.length, 6, h > 0 ? useFitRows(h, minRow, gap) : 6));
          const rowH = Math.min(30, Math.max(minRow, Math.floor((h - gap * (n - 1)) / n)));
          const tall = rowH >= 26;
          return (
            <ul className="flex h-full flex-col justify-center overflow-hidden" style={{ gap }}>
              {devices.slice(0, n).map((m) => {
                const l = step(m.id + "l", m.l),
                  r = step(m.id + "r", m.r);
                const mute = showMute && m.muted;
                return (
                  <li key={m.id} className="grid items-center gap-x-3" style={{ gridTemplateColumns: `${showDevice ? `${size === "xs" ? 64 : 88}px ` : ""}minmax(0,1fr) ${size === "xs" || !showDetails ? 36 : 84}px`, height: rowH }} title={m.full}>
                    {showDevice && (
                      <span className="flex min-w-0 flex-col text-xs leading-tight">
                        <span className="flex items-center gap-1">
                          <span className="truncate font-semibold">{m.name}</span>
                          {mute && !tall && <span className="shrink-0 text-[10px] font-semibold" style={{ color: STATE.crit }}>M</span>}
                        </span>
                        {size !== "xs" && tall && (
                          <span className="text-[10.5px] tabular-nums text-[color:var(--w-faint)]">
                            {p.showVolume && Number.isFinite(m.vol) ? `${fmt(m.vol)}%` : ""}
                            {mute && <span style={{ color: STATE.crit }}> muted</span>}
                          </span>
                        )}
                      </span>
                    )}
                    <div className="flex h-full flex-col gap-[2px]">
                      <LedLadder zones={zones} value={l.v} n={size === "lg" ? 32 : 20} color={lc} hotColor={hc} hold={l.hold} />
                      <LedLadder zones={zones} value={r.v} n={size === "lg" ? 32 : 20} color={lc} hotColor={hc} hold={r.hold} />
                    </div>
                    {/* leading-none: the 12px level and 10px dB on one baseline otherwise make a 19px line, taller than a 16px row */}
                    <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap text-right leading-none tabular-nums">
                      <span className="text-xs font-semibold">{fmt(m.level)}%</span>
                      {size !== "xs" && showDetails && <span className="font-mono text-[10px] text-[color:var(--w-faint)]">{fmt(m.peak, 1)} dB</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }
        if (bridge)
          return (
            <div className="flex h-full gap-2">
              {devices.slice(0, 6).map((m) => {
                const l = step(m.id + "l", m.l),
                  r = step(m.id + "r", m.r);
                return (
                  <div key={m.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="text-[11px] font-semibold tabular-nums">{fmt(m.level)}%</span>
                    <div className="flex min-h-0 w-full flex-1 justify-center gap-[3px]">
                      <div className="flex w-2">
                        <LedLadder zones={zones} value={l.v} vertical n={size === "lg" ? 28 : 16} color={lc} hotColor={hc} hold={l.hold} />
                      </div>
                      <div className="flex w-2">
                        <LedLadder zones={zones} value={r.v} vertical n={size === "lg" ? 28 : 16} color={lc} hotColor={hc} hold={r.hold} />
                      </div>
                    </div>
                    {size !== "xs" && showDevice && (
                      <span className="w-full truncate text-center text-[10px] text-[color:var(--w-muted)]" title={m.full}>
                        {m.name}
                        {p.showVolume && Number.isFinite(m.vol) ? ` · ${fmt(m.vol)}%` : ""}
                        {showMute && m.muted && <span style={{ color: STATE.crit }}> · muted</span>}
                      </span>
                    )}
                    {size !== "xs" && showDetails && <span className="font-mono text-[9.5px] tabular-nums text-[color:var(--w-faint)]">{fmt(m.peak, 1)} dB</span>}
                  </div>
                );
              })}
            </div>
          );
        if (size === "xs")
          return (
            <div className="flex h-full flex-col justify-center gap-1.5">
              <div className="flex h-2">
                <LedLadder zones={zones} value={ls.v} n={16} color={lc} hotColor={hc} />
              </div>
              <div className="flex h-2">
                <LedLadder zones={zones} value={rs.v} n={16} color={lc} hotColor={hc} />
              </div>
            </div>
          );
        return (
          <div className="flex h-full flex-col justify-center gap-2">
            {st === "vu" ? (
              <div className="flex min-h-0 flex-1 gap-2">
                {channels.map(([c, v]) => (
                  <div key={c} className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-xl bg-[color:var(--w-track)] p-1">
                    <Vu v={v} label={c} color={lc} hot={hc} />
                  </div>
                ))}
              </div>
            ) : st === "ring" ? (
              <div className="flex min-h-0 flex-1 items-center justify-center gap-4">
                <svg viewBox="0 0 100 100" className="aspect-square h-full max-h-full -rotate-90">
                  {(
                    [
                      [42, ls.v],
                      [31, rs.v],
                    ] as const
                  ).map(([r, v]) => {
                    const c = 2 * Math.PI * r;
                    return (
                      <g key={r}>
                        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--w-track)" strokeWidth="8" />
                        <circle cx="50" cy="50" r={r} fill="none" stroke={v > hotFill ? hc : lc} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamp(v) / 100)} style={{ transition: "stroke-dashoffset .25s" }} />
                      </g>
                    );
                  })}
                  {holdPct !== undefined && <circle cx="50" cy="50" r="42" fill="none" stroke="var(--w-fg)" strokeWidth="8" strokeDasharray={`1.2 ${2 * Math.PI * 42}`} strokeDashoffset={-2 * Math.PI * 42 * (clamp(holdPct) / 100)} />}
                </svg>
                {size !== "sm" && (
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-[color:var(--w-faint)]">Outer L · Inner R</span>
                    <Num className="text-2xl">
                      {fmt(one.level, 0)}
                      <span className="text-xs font-normal text-[color:var(--w-muted)]">%</span>
                    </Num>
                  </div>
                )}
              </div>
            ) : st === "mirror" ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex h-full max-h-4 items-stretch gap-[3px]">
                    <div className="flex flex-1">
                      <LedLadder value={ls.v * (1 - row * 0.18)} n={16} zones={mirrorZones} reverse color={lc} hotColor={hc} />
                    </div>
                    <span className="w-px bg-[color:var(--w-faint)]" />
                    <div className="flex flex-1">
                      <LedLadder value={rs.v * (1 - row * 0.18)} n={16} zones={mirrorZones} color={lc} hotColor={hc} />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-[10px] font-semibold text-[color:var(--w-faint)]">
                  <span>L</span>
                  <span>R</span>
                </div>
              </div>
            ) : st === "wave" ? (
              <div className="relative min-h-0 flex-1">
                <Spark values={lH} min={0} max={100} graph="area" className="absolute inset-x-0 top-0 h-1/2" color={p.levelColor} />
                <Spark values={rH} min={0} max={100} graph="area" className="absolute inset-x-0 bottom-0 h-1/2 -scale-y-100" color={p.levelColor || hue(60)} />
                <div className="absolute inset-x-0 top-1/2 h-px bg-[color:var(--w-track)]" />
              </div>
            ) : (
              channels.map(([c, v, marker]) => {
                                return (
                  <div key={c} className={`flex items-center gap-2 ${size === "lg" ? "h-5" : "h-3"}`}>
                    <span className="w-3 text-[10px] font-semibold text-[color:var(--w-faint)]">{c}</span>
                    {st === "bar" || st === "solid" ? (
                      <div className="relative h-full flex-1 overflow-hidden rounded-full bg-[color:var(--w-track)]">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
                          style={
                            st === "solid"
                              ? { width: `${clamp(v)}%`, background: v > hotFill ? hc : lc }
                              : { width: `${clamp(v)}%`, background: `linear-gradient(90deg, ${lc} 0%, ${lc} 60%, ${STATE.warn} 82%, ${hc} 100%)`, backgroundSize: `${(100 / Math.max(1, v)) * 100}% 100%` }
                          }
                        />
                        {marker !== undefined && <div className="absolute inset-y-0 w-[2px] bg-[color:var(--w-fg)] transition-[left] duration-300" style={{ left: `${marker}%` }} />}
                      </div>
                    ) : (
                      <div className="flex h-full flex-1">
                        <LedLadder zones={zones} value={v} n={p.segments ?? (size === "sm" ? 20 : 32)} color={lc} hotColor={hc} hold={marker} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {p.showVolume && Number.isFinite(one.vol) && (
              <div className="flex items-center gap-2 text-[10.5px] text-[color:var(--w-faint)]">
                <span>Vol</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--w-track)]">
                  <div className="h-full rounded-full" style={{ width: `${clamp(one.vol)}%`, background: one.muted ? "var(--w-faint)" : "var(--w-muted)" }} />
                </div>
                <span className="tabular-nums text-[color:var(--w-fg)]">{fmt(one.vol)}%</span>
              </div>
            )}
            {showDetails && size !== "sm" && (
              <div className="mt-1 grid grid-cols-4 gap-3 font-mono text-[11px]">
                {[
                  ["Peak", `${fmt(one.peak, 1)} dB`],
                  ["RMS", `${fmt(one.rms, 1)} dB`],
                  ["Hold", `${fmt(one.hold, 1)} dB`],
                  ["Level", `${fmt(one.level, 1)}%`],
                ].map(([l, v]) => (
                  <div key={l} className="flex min-w-0 flex-col">
                    <span className="font-sans text-[10px] text-[color:var(--w-faint)]">{l}</span>
                    <span className="truncate text-[color:var(--w-fg)]">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
