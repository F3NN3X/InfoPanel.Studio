import type { PageBackground } from "@/lib/appearance";
import { MediaField } from "./media-field";
import { SegmentedRow, ToggleRow } from "./setting-rows";

const RATES = ["0.5", "0.75", "1", "1.25", "1.5", "2"].map((r) => ({ value: r, label: `${r}×` }));

interface VideoFieldsProps {
  value: PageBackground;
  onPatch: (p: Partial<PageBackground>) => void;
  onOpenLibrary?: () => void;
}

/** A video background's source, poster and playback, with a performance hint. */
export function VideoFields({ value, onPatch, onOpenLibrary }: VideoFieldsProps) {
  const rate = String(value.rate ?? 1);
  return (
    <>
      <MediaField label="Video" kind="video" value={value.src} fill={value.color} onChange={(src) => onPatch({ src })} backgrounds onOpenLibrary={onOpenLibrary} />
      <MediaField
        label="Poster image"
        kind="image"
        value={value.poster}
        fill={value.color}
        onChange={(poster) => onPatch({ poster })}
      />
      <ToggleRow label="Loop" value={value.loop ?? true} onChange={(loop) => onPatch({ loop })} />
      <ToggleRow label="Muted" value={value.muted ?? true} onChange={(muted) => onPatch({ muted })} />
      <SegmentedRow
        label="Speed"
        options={RATES.some((r) => r.value === rate) ? RATES : [...RATES, { value: rate, label: `${rate}×` }]}
        value={rate}
        onChange={(r) => onPatch({ rate: Number(r) })}
      />
      <p className="text-[11px] leading-relaxed text-ui-4">
        The poster shows until the video plays, and in its place on reduced motion. The kiosk plays this
        around the clock: use H.264 MP4 or VP9 WebM at the display&apos;s resolution and 24–30 fps. Blur
        over a video re-composites every frame, so keep it low or off. With sound on, the browser may
        still start it muted.
      </p>
    </>
  );
}
