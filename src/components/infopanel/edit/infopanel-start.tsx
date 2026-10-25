/**
 * The InfoPanel page with no profile open: every InfoPanel profile placed in the dashboard (a
 * canvas zone, on any screen and page), to open in the editor, the saved profiles in the Library
 * that aren't placed here, and the ways to start one: New InfoPanel profile, or Import.
 */
import { useEffect, useState } from "react";
import { FilePlus2, FileUp, Library, PanelsTopLeft } from "lucide-react";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { unplacedProfiles } from "@/lib/my-library/canvas-link";
import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";

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
              },
            ]
          : [],
      ),
    ),
  );
}

interface InfoPanelStartProps {
  config: Pick<DashboardConfig, "profiles">;
  onOpen: (place: CanvasPlace) => void;
  /** A Library profile with no zone here: place it and open it in the editor. */
  onOpenLibrary: (item: LibraryItem) => void;
  onNew: () => void;
  onImport: () => void;
}

const BUTTON = "inline-flex h-8 items-center gap-2 rounded-[8px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover";

export function InfoPanelStart({ config, onOpen, onOpenLibrary, onNew, onImport }: InfoPanelStartProps) {
  const places = canvasPlaces(config);
  const [saved, setSaved] = useState<LibraryItem[]>([]);
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
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ui-app font-ui" data-help-article="infopanel-editor">
      <div className="mx-auto w-full max-w-[760px] px-6 py-8">
        <h1 className="text-[18px] font-semibold text-ui-1">InfoPanel editor</h1>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ui-3">
          Build and edit profiles for InfoPanel itself: its own item kinds and sensor bindings, exported as an .infopanel file it imports.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onNew} className={BUTTON}>
            <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />
            New InfoPanel profile…
          </button>
          <button type="button" onClick={onImport} className={BUTTON}>
            <FileUp className="h-4 w-4" strokeWidth={1.75} />
            Import…
          </button>
        </div>
        <h2 className="mt-8 text-[13px] font-semibold text-ui-1">In this dashboard</h2>
        {places.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ui-4">No InfoPanel profiles yet. Make a new one, or import an .infopanel file.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {places.map((c) => (
              <li key={c.zoneId}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="flex w-full items-center gap-3 rounded-lg border border-ui-default bg-ui-panel px-3 py-2.5 text-left hover:border-ui-strong"
                >
                  <PanelsTopLeft className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ui-1">{c.name}</span>
                    <span className="block truncate text-[11.5px] text-ui-4">{c.where}</span>
                  </span>
                  <span className="shrink-0 font-ui-mono text-[11.5px] text-ui-3">
                    {c.width} × {c.height} · {c.items} {c.items === 1 ? "item" : "items"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {inLibrary.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold text-ui-1">In your Library</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {inLibrary.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenLibrary(item)}
                    className="flex w-full items-center gap-3 rounded-lg border border-ui-default bg-ui-panel px-3 py-2.5 text-left hover:border-ui-strong"
                  >
                    <Library className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ui-1">{item.name}</span>
                      <span className="block truncate text-[11.5px] text-ui-4">Opens as a new screen</span>
                    </span>
                    <span className="shrink-0 font-ui-mono text-[11.5px] text-ui-3">
                      {Number(item.meta.width) || 0} × {Number(item.meta.height) || 0} · {Number(item.meta.items) || 0} {Number(item.meta.items) === 1 ? "item" : "items"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
