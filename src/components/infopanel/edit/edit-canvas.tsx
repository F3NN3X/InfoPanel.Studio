/**
 * The canvas zone editor's drawing (spec §7): the profile at its own size, scaled to fit, items
 * in InfoPanel's draw order (native ones by the app's widgets), the edit layer over it and, when
 * Compare is on, InfoPanel's screenshot laid over the render with a difference blend. A kind
 * dragged from the Add palette is created where it is dropped, snapped as a move would be.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import type { Appearance } from "@/lib/style-resolve";
import type { PageGrid } from "@/lib/page-model/model";
import { DND_MIME, DND_MIME_PANEL, DND_MIME_SETTINGS } from "@/components/studio/studio-modules";
import { withDroppedImage, type DropPlace } from "@/lib/infopanel/canvas-edit";
import { profilePoint } from "@/lib/infopanel/editor/arrange";
import { snapMove, snapThreshold } from "@/lib/infopanel/editor/snap";
import { recordCopy } from "@/lib/my-library/copies";
import { activeLibraryDrag, libraryDragKind, libraryDragOf, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { isComponent } from "@/lib/my-library/component-meta";
import { droppedFileOf } from "@/lib/my-library/model";
import type { LibraryItem } from "@/lib/library";
import { useElementSize } from "@/hooks/use-element-size";
import { getApiBase } from "@/lib/data-api";
import { canvasSensor, fitScale, KeyHistory } from "@/lib/infopanel/canvas";
import { FontLoader } from "@/lib/infopanel/font-loader";
import type { ConvertContext } from "@/lib/infopanel/native/convert";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { SensorMap } from "@/modules/types";
import { RulerLabels } from "@/components/studio/rulers";
import { stepZoom } from "@/components/studio/studio-layout";
import { ZoomToolbar } from "@/components/studio/zoom-toolbar";
import { AltHint } from "@/components/studio/alt-hint";
import { useNow, widgetDrawer } from "../CanvasZone";
import { nativeLayer } from "../native";
import { useSuppliedFonts, withSupplied } from "../supplied-fonts";
import { ProfileView, useFonts, type AssetSource } from "../ProfileView";
import { PALETTE_DRAG, paletteEntryOf, type AddEntry } from "./add-palette";
import { EditLayer, measureTargets } from "./edit-layer";
import type { CanvasEditor } from "./use-canvas-editor";

/** Room around the profile, so handles and badges at its edges stay on screen. */
const PAD = 40;
type ProfileSize = Parameters<typeof ZoomToolbar>[0]["profile"];

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
  /** A kind dragged from the Add palette and dropped: where, with the snapping to apply to its box. */
  onPlace?: (entry: AddEntry, place: DropPlace) => void;
  /** A Library component dropped at a point (profile pixels): the editor merges it. */
  onComponent?: (item: LibraryItem, at: { x: number; y: number }) => void;
  /** The size button on the zoom bar: show the profile's own settings. */
  onOpenSettings: () => void;
  /** Studio widget items (one-editor SPEC §9): their live values, the theme they follow, and the screen's own theme colours. */
  widgets?: { sensors: SensorMap; appearance?: Appearance; scope?: CSSProperties };
  /** A Studio widget dragged from the Add panel and dropped: its module, the settings its view adds, and the point. */
  onPlaceWidget?: (drop: WidgetDrop, at: { x: number; y: number }) => void;
  /** The page's grid over the profile (an imported profile, Edit v3 SPEC §3.7): its cells, and where widgets sit. */
  grid?: PageGrid;
  /** Items snap while dragging (the page's Snap items); unset = true. */
  snapItems?: boolean;
}

/** What a widget dragged from the Add panel carries. */
export interface WidgetDrop {
  kind: "module" | "panel";
  id: string;
  settings?: Record<string, string | number | boolean>;
}

/** The widget a drag from the Add panel carries (studio-modules' drag types), or null. */
export function widgetDropOf(get: (type: string) => string): WidgetDrop | null {
  const panel = get(DND_MIME_PANEL);
  if (panel) return { kind: "panel", id: panel };
  const id = get(DND_MIME);
  if (!id) return null;
  try {
    const raw = get(DND_MIME_SETTINGS);
    const settings: unknown = raw ? JSON.parse(raw) : undefined;
    return settings && typeof settings === "object" && !Array.isArray(settings) ? { kind: "module", id, settings: settings as WidgetDrop["settings"] } : { kind: "module", id };
  } catch {
    return { kind: "module", id };
  }
}

