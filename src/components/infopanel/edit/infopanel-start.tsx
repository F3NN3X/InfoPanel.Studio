/**
 * The InfoPanel home page, which the rail's InfoPanel button always shows: Continue editing (the open
 * document, one click back in), Create (Blank and the templates, each opening the New InfoPanel profile
 * page on that choice), every InfoPanel profile placed in the dashboard (a canvas zone, on any screen and
 * page) and the saved profiles in the Library that aren't placed here, as cards with live thumbnails; and Import.
 * Each card's ⋯ menu and right-click menu offer its actions.
 */
import { lazy, Suspense } from "react";
import { FileUp, MonitorCog, Pencil, Share } from "lucide-react";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { LibraryItem } from "@/lib/library";
import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";
import type { CardAction } from "../../studio/screens/card-actions";
import { aspectOf, Badge, CARD_BUTTON, ProfileCard } from "../../studio/screens/profile-card";
import { SavedCard } from "../../studio/screens/saved-card";
import { useSavedProfiles } from "../../studio/screens/use-saved-profiles";
import type { GalleryChoice } from "../template-gallery";
import { CanvasThumb } from "../profile-thumb";

/** The gallery and its template data load with the home page, never in the studio's first bundle. */
const TemplateGallery = lazy(() => import("../template-gallery").then((m) => ({ default: m.TemplateGallery })));

export interface CanvasPlace {
  profileId: string;
  pageId: string;
  zoneId: string;
  /** "ARCv2 › Page 1". */
  where: string;
  name: string;
  width: number;
  height: number;
  items: number;
  canvas: StoredCanvas;
}

/** Every canvas zone in the config, in screen then page order. */
export function canvasPlaces(config: Pick<DashboardConfig, "profiles">): CanvasPlace[] {
  return config.profiles.flatMap((p) =>
    p.pages.flatMap((pg) =>
      pg.placements.flatMap((z) =>
        z.module === CANVAS_ID && z.canvas
          ? [
              {
                profileId: p.id,
                pageId: pg.id,
                zoneId: z.id,
                where: p.pages.length > 1 ? `${p.name} › ${pg.name}` : p.name,
                name: String(z.canvas.profile.Name ?? z.canvas.source.name),
                width: Number(z.canvas.profile.Width) || 0,
                height: Number(z.canvas.profile.Height) || 0,
                items: z.canvas.items.length,
                canvas: z.canvas,
              },
            ]
          : [],
      ),
    ),
  );
}

interface InfoPanelStartProps {
  config: Pick<DashboardConfig, "profiles">;
  /** The open document, when there is one: it leads, with one click back into it. */
  current?: CanvasPlace;
  onContinue: () => void;
  onOpen: (place: CanvasPlace) => void;
  /** A Library profile with no zone here: place it and open it in the editor. */
  onOpenLibrary: (item: LibraryItem) => void;
  /** Blank, or a template card: the New InfoPanel profile page opens on it. */
  onNew: (choice?: GalleryChoice) => void;
  onImport: () => void;
  /** "Manage all screens": the Screens page, where delete and assignment live. */
  onManage: () => void;
  /** A profile card's "Export as .infopanel…" and "Show in Screens" (its screen selected there). */
  onExport?: (place: CanvasPlace) => void;
  onShowInScreens?: (place: CanvasPlace) => void;
}

const BUTTON = "inline-flex h-8 items-center gap-2 rounded-[8px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover";
const NO_CHOICE: GalleryChoice = { template: "", variant: "" };
const GRID = "mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

const counted = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

export function InfoPanelStart({ config, current, onContinue, onOpen, onOpenLibrary, onNew, onImport, onManage, onExport, onShowInScreens }: InfoPanelStartProps) {
  const places = canvasPlaces(config);
  /** A profile card's actions, for its ⋯ menu and its right-click menu; `open` is its click. */
  const placeActions = (c: CanvasPlace, open: CardAction): CardAction[] => [
    open,
    ...(onExport ? [{ id: "export", label: "Export as .infopanel…", icon: Share, run: () => onExport(c) }] : []),
    ...(onShowInScreens ? [{ id: "screens", label: "Show in Screens", icon: MonitorCog, run: () => onShowInScreens(c) }] : []),
  ];
  const savedApi = useSavedProfiles(config);
  const inLibrary = savedApi.saved;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ui-app font-ui" data-help-article="infopanel-editor">
      <div className="mx-auto w-full max-w-[920px] px-6 py-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold text-ui-1">InfoPanel editor</h1>
            <p className="mt-1.5 text-[12.5px] leading-snug text-ui-3">
              Build and edit profiles for InfoPanel itself: its own item kinds and sensor bindings, exported as an .infopanel file it imports.
            </p>
          </div>
          <button type="button" onClick={onImport} className={BUTTON}>
            <FileUp className="h-4 w-4" strokeWidth={1.75} />
            Import…
          </button>
        </div>
        {current && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold text-ui-1">Continue editing</h2>
            <ul className={GRID}>
              <ProfileCard
                name={current.name}
                detail={current.where === current.name ? "" : current.where}
                meta={`${current.width} × ${current.height} · ${counted(current.items)}`}
                aspect={aspectOf(current.width, current.height)}
                thumb={<CanvasThumb canvas={current.canvas} />}
                onClick={onContinue}
                label={`Continue editing ${current.name}`}
                actions={placeActions(current, { id: "open", label: "Continue editing", icon: Pencil, run: onContinue })}
                actionsLabel="Profile actions"
              />
            </ul>
          </>
        )}
        <h2 className="mt-8 text-[13px] font-semibold text-ui-1">Create</h2>
        <div className="mt-2">
          <Suspense fallback={<p className="text-[12.5px] text-ui-4">Loading templates…</p>}>
            <TemplateGallery launch choice={NO_CHOICE} onChoice={(c) => onNew(c.template === null ? undefined : c)} width={800} height={480} />
          </Suspense>
        </div>
        <div className="mt-8 flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold text-ui-1">In this dashboard</h2>
          <button type="button" onClick={onManage} className="rounded-sm text-[12px] text-ui-accent-text hover:underline">
            Manage all screens
          </button>
        </div>
        {places.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ui-4">No InfoPanel profiles yet. Make a new one, or import an .infopanel file.</p>
        ) : (
          <ul className={GRID}>
            {places.map((c) => (
              <ProfileCard
                key={c.zoneId}
                name={c.name}
                badges={<Badge tone="accent">InfoPanel</Badge>}
                detail={c.where === c.name ? "" : c.where}
                meta={`${c.width} × ${c.height} · ${counted(c.items)}`}
                aspect={aspectOf(c.width, c.height)}
                thumb={<CanvasThumb canvas={c.canvas} />}
                onClick={() => onOpen(c)}
                label={`Open ${c.name}`}
                actions={placeActions(c, { id: "open", label: "Open", icon: Pencil, run: () => onOpen(c) })}
                actionsLabel="Profile actions"
              >
                <button type="button" onClick={() => onOpen(c)} className={CARD_BUTTON}>
                  <Pencil className="h-3.5 w-3.5" />
                  Open
                </button>
              </ProfileCard>
            ))}
          </ul>
        )}
        {inLibrary.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold text-ui-1">In your Library</h2>
            <ul className={GRID}>
              {inLibrary.map((item) => (
                <SavedCard key={item.id} item={item} api={savedApi} action="Open" detail="Opens as a new screen" onOpen={() => onOpenLibrary(item)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
