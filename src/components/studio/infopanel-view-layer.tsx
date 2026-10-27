/**
 * The zoom bar's InfoPanel view on a screen's page (decision Q10, sign-off round 2): the page as an export makes it,
 * drawn by InfoPanel's renderer. It is the export's own conversion (`convertView`, with each zone's choice as the
 * Convert dialog starts it): a recreated widget is a picture of it with its values as InfoPanel items on top, a
 * snapshot is a picture, a direct equivalent is its InfoPanel item, and a left-out widget is nothing. The converter
 * reads the zones as they are drawn, so the Studio drawing stays on the page under this layer, which covers it; the
 * badges, selection and handles stay above. It converts again when the page changes. Loaded only with the view on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modules } from "@/modules";
import type { SensorMap } from "@/modules/types";
import { useSensors } from "@/hooks/useSensors";
import { useNow } from "@/components/infopanel/CanvasZone";
import { ProfileView, useFonts, type AssetSource } from "@/components/infopanel/ProfileView";
import { getApiBase } from "@/lib/data-api";
import { useSensorCatalog } from "@/lib/catalog";
import { ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { canvasSensor, KeyHistory } from "@/lib/infopanel/canvas";
import { editKeyOf, editKeys } from "@/lib/infopanel/canvas-edit";
import { CONVERT_LOOK, withExportChoices } from "@/lib/infopanel/export/native-choices";
import { FontLoader } from "@/lib/infopanel/font-loader";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import { convertView } from "@/lib/infopanel/native/convert-view";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";

const titleOf = (id: string) => modules.find((m) => m.id === id)?.title ?? id;
/** The zones settle (fonts, lazy widgets, first values) before they are read; a change converts again after the same rest. */
const SETTLE_MS = 600;

export interface InfoPanelViewLayerProps {
  /** The studio's page (`data-studio-page`) and the grid the zones sit in, where this layer goes. */
  page: HTMLElement;
  grid: HTMLElement;
  /** The page's zoom (screen px per design px). */
  zoom: number;
  screen: MonitorProfile;
  storedPage: ProfilePage;
  /** The zones drawn on the page (the ones the export leaves out aren't). */
  placements: readonly Placement[];
}

interface Drawn {
  items: DisplayItem[];
  assets: AssetSource;
  urls: string[];
  /** The page's corner in the grid's px, and the page's size. */
  at: { x: number; y: number };
  size: { width: number; height: number };
}

/** "Name:Kind", a group's with its children's kinds: what the layer draws, top level, bottom first (`data-view-parts`). */
const partsOf = (items: readonly DisplayItem[]): string =>
  items.map((it) => `${it.Name}:${it.kind}${it.kind === "Group" ? `[${it.DisplayItems.map((k) => k.kind).join(",")}]` : ""}`).join("|");

export default function InfoPanelViewLayer({ page, grid, zoom, screen, storedPage, placements }: InfoPanelViewLayerProps) {
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // What it converts, as text: the studio hands new arrays on every render, and only a real change converts again.
  const what = JSON.stringify([placements, storedPage, screen.id]);
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  useEffect(() => {
    let gone = false;
    const timer = setTimeout(async () => {
      const zones = placements.filter((p) => p.visible).map((p) => withExportChoices(p, titleOf));
      const items = storedPage.placements.some((p) => p.module === ITEM_ID);
      const r = await convertView({ placements: zones, scope: page, sensors, look: CONVERT_LOOK, titleOf, ...(items ? { page: { screen, page: storedPage } } : {}) });
      if (gone) return;
      const urls: string[] = [];
      const assets = new Map(
        r.assets.map((f) => {
          const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: "image/png" }));
          urls.push(url);
          return [f.name.toLowerCase(), { hash: f.hash, url }] as const;
        }),
      );
      const g = grid.getBoundingClientRect();
      const p = page.getBoundingClientRect();
      const k = zoomNow.current;
      setDrawn({ items: r.items, assets, urls, at: { x: (p.left - g.left) / k, y: (p.top - g.top) / k }, size: r.size });
    }, SETTLE_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
    // `what` stands for the zones, page and screen; the sensors and zoom are read when it converts (the items read live
    // values, and the page's corner is in design px whatever the zoom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, page, grid]);
  // A drawing's picture URLs go with it.
  useEffect(() => () => drawn?.urls.forEach((u) => URL.revokeObjectURL(u)), [drawn]);
  return drawn ? <Drawing drawn={drawn} /> : null;
}

/** The converted items at the page's size, live values from the shared sensor store. */
function Drawing({ drawn }: { drawn: Drawn }) {
  const keys = useMemo(() => editKeys(drawn.items), [drawn.items]);
  const values = useSensors(keys) as SensorMap;
  const history = useMemo(() => new KeyHistory(), [drawn]);
  useMemo(() => history.record(keys, values), [history, keys, values]);
  const now = useNow();
  const fontLoader = useCallback(() => FontLoader.fetch(null, getApiBase()), []);
  const font = useFonts(drawn.items, fontLoader);
  const profile = useMemo(() => readStored(newStored({ name: "InfoPanel view", ...drawn.size })).profile, [drawn.size]);
  return (
    <div
      data-infopanel-view=""
      data-view-parts={partsOf(drawn.items)}
      data-shot-skip
      aria-hidden
      className="pointer-events-none absolute z-[14]"
      style={{ left: drawn.at.x, top: drawn.at.y, width: drawn.size.width, height: drawn.size.height }}
    >
      <ProfileView
        profile={profile}
        items={drawn.items}
        sensor={(item) => canvasSensor(item, editKeyOf(item as DisplayItem), values, (k) => history.get(k))}
        now={now}
        font={font}
        assets={drawn.assets}
      />
    </div>
  );
}
