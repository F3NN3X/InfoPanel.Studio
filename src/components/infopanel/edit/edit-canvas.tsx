/**
 * The canvas zone editor's drawing (spec §7): the profile at its own size, scaled to fit, items
 * in InfoPanel's draw order (native ones by the app's widgets), the edit layer over it and, when
 * Compare is on, InfoPanel's screenshot laid over the render with a difference blend.
 */
import { useCallback, useMemo, type PointerEvent } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import { getApiBase } from "@/lib/data-api";
import { canvasSensor, fitScale, KeyHistory } from "@/lib/infopanel/canvas";
import { FontLoader } from "@/lib/infopanel/font-loader";
import type { ConvertContext } from "@/lib/infopanel/native/convert";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { SensorMap } from "@/modules/types";
import { useNow } from "../CanvasZone";
import { nativeLayer } from "../native";
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
  compare: Compare | null;
}

export function EditCanvas({ editor, ctx, values, showModes, compare }: EditCanvasProps) {
  const { ref, w, h } = useElementSize();
  const now = useNow();
  // A new history per sensor mode: mock and live samples never share a graph.
  const history = useMemo(() => new KeyHistory(), [ctx]);
  useMemo(() => history.record(Object.keys(values), values), [history, values]);
  const fontLoader = useCallback(() => FontLoader.fetch(null, getApiBase()), []);
  const font = useFonts(editor.items, fontLoader);
  const { open } = editor;
  const assets: AssetSource = useMemo(
    () => new Map([...open.assets].flatMap(([name, a]) => (a.url ? [[name, { hash: a.hash, url: a.url }] as const] : []))),
    [open],
  );
  const read = (key: string) => history.get(key);
  const native = nativeLayer(editor.items, ctx, values as SensorMap, { font, now, history: read });
  const { profile } = open;
  const scale = fitScale(profile, w - 2 * PAD, h - 2 * PAD);
  // A press on the empty area around the profile clears the selection.
  const onBackground = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) editor.select([]);
  };
  return (
    <div ref={ref} onPointerDown={onBackground} className="relative min-h-0 flex-1 overflow-hidden bg-ui-app">
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
