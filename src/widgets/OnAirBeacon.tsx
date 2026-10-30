import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, Num, TONES, type ShellProps } from "./kit";
import { elapsedText, ON_AIR_LABEL, onAirKind, type OnAirKind } from "./OnAir/state";
import { useExtras, useInStudio, useNow, useSince } from "./time-hooks";
import { meta } from "./meta/OnAirBeacon";

export { meta };

export interface OnAirBeaconProps extends ShellProps {
  look?: ModuleSettings;
  showElapsed?: boolean;
  /** Count seconds (ticks once a second while on air); off counts minutes. */
  seconds?: boolean;
  /** "" = the theme's Critical (live) and Warning (recording). */
  liveColor?: string;
  recColor?: string;
}

const colorOf = (kind: OnAirKind, live?: string, rec?: string): string =>
  kind === "live" || kind === "both" ? live || TONES.crit : kind === "rec" ? rec || TONES.warn : "var(--w-faint)";

export default function OnAirBeacon(p: OnAirBeaconProps) {
  const obs = useExtras().obs;
  const studio = useInStudio();
  const kind = onAirKind(obs);
  const onAir = kind === "live" || kind === "rec" || kind === "both";
  const streamSince = useSince(obs.connected && obs.streaming);
  const recSince = useSince(obs.connected && obs.recording);
  const secs = p.seconds === true;
  const now = useNow(secs ? 1000 : 60_000, onAir && p.showElapsed !== false);
  const since = kind === "rec" ? recSince : streamSince;
  const elapsed = onAir && p.showElapsed !== false ? elapsedText(now - (since ?? now), secs) : "";
  const recSub = kind === "both" ? `REC ${elapsedText(now - (recSince ?? now), secs)}` : "";
  const label = ON_AIR_LABEL[kind];
  const color = colorOf(kind, p.liveColor, p.recColor);

  return (
    <Widget {...shell(p)} title={p.title ?? "On air"} icon="sensors" showHeader={p.showHeader}>
      {({ w, h }) => {
        if (kind === "unset" && studio)
          return (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[color:var(--w-muted)]">
              <Icon name="sensors_off" className="text-xl" />
              <span className="text-xs">OBS isn't set up. Connect it under Settings › Connections.</span>
            </div>
          );
        const wide = w >= h * 2.2;
        const text = Math.max(14, Math.min(h * (wide ? 0.46 : 0.26), (w - (wide ? h * 0.7 : 0)) / (label.length * 0.66)));
        const dot = Math.max(10, Math.min(text * 0.7, h * 0.3));
        const sub = Math.max(11, text * 0.36);
        return (
          <div className={`flex h-full min-w-0 items-center justify-center ${wide ? "gap-3" : "flex-col gap-2"}`} style={{ color }}>
            <span className="relative shrink-0" style={{ width: dot, height: dot }}>
              {onAir && <span className="wp-onair-halo absolute inset-0 rounded-full" style={{ background: color }} />}
              <span className="absolute inset-0 rounded-full" style={{ background: onAir ? color : "transparent", border: onAir ? "none" : `2px solid ${color}` }} />
            </span>
            <div className={`flex min-w-0 flex-col ${wide ? "items-start" : "items-center"} leading-none`}>
              <span className="whitespace-nowrap font-bold tracking-wide" style={{ fontSize: text }}>
                {label}
              </span>
              {elapsed && h >= 54 && (
                <Num className="mt-1 whitespace-nowrap" weight={500} style={{ fontSize: sub, color: "var(--w-muted)" }}>
                  {elapsed}
                </Num>
              )}
              {recSub && h >= 90 && (
                <Num className="mt-0.5 whitespace-nowrap" weight={500} style={{ fontSize: sub * 0.85, color: "var(--w-faint)" }}>
                  {recSub}
                </Num>
              )}
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