export function EditCanvas({ editor, ctx, values, showModes, profileId, compare, onRefused, onCompareFailed, onPlace, onComponent, onOpenSettings, widgets, onPlaceWidget, grid, snapItems }: EditCanvasProps) {
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
  const native = nativeLayer(editor.items, ctx, values as SensorMap, { font, now, history: read, ...(widgets ? { widget: widgetDrawer(widgets.sensors, widgets.appearance, true) } : {}) });
  const { profile } = open;
  // The zoom follows the fit until a manual one is set; the wheel then pans.
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showRulers, setShowRulers] = useState(true);
  /** A drag holding Alt (Edit v3 SPEC §7.3): the hint at the top of the canvas. */
  const [altHint, setAltHint] = useState<{ widget: boolean } | null>(null);
  const scale = zoom ?? fitScale(profile, w - 2 * PAD, h - 2 * PAD);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onFit = () => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
  };
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Advance the ref too: several wheel events can land before a render.
      scaleRef.current = stepZoom(scaleRef.current, e.deltaY < 0 ? 1 : -1);
      setZoom(scaleRef.current);
    } else if (zoom !== null) {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheel.current(e);
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [ref]);
  // A My library image, SVG or video dropped on the canvas becomes an Image item there (spec §8).
  const isMediaDrag = (types: readonly string[]) => {
    const k = libraryDragKind(types);
    const active = activeLibraryDrag();
    return k === "image" || k === "svg" || k === "video" || (k === "canvas" && !!onComponent && !!active && isComponent(active));
  };
  const pointOf = (e: DragEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return profilePoint({ x: e.clientX, y: e.clientY }, { left: box.left + pan.x, top: box.top + pan.y, width: w, height: h }, profile, scale);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const widget = onPlaceWidget ? widgetDropOf((t) => e.dataTransfer.getData(t)) : null;
    if (widget) {
      e.preventDefault();
      return onPlaceWidget?.(widget, pointOf(e));
    }
    const kind = paletteEntryOf(e.dataTransfer.getData(PALETTE_DRAG));
    if (kind) {
      e.preventDefault();
      const layer = e.currentTarget.querySelector<HTMLElement>("[data-canvas-edit-layer]");
      const root = layer?.parentElement;
      const k = 1 / scale;
      const targets = layer && root ? measureTargets(root, layer, editor.committed, profile, [], k) : null;
      const threshold = snapThreshold(k, e.altKey);
      return onPlace?.(kind, { at: pointOf(e), ...(targets ? { snap: (b) => snapMove(b, targets, threshold) } : {}) });
    }
    const drag = libraryDragOf((t) => e.dataTransfer.getData(t));
    const item = activeLibraryDrag();
    if (!drag || !item || item.id !== drag.libraryItemId) return;
    e.preventDefault();
    setActiveLibraryDrag(null);
    if (isComponent(item)) return onComponent?.(item, pointOf(e));
    const file = droppedFileOf(item);
    if (!file) return onRefused?.(`${item.name} can’t be drawn by InfoPanel`);
    const r = withDroppedImage(open.stored, profile, editor.committed, file, pointOf(e));
    editor.commitStored(r.stored, [r.path]);
    void recordCopy(item, { profileId, zoneId: editor.zone.id, itemPath: r.path, label: `${open.stored.source.name} › ${file.name}` });
  };
  // A press on the empty area around the profile clears the selection.
  const onBackground = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) editor.select([]);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onPointerDown={onBackground}
        onDragOver={(e) => {
          const types = e.dataTransfer.types;
          const widget = onPlaceWidget && (types.includes(DND_MIME) || types.includes(DND_MIME_PANEL));
          if (isMediaDrag(types) || (onPlace && types.includes(PALETTE_DRAG)) || widget) e.preventDefault();
        }}
        onDrop={onDrop}
        className="relative min-h-0 flex-1 overflow-hidden bg-ui-app"
      >
        {altHint && <AltHint widget={altHint.widget} className="absolute left-1/2 top-3 z-40 -translate-x-1/2" />}
        {w > 0 && h > 0 && (
          <div
            style={{
              position: "absolute",
              left: (w - profile.Width * scale) / 2 + pan.x,
              top: (h - profile.Height * scale) / 2 + pan.y,
              width: profile.Width,
              height: profile.Height,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              ...widgets?.scope,
            }}
          >
            {showRulers && <RulerLabels width={profile.Width} height={profile.Height} />}
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
              controls={<EditLayer editor={editor} profileWidth={profile.Width} profileHeight={profile.Height} showModes={showModes} grid={grid} snapItems={snapItems} onAltDrag={setAltHint} />}
            />
          </div>
        )}
      </div>
      <div className="relative h-11 shrink-0 border-t border-ui-subtle bg-ui-panel">
        <ZoomToolbar
          zoom={scale}
          fitting={zoom === null}
          showRulers={showRulers}
          onToggleRulers={() => setShowRulers((on) => !on)}
          onZoomStep={(dir) => setZoom(stepZoom(scaleRef.current, dir))}
          onFit={onFit}
          profile={{ width: profile.Width, height: profile.Height } as ProfileSize}
          onOpenProfile={onOpenSettings}
          sizeTitle="Profile size, background and fonts"
          bottom={4}
          snapItems={grid ? snapItems !== false : undefined}
        />
      </div>
    </div>
  );
}
