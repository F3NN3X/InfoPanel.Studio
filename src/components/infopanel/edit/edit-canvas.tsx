/**
 * The canvas zone editor's drawing (spec §7): the profile at its own size, scaled to fit, items
 * in InfoPanel's draw order (native ones by the app's widgets), the edit layer over it and, when
 * Compare is on, InfoPanel's screenshot laid over the render with a difference blend.
 */
import { useCallback, useMemo, type DragEvent, type PointerEvent } from "react";
import { withDroppedImage } from "@/lib/infopanel/canvas-edit";
import { recordCopy } from "@/lib/my-library/copies";
import { activeLibraryDrag, libraryDragKind, libraryDragOf, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { droppedFileOf } from "@/lib/my-library/model";
import { useElementSize } from "@/hooks/use-element-size";
import { getApiBase } from "@/lib/data-api";
import { canvasSensor, fitScale, KeyHistory } from "@/lib/infopanel/canvas";
import { FontLoader } from "@/lib/infopanel/font-loader";
import type { ConvertContext } from "@/lib/infopanel/native/convert";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { SensorMap } from "@/modules/types";
import { useNow } from "../CanvasZone";
import { nativeLayer } from "../native";
import { useSuppliedFonts, withSupplied } from "../supplied-fonts";
import { ProfileView, useFonts, type AssetSource } from "../ProfileView";
import { EditLayer } from "./edit-layer";
import type { CanvasEditor } from "./use-canvas-editor";

/** Room around the profile, so handles and badges at its edges stay on screen. */
const PAD = 40;

export interface Compare {
  src: string;
  /** 0–1. */
  opacity: number;
}

interface EditCanvasProps {
  editor: CanvasEditor;
  /** The sensor mode's keys and values (`sensorView`). */
  ctx: ConvertContext;
  values: Record<string, DataApiValue>;
  showModes: boolean;
  /** The active profile: where the Library's "jump to copy" goes. */
  profileId: string;
  compare: Compare | null;
  /** A drop the canvas can't take, said to the user. */
  onRefused?: (message: string) => void;
  /** The screenshot would not load (a kept one whose file is gone). */
  onCompareFailed?: () => void;
}

export function EditCanvas({ editor, ctx, values, showModes, profileId, compare, onRefused, onCompareFailed }: EditCanvasProps) {
  const { ref, w, h } = useElementSize(true);
  const now = useNow();
  // A new history per sensor mode: mock and live samples never share a graph.
  const history = useMemo(() => new KeyHistory(), [ctx]);
  useMemo(() => history.record(Object.keys(values), values), [history, values]);
  const fontLoader = useCallback(() => FontLoader.fetch(null, getApiBase()), []);
  const font = withSupplied(useFonts(editor.items, fontLoader), useSuppliedFonts(editor.open.stored.fonts));
  const { open } = editor;
  const assets: AssetSource = useMemo(
    () => new Map([...open.assets].flatMap(([name, a]) => (a.url ? [[name, { hash: a.hash, url: a.url }] as const] : []))),
    [open],
  );
  const read = (key: string) => history.get(key);
  const native = nativeLayer(editor.items, ctx, values as SensorMap, { font, now, history: read });
  const { profile } = open;
  const scale = fitScale(profile, w - 2 * PAD, h - 2 * PAD);
  // A My library image, SVG or video dropped on the canvas becomes an Image item there (spec §8).
  const isMediaDrag = (types: readonly string[]) => {
    const k = libraryDragKind(types);
    return k === "image" || k === "svg" || k === "video";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const drag = libraryDragOf((t) => e.dataTransfer.getData(t));
    const item = activeLibraryDrag();
    if (!drag || !item || item.id !== drag.libraryItemId) return;
    e.preventDefault();
    setActiveLibraryDrag(null);
    const file = droppedFileOf(item);
    if (!file) return onRefused?.(`${item.name} can’t be drawn by InfoPanel`);
    const box = e.currentTarget.getBoundingClientRect();
    const at = { x: (e.clientX - box.left - (w - profile.Width * scale) / 2) / scale, y: (e.clientY - box.top - (h - profile.Height * scale) / 2) / scale };
    const r = withDroppedImage(open.stored, profile, editor.committed, file, at);
    editor.commitStored(r.stored, [r.path]);
    void recordCopy(item, { profileId, zoneId: editor.zone.id, itemPath: r.path, label: `${open.stored.source.name} › ${file.name}` });
  };
  // A press on the empty area around the profile clears the selection.
  const onBackground = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) editor.select([]);
  };
  return (
    <div
      ref={ref}
      onPointerDown={onBackground}
      onDragOver={(e) => {
        if (isMediaDrag(e.dataTransfer.types)) e.preventDefault();
      }}
      onDrop={onDrop}
      className="relative min-h-0 flex-1 overflow-hidden bg-ui-app"
    >
      {w > 0 && h > 0 && (
        <div
          style={{
            position: "absolute",
            left: (w - profile.Width * scale) / 2,
            top: (h - profile.Height * scale) / 2,
            width: profile.Width,
            height: profile.Height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <ProfileView
            profile={profile}
            items={editor.items}
            sensor={(item) => canvasSensor(item, ctx.keyOf(item), values, read)}
            now={now}
            font={font}
            assets={assets}
            hidden={native.hidden}
            native={native.elements}
            overlay={
              compare && compare.opacity > 0 ? (
                <img
                  src={compare.src}
                  alt="InfoPanel screenshot"
                  onError={onCompareFailed}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: compare.opacity, mixBlendMode: "difference", pointerEvents: "none" }}
                />
              ) : null
            }
            controls={<EditLayer editor={editor} profileWidth={profile.Width} showModes={showModes} />}
          />
        </div>
      )}
    </div>
  );
}
