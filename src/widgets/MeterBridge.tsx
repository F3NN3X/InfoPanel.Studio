import { useRef } from "react";
import { useFastSensors } from "@/hooks/useSensors";
import { AUDIO } from "./audio-device";
import type { ModuleSettings } from "@/modules/types";
import { useFitRows, Widget, shell, fmt, Dot, LedLadder, HoldMark, scaleX, scaleY, slideX, STATE, useMeterBallistics, type BallisticsPreset, type ShellProps, type WidgetMeta } from "./kit";
import { audioIds, readDevice } from "./audio-data";

export const meta: WidgetMeta = {
  id: "MeterBridge",
  name: "Meter Bridge",
  category: "Audio",
  icon: "graphic_eq",
  prefixes: [],
  defaultSize: [4, 3],
  minSize: [1, 1],
  description: "Studio-style multi-channel level meters: dB scale, stereo LED ladders with dimmed zone colours, peak-hold markers, per-channel volume and live L/R dB readouts.",
};

const dbOf = (pct: number) => (pct > 0 ? 20 * Math.log10(pct / 100) : -Infinity);
const fmtDb = (db: number) => (Number.isFinite(db) ? fmt(db, db > -10 ? 1 : 0) : "-∞");
const SCALE = [0, -6, -12, -18, -24, -36, -48, -60];

interface Channel {
  id: string;
  name: string;
  full: string;
  l: number;
  r: number;
  vol: number;
  muted: boolean;
  lh: number;
  rh: number;
}
interface Held {
  v: number;
  t: number;
}

export interface MeterBridgeProps extends ShellProps {
  look?: ModuleSettings;
  /** device names / ids; default all */
  channels?: string[];
  orientation?: "vertical" | "horizontal";
  /** dB, default -60 */
  floor?: number;
  segments?: number;
  /** Peak-hold time; set, it replaces the preset's own hold. Unset without ballistics: 1500 (the setting shows the peak preset's 1200, which zones always pass). */
  holdMs?: number;
  /** default -18 */
  warnDb?: number;
  /** default -6 */
  clipDb?: number;
  showScale?: boolean;
  showVolume?: boolean;
  ladder?: "led" | "smooth";
  /** List the default-device container too, as "Default device"; off by default (it repeats a device). */
  includeDefault?: boolean;
  /** Device names; default on. */
  showName?: boolean;
  /** L/R dB readouts; default on. */
  showDetails?: boolean;
  /** Muted marker (from the volume plugin); default on. */
  showMute?: boolean;
  /** Meter response; unset keeps the level as it is and the peak hold of `holdMs` (default 1500). */
  ballistics?: BallisticsPreset;
  /** Colour of the safe zone, default the accent. */
  levelColor?: string;
  /** Colour of the clip zone, default red. */
  hotColor?: string;
}

