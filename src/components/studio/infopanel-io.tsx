import { lazy, Suspense, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import { createLibraryItem } from "@/lib/library";
import type { DashboardConfig, Placement, ProfileView } from "@/lib/layout";
import type { ImportCommit, ImportSource } from "@/components/infopanel/import/import-dialog";
import { canvasZoneOf, importAsProfile, importIntoProfile, withCanvas } from "./import-actions";

// The dialogs carry the InfoPanel parser and writer: loaded on first open, never in the kiosk bundle.
const ImportDialog = lazy(() => import("@/components/infopanel/import/import-dialog").then((m) => ({ default: m.ImportDialog })));
const ExportDialog = lazy(() => import("@/components/infopanel/export-dialog").then((m) => ({ default: m.ExportDialog })));

interface InfoPanelIoDeps {
  config: DashboardConfig;
  /** The profile page on the canvas: "Canvas zone in …" lands here, Export reads its canvas zone. */
  profile: ProfileView;
  setConfig: HistorySetter;
  selectedId?: string;
  /** Select a zone once it is on the canvas (a new profile shows on the next render). */
  onLanded: (zoneId: string, newProfile: boolean) => void;
}

/** Import InfoPanel and Export: their open state, their one-undo-step commits and the dialogs. */
export function useInfoPanelIo({ config, profile, setConfig, selectedId, onLanded }: InfoPanelIoDeps) {
  const toast = useToast();
  const [importDest, setImportDest] = useState<"new" | "zone" | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  /** A canvas from the Library, exported without placing it. */
  const [exportOverride, setExportOverride] = useState<Placement | null>(null);
  const exportZone = canvasZoneOf(profile, selectedId);

  const commit = async (c: ImportCommit): Promise<string | null> => {
    let zoneId: string;
    if (c.dest === "new") {
      const r = importAsProfile(config, c.canvas, c.name, c.size);
      setConfig(r.config);
      zoneId = r.zoneId;
    } else {
      const r = importIntoProfile(config, profile, c.canvas, c.size);
      if (!r) return "No free cell on this page: make room, or import as a new profile";
      setConfig(r.config);
      zoneId = r.zoneId;
    }
    onLanded(zoneId, c.dest === "new");
    toast(`Imported ${c.name} · ${c.dest === "new" ? `new profile ${c.size.width} × ${c.size.height}` : `canvas zone in ${profile.name}`} · 1 undo step`);
    if (c.toLibrary) {
      createLibraryItem({
        kind: "canvas",
        name: c.name,
        data: c.canvas,
        files: c.files,
        meta: { width: c.size.width, height: c.size.height, items: c.canvas.items.length, source: c.canvas.source.origin },
      }).then(
        () => toast(`Saved ${c.name} to the Library`),
        (e: Error) => toast(`Not saved to the Library: ${e.message}`),
      );
    }
    return null;
  };

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
          onImport={commit}
        />
      )}
      {exportOpen && (
        <ExportDialog
          open
          onOpenChange={setExportOpen}
          zone={exportOverride ?? exportZone}
          onBaked={(zoneId, canvas) => setConfig((cfg) => withCanvas(cfg, zoneId, canvas))}
          onDone={toast}
        />
      )}
    </Suspense>
  );

  return {
    openImport: (dest: "new" | "zone" = "new", source?: ImportSource) => {
      setImportSource(source);
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
