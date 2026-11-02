// Media progress: the bar, wave or inline visualiser under a track (NowPlaying, GameSpotlight combo).
// The visualiser is one <AudioViz>, fed by the AudioMeter plugin (spectrum, else level) or, per
// pinned device, by Web Audio capture.
import { Bar } from "./primitives";
import type { Data } from "./types";
import { AudioViz } from "./viz/AudioViz";
import { resolveLook, type VizLook, type VizStyle } from "./viz/types";
import { useVizInput } from "./viz/use-viz-input";

export type MediaProgressMode = "bar" | "wave" | "visualizer";

export interface MediaProgressProps {
  mode?: MediaProgressMode;
  /** Track progress, 0–100. */
  pct: number;
  /** The sensor data the visualiser reads (the AudioMeter plugin). */
  data?: Data;
  /** The resolved audio-level-meter container; default `default-audio`. */
  device?: string;
  vizMode?: VizStyle;
  vizLook?: Partial<VizLook>;
  /** False treats the plugin as silent (the media is paused). */
  playing?: boolean;
  /** Height class of the visualiser. */
  className?: string;
  /** Class of the bar / wave meter; default `h-1` (bar) or `h-2.5` (wave). */
  barClassName?: string;
  /** Pinned Web Audio capture devices: one labelled live row each, in place of the plugin row. */
  captureDevices?: string[];
}

interface RowProps {
  data: Data;
  device: string;
  style: VizStyle;
  look: VizLook;
  muted: boolean;
  className: string;
}

/** The plugin row: the device's real spectrum (or level), shaped and eased. */
function PluginRow({ data, device, style, look, muted, className }: RowProps) {
  const { get } = useVizInput({ data, device, look, muted });
  return <AudioViz style={style} look={look} input={get} className={className} aria-label="Live audio" />;
}

/** One pinned capture device: its own real-time Web Audio capture, labelled; a failed capture shows a note. */
function CaptureRow({ deviceId, data, device, style, look, className }: RowProps & { deviceId: string }) {
  const { get, capture } = useVizInput({ data, device, captureDeviceId: deviceId, look });
  const name = capture.label || deviceId;
  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-24 shrink-0 truncate text-micro font-medium tracking-wide text-[color:var(--w-muted)]" title={name}>
        {name}
      </span>
      {capture.status === "error" || capture.status === "blocked" ? (
        <span className="min-w-0 flex-1 truncate text-micro text-[color:var(--w-faint)]" title={capture.error}>
          {capture.error ?? "capture unavailable"}
        </span>
      ) : (
        <AudioViz style={style} look={look} input={get} className={`min-w-0 flex-1 ${className}`} aria-label={`Live audio: ${name}`} />
      )}
    </div>
  );
}

export function MediaProgress({ mode = "bar", pct, data = {}, device = "default-audio", vizMode = "bars", vizLook, playing, className = "h-6", barClassName, captureDevices }: MediaProgressProps) {
  if (mode === "visualizer") {
    const row = { data, device, style: vizMode, look: resolveLook(vizLook), muted: playing === false, className };
    if (captureDevices?.length)
      return (
        <div className="flex w-full flex-col gap-1.5">
          {captureDevices.map((id) => (
            <CaptureRow key={id} deviceId={id} {...row} muted={false} />
          ))}
        </div>
      );
    return <PluginRow {...row} />;
  }
  const wave = mode === "wave";
  return <Bar value={pct} style={wave ? "wave" : undefined} className={barClassName ?? (wave ? "h-2.5" : "h-1")} />;
}
