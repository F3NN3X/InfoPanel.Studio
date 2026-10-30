import { useRef, type ReactNode } from "react";
import { obsAct, obsRefusal } from "@/lib/obs-control";
import { READ_ONLY_HINT } from "@/lib/write-refusal";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, fmt, clamp, Icon, Chip, Dot, Num, Spark, Empty, useHistory, hue, STATE, type ShellProps } from "./kit";
import { ReadOnly } from "./ReadOnly";
import { clock, GAP, planTiles } from "./StreamControl/layout";
import { useExtras, useInStudio, useNow } from "./time-hooks";
import { meta } from "./meta/StreamControl";

export { meta };

export interface StreamControlProps extends ShellProps {
  look?: ModuleSettings;
  /** The mic tile (needs a mic input set under Settings › Connections). Default on. */
  showMic?: boolean;
  /** The replay tile (needs OBS's replay buffer). Default on. */
  showReplay?: boolean;
}

/** The scenes' tints: the accent turned by these degrees, in order. */
const SCENE_HUES = [0, 95, -75, -115, 40, -150];

const tint = (c: string, p = 16) => `color-mix(in oklab, ${c} ${p}%, transparent)`;

/**
 * The seconds on air, ticking each second between the server's readings (they come every 2 s, which would make the timer
 * jump): the last reading plus the time since it arrived.
 */
function useUptime(streaming: boolean, reading: number): number {
  const seen = useRef({ reading: -1, at: 0 });
  if (seen.current.reading !== reading) seen.current = { reading, at: Date.now() };
  const now = useNow(1000, streaming);
  return streaming ? reading + Math.max(0, Math.floor((now - seen.current.at) / 1000)) : 0;
}

function Badge({ icon, color }: { icon: string; color: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(color), color }}>
      <Icon name={icon} className="text-[17px]" />
    </span>
  );
}

interface TileProps {
  onClick?: () => void;
  active?: boolean;
  radius: number | string;
  span?: number;
  label?: string;
  children: ReactNode;
}

