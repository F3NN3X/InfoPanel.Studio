import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, Chip, Empty, Metric, Spark, Stat, roomy, useHistory, type ShellProps } from "../kit";
import { meta } from "./meta";
import { PORT_DEFAULT, STATUS_WORD, statusOf, targetPrefix, toneOf } from "./target";

export { meta };

export interface PingProps extends ShellProps {
  look?: ModuleSettings;
  /** The host the server checks; empty = none set yet. */
  host?: string;
  port?: number;
  /** Replaces the host as the title. */
  name?: string;
  /** An answer at this many ms or more reads Slow (a warning), at `critMs` or more Critical. */
  warnMs?: number;
  critMs?: number;
}

export default function Ping(p: PingProps) {
  const host = p.host?.trim() ?? "";
  const prefix = targetPrefix(host, p.port ?? PORT_DEFAULT);
  const d = p.data;
  const ms = num(get(d, `${prefix}ms`));
  const hist = useHistory(prefix ? ms : Number.NaN, 48, 1);
  const warn = p.warnMs ?? 100;
  const status = statusOf(get(d, `${prefix}status`), ms, warn);
  const tone = toneOf(status, ms, p.critMs ?? 250);
  const word = STATUS_WORD[status];
  const shown = Number.isFinite(ms) ? fmt(ms, ms < 10 ? 1 : 0) : "–";
  const title = p.name || host || "Ping";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? title}
      icon="network_check"
      right={prefix ? <Chip>{word}</Chip> : undefined}
      compact={{ label: title, value: shown, unit: Number.isFinite(ms) ? "ms" : undefined, sub: prefix ? word : "No host set", hist, min: 0, kind: "spark", t: tone, icon: "network_check" }}
    >
      {({ size, outerW, outerH }) => {
        if (!prefix) return <Empty icon="network_check" label="No host set" hint="Type a host in the widget's options" />;
        const big = roomy(outerW, outerH);
        const stats = size === "lg" || big;
        return (
          <div className="flex h-full min-w-0 flex-col justify-center gap-2">
            <Metric label={size === "xs" ? undefined : "Round trip"} value={shown} unit={Number.isFinite(ms) ? "ms" : undefined} t={tone} scale={size === "xs" ? "md" : "lg"} sub={size === "xs" ? word : undefined} />
            {size !== "xs" && size !== "sm" && <Spark values={hist} min={0} className="min-h-6 flex-1" />}
            {stats && (
              <div className="grid grid-cols-3 gap-3 border-t border-[color:var(--w-track)] pt-2.5">
                <Stat label="Average" value={fmt(num(get(d, `${prefix}avg`)), 0)} unit="ms" />
                <Stat label="Jitter" value={fmt(num(get(d, `${prefix}jitter`)), 1)} unit="ms" />
                <Stat label="Loss" value={fmt(num(get(d, `${prefix}loss`)), 0)} unit="%" />
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
