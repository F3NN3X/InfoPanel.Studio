/**
 * The InfoPanel home page, which the rail's InfoPanel button always shows: Continue editing (the open
 * document, one click back in), Create (Blank and the templates, each opening the New InfoPanel profile
 * dialog on that choice), every InfoPanel profile placed in the dashboard (a canvas zone, on any screen and
 * page) and the saved profiles in the Library that aren't placed here, as cards with live thumbnails; and Import.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Copy, FileUp, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { createLibraryItem, listLibrary, type LibraryItem } from "@/lib/library";
import { canvasData, canvasItem, copyOfProfile, unplacedProfiles } from "@/lib/my-library/canvas-link";
import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";
import type { GalleryChoice } from "../template-gallery";
import { CanvasThumb, ProfileThumb } from "../profile-thumb";

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
  /** Blank, or a template card: the New InfoPanel profile dialog opens on it. */
  onNew: (choice?: GalleryChoice) => void;
  onImport: () => void;
}

const BUTTON = "inline-flex h-8 items-center gap-2 rounded-[8px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover";
const CARD = "flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-ui-default bg-ui-panel";
const LINK = "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1";
const NO_CHOICE: GalleryChoice = { template: "", variant: "" };

/** The strip a profile is drawn in: its own shape, within 3:1 to 1:1. */
const aspectOf = (width: number, height: number) => Math.min(3, Math.max(1, width && height ? width / height : 1.6));
const counted = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

interface ProfileCardProps {
  name: string;
  detail: string;
  size: string;
  aspect: number;
  thumb: ReactNode;
  onOpen: () => void;
  openLabel: string;
  children?: ReactNode;
}

function ProfileCard({ name, detail, size, aspect, thumb, onOpen, openLabel, children }: ProfileCardProps) {
  return (
    <li className={CARD}>
      <button type="button" aria-label={`${openLabel} ${name}`} onClick={onOpen} className="flex min-w-0 flex-col text-left outline-none hover:bg-ui-hover focus-visible:bg-ui-hover">
        <div className="w-full" style={{ aspectRatio: aspect }}>
          {thumb}
        </div>
        <span className="truncate px-3 pt-2 text-[13px] font-medium text-ui-1">{name}</span>
        <span className="truncate px-3 text-[11.5px] text-ui-4">{detail}</span>
        <span className="truncate px-3 pb-2 font-ui-mono text-[11.5px] text-ui-3">{size}</span>
      </button>
      <div className="flex items-center gap-0.5 border-t border-ui-subtle px-1.5 py-1">{children}</div>
    </li>
  );
}

export function InfoPanelStart({ config, current, onContinue, onOpen, onOpenLibrary, onNew, onImport }: InfoPanelStartProps) {
  const toast = useToast();
  const places = canvasPlaces(config);
  const [saved, setSaved] = useState<LibraryItem[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = () =>
    listLibrary().then(
      (all) => setSaved(all.filter((i) => i.kind === "canvas")),
      () => {},
    );
  useEffect(() => {
    let live = true;
    listLibrary().then(
      (all) => live && setSaved(all.filter((i) => i.kind === "canvas")),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  const inLibrary = unplacedProfiles(saved, config);
  const duplicate = async (item: LibraryItem) => {
    try {
      const stored = await canvasData(item);
      if (!stored) throw new Error("it couldn’t be read");
      const name = `${item.name} copy`;
      await createLibraryItem(canvasItem(copyOfProfile(stored, name), name));
      await refresh();
    } catch (e) {
      toast(`Not duplicated: ${(e as Error).message}`);
    }
  };
  const remove = async (item: LibraryItem) => {
    setRemoving(null);
    try {
      // The files go with it unless something else uses them: the dashboard's profiles are checked first.
      const { removeItem } = await import("@/components/library/remove-item");
      await removeItem(item, () => JSON.stringify(config));
      await refresh();
    } catch (e) {
      toast(`Not removed: ${(e as Error).message}`);
    }
  };
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
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileCard
                name={current.name}
                detail={current.where}
                size={`${current.width} × ${current.height} · ${counted(current.items)}`}
                aspect={aspectOf(current.width, current.height)}
                thumb={<CanvasThumb canvas={current.canvas} />}
                onOpen={onContinue}
                openLabel="Continue editing"
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
        <h2 className="mt-8 text-[13px] font-semibold text-ui-1">In this dashboard</h2>
        {places.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ui-4">No InfoPanel profiles yet. Make a new one, or import an .infopanel file.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((c) => (
              <ProfileCard
                key={c.zoneId}
                name={c.name}
                detail={c.where}
                size={`${c.width} × ${c.height} · ${counted(c.items)}`}
                aspect={aspectOf(c.width, c.height)}
                thumb={<CanvasThumb canvas={c.canvas} />}
                onOpen={() => onOpen(c)}
                openLabel="Open"
              >
                <button type="button" onClick={() => onOpen(c)} className={LINK}>
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
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inLibrary.map((item) => {
                const width = Number(item.meta.width) || 0;
                const height = Number(item.meta.height) || 0;
                return (
                  <ProfileCard
                    key={item.id}
                    name={item.name}
                    detail="Opens as a new screen"
                    size={`${width} × ${height} · ${counted(Number(item.meta.items) || 0)}`}
                    aspect={aspectOf(width, height)}
                    thumb={<ProfileThumb item={item} />}
                    onOpen={() => onOpenLibrary(item)}
                    openLabel="Open"
                  >
                    {removing === item.id ? (
                      <>
                        <span className="min-w-0 flex-1 truncate px-1.5 text-[12px] text-ui-3">Remove from the Library?</span>
                        <button type="button" onClick={() => void remove(item)} className={`${LINK} text-ui-danger`}>
                          Remove
                        </button>
                        <button type="button" onClick={() => setRemoving(null)} className={LINK}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onOpenLibrary(item)} className={LINK}>
                          <Pencil className="h-3.5 w-3.5" />
                          Open
                        </button>
                        <button type="button" onClick={() => void duplicate(item)} className={LINK}>
                          <Copy className="h-3.5 w-3.5" />
                          Duplicate
                        </button>
                        <button type="button" onClick={() => setRemoving(item.id)} className={`${LINK} ml-auto`} aria-label={`Remove ${item.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </ProfileCard>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