function Tile({ onClick, active, radius, span = 1, label, children }: TileProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={label}
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white/[0.04] p-2.5 text-left ${onClick ? "transition hover:bg-white/[0.07] active:scale-[0.97]" : ""}`}
      style={{ gridColumn: `span ${span}`, borderRadius: radius, boxShadow: active ? "inset 0 0 0 2px rgba(255,255,255,.92)" : "inset 0 0 0 1px rgba(255,255,255,.05)" }}
    >
      {children}
    </Tag>
  );
}

export default function StreamControl(p: StreamControlProps) {
  const extras = useExtras();
  const obs = extras.obs;
  const studio = useInStudio();
  const readOnly = obsRefusal.use();
  const up = obs.connected;
  const live = obs.streaming;
  const uptime = useUptime(live, obs.uptime);
  const mic = obs.mic;
  const muted = mic?.muted === true;
  const tw = extras.twitch?.signedIn ? extras.twitch.viewers : undefined;
  const yt = extras.youtube?.signedIn ? extras.youtube.viewers : undefined;
  const total = (tw ?? 0) + (yt ?? 0);
  const vHist = useHistory(live ? total : 0, 48, 1);
  const mHist = useHistory(muted || !mic ? 0 : mic.level, 24, 0.6);
  const scenes = obs.scenes.map((s, i) => ({ ...s, i, icon: s.icon || "movie", color: hue(SCENE_HUES[i % SCENE_HUES.length]) }));
  const showMic = p.showMic !== false && mic !== null;
  const showReplay = p.showReplay !== false && obs.replay !== null;
  const viewers =
    tw !== undefined && yt !== undefined ? (
      <>
        <span className="text-zinc-500">TW</span> {fmt(tw)} <span className="text-zinc-500">· YT</span> {fmt(yt)}
      </>
    ) : total > 0 ? (
      <>
        {fmt(total)} <span className="text-zinc-500">watching</span>
      </>
    ) : null;
  // The tile's corner follows the shell's.
  const radius = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
  const curName = scenes.find((s) => s.id === obs.currentScene)?.name ?? "";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "OBS Studio"}
      icon="videocam"
      right={
        !up ? (
          <Chip>
            <Dot ok={false} />
            Offline
          </Chip>
        ) : readOnly ? (
          <Chip>{READ_ONLY_HINT}</Chip>
        ) : live && obs.kbps > 0 ? (
          <Chip>
            {fmt(obs.kbps)} kbps · {fmt(obs.fps)} fps
          </Chip>
        ) : null
      }
      compact={{ label: live ? "Live" : "Offline", value: live ? clock(uptime) : "–", sub: total ? `${fmt(total)} watching` : curName, icon: "videocam", hist: vHist, kind: "spark", t: live ? "ok" : undefined }}
    >
      {({ w, h }) => {
        if (!up && !scenes.length)
          return (
            <Empty
              icon="videocam_off"
              label={
                <span className="flex flex-col items-center gap-0.5 text-center">
                  <span>OBS not connected</span>
                  {studio && !obs.configured && <span className="text-[10.5px] opacity-70">Connect OBS under Settings › Connections</span>}
                </span>
              }
            />
          );
        const { cols, rows, cells, colW, tileH } = planTiles({ w, h, scenes, current: obs.currentScene, showMic, showReplay });
        const liveSpan = cells.find((c) => c.kind === "live")?.span ?? 1;
        const fs = clamp(Math.min((colW * liveSpan + GAP) / 5, tileH * 0.34), 16, 64);
        const act = up ? obsAct : undefined;
        return (
          <ReadOnly on={readOnly}>
          <div className="grid h-full" style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`, gridAutoFlow: "row dense" }}>
            {cells.map((cell) => {
              if (cell.kind === "live")
                return (
                  <Tile key="live" span={cell.span} radius={radius}>
                    <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: live ? STATE.crit : "#52525b", boxShadow: live ? `0 0 6px ${STATE.crit}` : "none" }} />
                      {live ? "Live" : up ? "Offline" : "Not connected"}
                      {obs.recording && <span className="text-zinc-500">· Rec</span>}
                      {viewers && colW * cell.span > 200 && <span className="ml-auto truncate text-[11px] normal-case tracking-normal tabular-nums text-zinc-200">{viewers}</span>}
                    </div>
                    <Num className="mt-1.5 block leading-none tracking-tight" style={{ fontSize: fs }}>
                      {live ? clock(uptime) : "0:00:00"}
                    </Num>
                    {tileH > 100 && (
                      <div className="mt-2 min-h-0 flex-1">
                        <Spark values={vHist} graph="bars" fill={false} min={0} className="h-full" />
                      </div>
                    )}
                  </Tile>
                );
              if (cell.kind === "mic")
                return (
                  <Tile key="mic" radius={radius} onClick={act && (() => void act({ op: "mic" }))} label={muted ? "Unmute mic" : "Mute mic"}>
                    <div className="flex items-start justify-between gap-2">
                      <Badge icon={muted ? "mic_off" : "mic"} color={muted ? STATE.crit : hue(-75)} />
                      {muted && (
                        <span className="rounded px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.1em]" style={{ background: tint(STATE.crit, 20), color: STATE.crit }}>
                          Muted
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex min-w-0 flex-col gap-1.5 pt-2">
                      {tileH > 100 && (
                        <div className="h-5 w-full">
                          <Spark values={mHist} graph="bars" fill={false} min={0} max={100} color={muted ? "#52525b" : hue(-75)} className="h-full" />
                        </div>
                      )}
                      <div className="truncate text-[14px] font-semibold leading-tight">{muted ? "Mic off" : "Mic"}</div>
                    </div>
                  </Tile>
                );
              if (cell.kind === "replay")
                return (
                  <Tile key="replay" radius={radius} onClick={act && (() => void act({ op: "replay" }))} label="Save replay">
                    <Badge icon="replay" color={hue(0)} />
                    <div className="mt-auto min-w-0 pt-2">
                      <div className="truncate text-[14px] font-semibold leading-tight">Replay</div>
                      {tileH > 96 && <div className="mt-0.5 truncate text-[10.5px] text-zinc-500">{obs.replay?.active ? "Save clip" : "Buffer off"}</div>}
                    </div>
                  </Tile>
                );
              const s = scenes[cell.scene.i];
              const on = s.id === obs.currentScene;
              return (
                <Tile key={s.id} radius={radius} active={on} onClick={act && (() => void act({ op: "scene", id: s.id }))} label={s.name}>
                  <div className="flex items-start justify-between gap-2">
                    <Badge icon={s.icon} color={s.color} />
                    {on && live && <span className="whitespace-nowrap rounded bg-white px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-950">On air</span>}
                  </div>
                  <div className="mt-auto min-w-0 pt-2">
                    <div className="line-clamp-2 text-[14px] font-semibold leading-tight">{s.name}</div>
                    {s.sub && tileH > 96 && <div className="mt-0.5 truncate text-[10.5px] text-zinc-500">{s.sub}</div>}
                  </div>
                </Tile>
              );
            })}
          </div>
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
