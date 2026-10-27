import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import { createLibraryItem } from "@/lib/library";
import type { DashboardConfig, Placement, ProfileView } from "@/lib/layout";
import type { ImportCommit, ImportSource } from "@/components/infopanel/import/import-dialog";
import { canvasMeta, componentItem } from "@/lib/my-library/canvas-link";
import { saveComponent } from "@/lib/infopanel/component";
import { readStored } from "@/lib/infopanel/import/stored";
import { allPlacements } from "@/lib/pages";
import { appearanceOf } from "@/lib/style-resolve";
import type { ConvertedCanvas, ConvertScope } from "@/components/infopanel/convert-dialog";
import { canvasZoneOf, importAsProfile, importIntoProfile, withCanvas, withZoneSettings } from "./import-actions";
import { onFileDoor } from "./file-doors";

// The dialogs carry the InfoPanel parser and writer: loaded on first open, never in the kiosk bundle.
const ImportDialog = lazy(() => import("@/components/infopanel/import/import-dialog").then((m) => ({ default: m.ImportDialog })));
const ConvertDialog = lazy(() => import("@/components/infopanel/convert-dialog").then((m) => ({ default: m.ConvertDialog })));
const ExportDialog = lazy(() => import("@/components/infopanel/export-dialog").then((m) => ({ default: m.ExportDialog })));

interface InfoPanelIoDeps {
  config: DashboardConfig;
  /** The profile page on the canvas: "Canvas zone in …" lands here, Export reads its canvas zone. */
  profile: ProfileView;
  setConfig: HistorySetter;
  selectedId?: string;
  /** Select a zone once it is on the canvas (a new profile shows on the next render). */
  onLanded: (zoneId: string, newProfile: boolean) => void;
  /** Select a profile for editing: a new profile is edited without changing what displays open on. */
  onSelectProfile: (id: string) => void;
}

/** Import InfoPanel (the door hands its file over; the Library reopens a saved canvas) and Export: their open state, their one-undo-step commits and the dialogs. */
export function useInfoPanelIo({ config, profile, setConfig, selectedId, onLanded, onSelectProfile }: InfoPanelIoDeps) {
  const toast = useToast();
  const [importDest, setImportDest] = useState<"new" | "zone" | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | undefined>(undefined);
  /** The door chose where the canvas lands, so the wizard does not ask. */
  const [importLocked, setImportLocked] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** A canvas from the Library, exported without placing it. */
  const [exportOverride, setExportOverride] = useState<Placement | null>(null);
  const exportZone = canvasZoneOf(profile, selectedId);
  /** "Convert zone / screen to InfoPanel" (the zone menu, the command palette): the dialog's scope while it is open. */
  const [convert, setConvert] = useState<ConvertScope | null>(null);
  useEffect(() => onFileDoor((e) => e.type === "convert" && setConvert(e.scope)), []);
  // The conversion runs after the choices were written to the config, so it places its canvas on the config as it is by then.
  const latest = useRef({ config, profile });
  latest.current = { config, profile };

  /** The converted canvas: a zone lands in a free cell of this page, a screen as a new profile (edited, not displayed). */
  const place = (c: ConvertedCanvas): string | null => {
    const { config: cfg, profile: view } = latest.current;
    if (c.scope === "zone") {
      const r = importIntoProfile(cfg, view, c.canvas, c.size);
      if (!r) return "No free cell on this page: make room, or convert the whole screen";
      setConfig(r.config);
      onLanded(r.zoneId, false);
      // Also a component in the Library, to place again on any InfoPanel profile (sensors matched by role).
      const { profile: look, items } = readStored(c.canvas);
      const made = saveComponent({ stored: c.canvas, profile: look, items, selection: items.map((_, i) => String(i)), name: c.name });
      if (made)
        createLibraryItem(componentItem(made.stored, c.name, made.roles)).then(
          () => toast(`Saved ${c.name} as a component in the Library`),
          (e: Error) => toast(`Not saved as a component: ${e.message}`),
        );
      return null;
    }
    const r = importAsProfile(cfg, c.canvas, c.name, c.size, false);
    setConfig(r.config);
    onSelectProfile(r.profileId);
    onLanded(r.zoneId, true);
    return null;
  };

  const commit = async (c: ImportCommit): Promise<string | null> => {
    let zoneId: string;
    if (c.dest === "new") {
      const r = importAsProfile(config, c.canvas, c.name, c.size, false);
      setConfig(r.config);
      onSelectProfile(r.profileId);
      zoneId = r.zoneId;
    } else {
      const r = importIntoProfile(config, profile, c.canvas, c.size);
      if (!r) return "No free cell on this page: make room, or import as a new profile";
      setConfig(r.config);
      zoneId = r.zoneId;
    }
    onLanded(zoneId, c.dest === "new");
    toast(`Imported ${c.name} · ${c.dest === "new" ? `new profile ${c.size.width} × ${c.size.height}` : `a group on ${profile.name}`} · 1 undo step`);
    if (c.toLibrary) {
      createLibraryItem({
        kind: "canvas",
        name: c.name,
        data: c.canvas,
        files: c.files,
        meta: { ...canvasMeta(c.canvas), width: c.size.width, height: c.size.height },
      }).then(
        () => toast(`Saved ${c.name} to the Library`),
        (e: Error) => toast(`Not saved to the Library: ${e.message}`),
      );
    }
    return null;
  };

  /** The theme of the screen that holds the exported zone (the page on the canvas for a Library canvas). */
  const exportAppearance = (zone: Placement | undefined) =>
    appearanceOf(config, config.profiles.find((p) => allPlacements(p).some((z) => z.id === zone?.id)) ?? profile);

  const dialogs = (
    <Suspense fallback={null}>
      {importDest && (
        <ImportDialog
          open
          onOpenChange={(open) => !open && setImportDest(null)}
          profileName={profile.name}
          profileSize={{ width: profile.width, height: profile.height }}
          initialDest={importDest}
          initialSource={importSource}
          lockDest={importLocked}
          onImport={commit}
        />
      )}
      {convert && (
        <ConvertDialog
          open
          onOpenChange={(open) => !open && setConvert(null)}
          scope={convert}
          profile={profile}
          zoneId={selectedId}
          page={config.profiles.find((p) => p.id === profile.id)?.pages.find((pg) => pg.id === profile.pageId)}
          onRemember={(zoneId, settings) => setConfig((cfg) => withZoneSettings(cfg, zoneId, settings))}
          onConverted={place}
          onDone={toast}
        />
      )}
      {exportOpen && (
        <ExportDialog
          open
          onOpenChange={setExportOpen}
          zone={exportOverride ?? exportZone}
          onBaked={(zoneId, canvas) => setConfig((cfg) => withCanvas(cfg, zoneId, canvas))}
          onDone={toast}
          appearance={exportAppearance(exportOverride ?? exportZone)}
        />
      )}
    </Suspense>
  );

  return {
    openImport: (dest: "new" | "zone" = "new", source?: ImportSource, locked = false) => {
      setImportSource(source);
      setImportLocked(locked);
      setImportDest(dest);
    },
    openExport: (zone?: Placement) => {
      setExportOverride(zone ?? null);
      setExportOpen(true);
    },
    canExport: exportZone !== undefined,
    dialogs,
  };
}