export default function MeterBridge(p: MeterBridgeProps) {
  useFastSensors(AUDIO);
  const d = p.data;
  const floor = p.floor ?? -60,
    warnDb = p.warnDb ?? -18,
    clipDb = p.clipDb ?? -6,
    holdMs = p.holdMs ?? 1500;
  const step = useMeterBallistics(p.ballistics);
  const ids = audioIds(d).filter((id) => p.includeDefault || id !== "default-audio");
  const found = ids.map((id) => {
    const m = readDevice(d, id);
    return { id, name: m.name, full: m.full, pl: m.l, pr: m.r, vol: m.vol, muted: m.muted };
  });
  const picked = p.channels ? p.channels.map((c) => found.find((x) => x.id === c || x.name.toLowerCase() === String(c).toLowerCase())).filter((x): x is (typeof found)[number] => !!x) : found;
  // peak hold: the held value lives in a ref and is stamped onto each channel
  const hold = useRef<Record<string, Held>>({});
  const now = Date.now();
  const holdOf = (key: string, cur: number) => {
    const hv = hold.current[key];
    if (!hv || cur >= hv.v || now - hv.t > holdMs) hold.current[key] = { v: cur, t: now };
    return hold.current[key].v;
  };
  // with ballistics the smoothed level and the preset's own hold replace the raw level and `holdMs`, unless `holdMs` is set
  const side = (id: string, key: "l" | "r", pct: number) => {
    const sm = step(id + key, pct);
    return { db: dbOf(sm.v), held: p.ballistics && p.holdMs === undefined ? (sm.hold !== undefined ? dbOf(sm.hold) : -Infinity) : undefined };
  };
  const ch: Channel[] = picked.map(({ pl, pr, ...c }) => {
    const l = side(c.id, "l", pl),
      r = side(c.id, "r", pr);
    return { ...c, l: l.db, r: r.db, lh: l.held ?? holdOf(c.id + "l", l.db), rh: r.held ?? holdOf(c.id + "r", r.db) };
  });
  const lc = p.levelColor || "var(--accent)",
    hc = p.hotColor || STATE.crit;
  const showName = p.showName !== false,
    showDetails = p.showDetails !== false,
    showMute = p.showMute !== false;
  const mute = (c: Channel) => showMute && c.muted && <span className="shrink-0 text-[10px] font-semibold" style={{ color: STATE.crit }} title="Muted">M</span>;
  const pos = (db: number) => Math.min(100, Math.max(0, ((Math.max(floor, db) - floor) / -floor) * 100));
  const vertical = p.orientation !== "horizontal";
  const anyLive = ch.some((c) => c.l > floor || c.r > floor);

  // called as a function (not a component): a plain render helper over the numbers it is given
  const ladder = (db: number, hdb: number, n: number, horiz = false) => {
    const held = Number.isFinite(hdb) && hdb > floor ? pos(hdb) : undefined;
    if (p.ladder !== "smooth") return <LedLadder value={pos(db)} n={n} vertical={!horiz} zones={[pos(warnDb), pos(clipDb)]} hold={held} color={lc} hotColor={hc} />;
    return (
      <div className={`relative flex ${horiz ? "h-full flex-1 flex-row gap-[2px]" : "w-full flex-1 flex-col-reverse gap-[2px]"}`}>
        <div className="absolute inset-0 rounded-[2px] bg-[color:var(--w-track)]" />
        <div
          className="absolute inset-0 rounded-[2px] transition-transform duration-100"
          style={{
            ...(horiz ? scaleX(pos(db)) : scaleY(pos(db))),
            background: `linear-gradient(${horiz ? "90deg" : "0deg"}, ${lc} 0%, ${lc} ${pos(warnDb)}%, ${STATE.warn} ${pos(warnDb)}%, ${STATE.warn} ${pos(clipDb)}%, ${hc} ${pos(clipDb)}%)`,
            backgroundSize: horiz ? `${(100 / Math.max(1, pos(db))) * 100}% 100%` : `100% ${(100 / Math.max(1, pos(db))) * 100}%`,
            backgroundPosition: horiz ? "left" : "bottom",
          }}
        />
        {held !== undefined && <HoldMark at={held} vertical={!horiz} />}
      </div>
    );
  };

  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Levels"}
      icon="graphic_eq"
      studio={{ label: "Levels", live: anyLive, meters: ch.map((c) => ({ n: c.name, v: pos(Math.max(c.l, c.r)) })), value: fmtDb(Math.max(...ch.map((c) => Math.max(c.l, c.r)))), unit: "dB" }}
      right={
        <span className="flex items-center gap-1.5 text-[color:var(--w-fg)]">
          <Dot ok={anyLive} />
          {anyLive ? "Live" : "Idle"}
        </span>
      }
    >
      {({ w, h }) => {
        if (!vertical || h < 120) {
          const rowH = 30,
            n = useFitRows(h, rowH, 8);
          // a tile has no room for the readout column; the name column narrows to fit
          const narrow = w < 150,
            details = showDetails && !narrow;
          const segs = p.segments ?? Math.max(narrow ? 6 : 12, Math.floor(w / 14));
          return (
            <ul className="flex h-full flex-col justify-center gap-2 overflow-hidden">
              {ch.slice(0, n).map((c) => (
                <li key={c.id} className="grid items-center gap-x-3" style={{ gridTemplateColumns: `${w > 340 ? 88 : narrow ? 36 : 60}px minmax(0,1fr)${details ? ` ${w > 300 ? 72 : 40}px` : ""}` }} title={c.full}>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="flex items-center gap-1 text-xs font-semibold">
                      {showName && <span className="truncate">{c.name}</span>}
                      {mute(c)}
                    </span>
                    {p.showVolume !== false && Number.isFinite(c.vol) && <span className="text-[10.5px] tabular-nums text-[color:var(--w-faint)]">{fmt(c.vol)}%</span>}
                  </div>
                  <div className="flex h-[22px] flex-col gap-[3px]">
                    {ladder(c.l, c.lh, segs, true)}
                    {ladder(c.r, c.rh, segs, true)}
                  </div>
                  {details && (
                    <div className="flex flex-col text-right font-mono text-[10px] leading-tight tabular-nums text-[color:var(--w-muted)]">
                      <span>{fmtDb(c.l)}</span>
                      {w > 300 && <span>{fmtDb(c.r)}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          );
        }
        const colMin = 74,
          n = Math.max(1, Math.min(ch.length, Math.floor((w + 14) / (colMin + 14))));
        const colW = (w - (n - 1) * 14) / n,
          scale = p.showScale !== false && colW > 92;
        const segs = p.segments ?? Math.max(10, Math.min(36, Math.floor((h - 52) / 7.5)));
        return (
          <div className="grid h-full gap-x-3.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
            {ch.slice(0, n).map((c) => (
              <div key={c.id} className="flex min-h-0 min-w-0 flex-col gap-2" title={c.full}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 text-[13px] font-semibold">
                      {showName && <span className="truncate">{c.name}</span>}
                      {mute(c)}
                    </span>
                    {p.showVolume !== false && Number.isFinite(c.vol) && <span className="shrink-0 text-[13px] font-semibold tabular-nums">{fmt(c.vol)}%</span>}
                  </div>
                  {p.showVolume !== false && Number.isFinite(c.vol) && (
                    <div className="h-[3px] overflow-hidden rounded-full bg-[color:var(--w-track)]">
                      <div className="h-full w-full rounded-full bg-[color:var(--w-muted)] transition-transform duration-300" style={slideX(c.vol)} />
                    </div>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 gap-2">
                  {scale && (
                    <div className="relative w-[30px] shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--w-faint)]">
                      {SCALE.filter((s) => s >= floor).map((s) => (
                        <span key={s} className="absolute right-0 flex -translate-y-1/2 items-center gap-1" style={{ top: `${100 - pos(s)}%` }}>
                          <span className="h-px w-1.5 bg-[color:var(--w-faint)]" />
                          {s === 0 ? "0" : `−${-s}`}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-1 justify-center gap-[5px]">
                    <div className="flex w-[7px]">{ladder(c.l, c.lh, segs)}</div>
                    <div className="flex w-[7px]">{ladder(c.r, c.rh, segs)}</div>
                  </div>
                </div>
                {showDetails && (
                <div className="grid grid-cols-2 gap-1 font-mono text-[10px] tabular-nums text-[color:var(--w-faint)]">
                  <span className="flex justify-between gap-1">
                    <span className="font-sans font-semibold text-[color:var(--w-muted)]">L</span>
                    {fmtDb(c.l)}
                  </span>
                  <span className="flex justify-between gap-1">
                    <span className="font-sans font-semibold text-[color:var(--w-muted)]">R</span>
                    {fmtDb(c.r)}
                  </span>
                </div>
                )}
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
