import type { DragEvent } from "react";
import type { LibraryItem } from "@/lib/library";
import { recordCopy } from "@/lib/my-library/copies";
import { activeLibraryDrag, libraryDragKind, libraryDragOf, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { fileUrl } from "@/lib/my-library/model";
import {
  BACKGROUND_DEFAULTS,
  MAX_BLUR,
  type BackgroundFit,
  type BackgroundType,
  type PageBackground,
  withBackgroundType,
} from "@/lib/appearance";
import { AlignGrid } from "./align-grid";
import { ColorPill } from "./inspector/color-pill";
import { VideoFields } from "./background-video";
import { MediaField } from "./media-field";
import { InlineRow, SegmentedRow, SliderRow, StackRow } from "./setting-rows";

const TYPE_LABELS: Record<BackgroundType, string> = {
  none: "None",
  color: "Color",
  gradient: "Gradient",
  image: "Image",
  video: "Video",
};

const FITS: { value: BackgroundFit; label: string; title: string }[] = [
  { value: "cover", label: "Cover", title: "Fill the page, cropping the image" },
  { value: "contain", label: "Contain", title: "Show the whole image, letterboxed" },
  { value: "stretch", label: "Stretch", title: "Stretch to the page size" },
  { value: "center", label: "Center", title: "Natural size" },
  { value: "tile", label: "Tile", title: "Repeat at natural size" },
];
// A video can't repeat.
const VIDEO_FITS = FITS.filter((f) => f.value !== "tile");

interface BackgroundEditorProps {
  value: PageBackground;
  /** The types offered (a profile's own background has no "None" here). */
  types: BackgroundType[];
  onChange: (bg: PageBackground) => void;
  /** Where a dropped library image or video lands ("ARCv2 › Background"), for its copy count. */
  copyLabel?: string;
}

/** A My library image or video dragged onto the slot (spec §8): it becomes the background. */
function libraryMedia(e: DragEvent): LibraryItem | null {
  const drag = libraryDragOf((t) => e.dataTransfer.getData(t));
  const item = activeLibraryDrag();
  return drag && item?.id === drag.libraryItemId && (item.kind === "image" || item.kind === "video") ? item : null;
}

/** The fields of one background: type, then that type's options and effects. */
export function BackgroundEditor({ value, types, onChange, copyLabel = "Background" }: BackgroundEditorProps) {
  const patch = (p: Partial<PageBackground>) => onChange({ ...value, ...p });
  const gradient = value.gradient ?? BACKGROUND_DEFAULTS.gradient;
  const position = value.position ?? BACKGROUND_DEFAULTS.position;
  const fit = value.fit ?? BACKGROUND_DEFAULTS.fit;
  const isMedia = value.type === "image" || value.type === "video";
  const noun = value.type === "video" ? "video" : "image";
  return (
    <div
      className="space-y-2"
      onDragOver={(e) => {
        const k = libraryDragKind(e.dataTransfer.types);
        if ((k === "image" || k === "video") && types.includes(k)) e.preventDefault();
      }}
      onDrop={(e) => {
        const item = libraryMedia(e);
        if (!item || !types.includes(item.kind as BackgroundType)) return;
        e.preventDefault();
        e.stopPropagation();
        setActiveLibraryDrag(null);
        onChange({ ...value, type: item.kind as BackgroundType, src: fileUrl(item) });
        void recordCopy(item, { profileId: "*", label: copyLabel });
      }}
    >
      <SegmentedRow
        label="Type"
        options={types.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        value={value.type}
        onChange={(type) => onChange(withBackgroundType(value, type as BackgroundType))}
      />

      {value.type === "color" && (
        <ColorRow label="Color" value={value.color} fallback={BACKGROUND_DEFAULTS.color} onChange={(color) => patch({ color })} />
      )}

      {value.type === "gradient" && (
        <>
          <ColorRow label="From" value={gradient.from} onChange={(from) => patch({ gradient: { ...gradient, from } })} />
          <ColorRow label="To" value={gradient.to} onChange={(to) => patch({ gradient: { ...gradient, to } })} />
          <SliderRow
            label="Angle (°)"
            value={gradient.angle}
            min={0}
            max={359}
            fallback={0}
            onChange={(angle) => patch({ gradient: { ...gradient, angle } })}
          />
        </>
      )}

      {value.type === "image" && (
        <MediaField label="Image" kind="image" value={value.src} fill={value.color} onChange={(src) => patch({ src })} />
      )}
      {value.type === "video" && <VideoFields value={value} onPatch={patch} />}

      {isMedia && (
        <>
          <SegmentedRow
            label="Fit"
            options={value.type === "video" ? VIDEO_FITS : FITS}
            value={fit}
            onChange={(f) => patch({ fit: f as BackgroundFit })}
          />
          {fit !== "stretch" && (
            <StackRow label="Position">
              <AlignGrid
                label={`${noun === "video" ? "Video" : "Image"} position`}
                x={position.x}
                y={position.y}
                onChange={(x, y) =>
                  patch({
                    position: {
                      x: (x ?? "center") as "start" | "center" | "end",
                      y: (y ?? "center") as "start" | "center" | "end",
                    },
                  })
                }
              />
            </StackRow>
          )}
          <ColorRow
            label={`Fill (behind the ${noun})`}
            value={value.color}
            fallback={BACKGROUND_DEFAULTS.color}
            onChange={(color) => patch({ color })}
          />
        </>
      )}

      {(value.type === "gradient" || isMedia) && <Effects value={value} onPatch={patch} />}
    </div>
  );
}

/** Dim, tint and blur over the media. */
function Effects({ value, onPatch }: { value: PageBackground; onPatch: (p: Partial<PageBackground>) => void }) {
  return (
    <>
      <SliderRow label="Dim" unit="%" value={value.dim ?? 0} min={0} max={100} fallback={0} onChange={(dim) => onPatch({ dim })} />
      <ColorRow
        label="Tint"
        value={value.tint}
        fallback={BACKGROUND_DEFAULTS.tint}
        onChange={(tint) => onPatch({ tint, tintOpacity: value.tintOpacity || 30 })}
      />
      <SliderRow
        label="Tint opacity"
        unit="%"
        value={value.tintOpacity ?? 0}
        min={0}
        max={100}
        fallback={0}
        onChange={(tintOpacity) => onPatch({ tintOpacity })}
      />
      <SliderRow label="Blur" unit="px" value={value.blur ?? 0} min={0} max={MAX_BLUR} fallback={0} onChange={(blur) => onPatch({ blur })} />
    </>
  );
}

/** A 6-digit hex for the native picker (it can't show other syntaxes). */
function pickerHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : "#000000";
}

function ColorRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | undefined;
  /** Shown (and picked from) while unset. */
  fallback?: string;
  onChange: (color: string) => void;
}) {
  const shown = value ?? fallback ?? "#000000";
  return (
    <InlineRow label={label}>
      <ColorPill value={pickerHex(shown)} label={label} onChange={onChange} />
    </InlineRow>
  );
}
