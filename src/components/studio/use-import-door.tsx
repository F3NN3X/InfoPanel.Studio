import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { sniffFile, UNKNOWN_FILE, type Sniffed } from "@/lib/import-sniff";
import { DropOverlay, ImportDoorDialog } from "./import-door";
import { DEFAULT_CHOICES, runImport, type DoorChoices, type DoorFile, type DoorGo } from "./import-door-actions";
import { onFileDoor, type ImportRequest } from "./file-doors";

/** A file this big is sniffed from its first bytes only (a video, say); a zip or JSON that big is not recognised. */
const SNIFF_WHOLE = 64 * 1024 * 1024;
const SNIFF_HEAD = 64 * 1024;

async function sniffOne(file: File): Promise<Sniffed> {
  try {
    const bytes = new Uint8Array(await (file.size <= SNIFF_WHOLE ? file : file.slice(0, SNIFF_HEAD)).arrayBuffer());
    return await sniffFile(file.name, file.type, bytes);
  } catch {
    return { kind: "unknown", label: UNKNOWN_FILE };
  }
}

interface ImportDoorDeps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  addScreen: (profile: MonitorProfile) => void;
  backup: (config: DashboardConfig) => boolean;
  useAsBackground: (item: LibraryItem) => void;
  /** The edited screen and page. */
  current: { screen: string; page: string };
  toast: (message: string) => void;
  /** Where the door goes once it is done (Screens, a gauge, a Library collection). */
  onGo: (go: DoorGo) => void;
  /** An InfoPanel file for the wizard (the existing review steps, without "Lands in"). */
  onWizard: (file: File, dest: "new" | "zone") => void;
  /** Library items were added. */
  onLibraryChanged: () => void;
}

/**
 * The Import door's state: the open dialog, the files it holds and their detected kinds, the choices, and the
 * window-wide drop (the "Drop to import" cover while a file is over Studio; a drop adds to the open dialog).
 */
export function useImportDoor(deps: ImportDoorDeps): ReactNode {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<DoorFile[]>([]);
  const [choices, setChoices] = useState<DoorChoices>(DEFAULT_CHOICES);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);

  const add = (list: File[]) => {
    const rows: DoorFile[] = list.map((file) => ({ id: nextId.current++, file, sniffed: null }));
    setFiles((f) => [...f, ...rows]);
    for (const row of rows) void sniffOne(row.file).then((sniffed) => setFiles((f) => f.map((r) => (r.id === row.id ? { ...r, sniffed } : r))));
  };
  const openDoor = (req: ImportRequest = {}) => {
    setFiles([]);
    setChoices({ ...DEFAULT_CHOICES, canvas: req.prefer === "canvas-zone" ? "canvas-zone" : "new-screen" });
    setBusy(false);
    setOpen(true);
    add(req.files ?? []);
  };
  // The listeners below live for the whole session: they read the latest state through one ref.
  const live = useRef({ open, add, openDoor });
  live.current = { open, add, openDoor };

  useEffect(() => onFileDoor((e) => e.type === "import" && live.current.openDoor(e)), []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") === true;
    const enter = (e: DragEvent) => {
      if (hasFiles(e)) depth++;
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // A field that takes the file itself (a background picker) already called preventDefault: no cover for it.
      const taken = e.defaultPrevented;
      if (!taken) e.preventDefault();
      setDragging(!taken);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e) || e.defaultPrevented || !e.dataTransfer?.files.length) return;
      e.preventDefault();
      const dropped = [...e.dataTransfer.files];
      if (live.current.open) live.current.add(dropped);
      else live.current.openDoor({ files: dropped });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const run = async () => {
    setBusy(true);
    const r = await runImport(files, choices, deps);
    setBusy(false);
    deps.toast(
      r.failed.length > 0 ? `${r.done.length} imported · ${r.failed.join("; ")}` : r.done.length === 1 ? r.done[0] : `Imported ${r.done.length} files`,
    );
    // Nothing went in: the door stays open on its rows, so the bad file can be removed and the rest go on.
    if (r.done.length === 0 && !r.wizard) return;
    setOpen(false);
    if (r.libraryChanged) deps.onLibraryChanged();
    if (r.go) deps.onGo(r.go);
    if (r.wizard) deps.onWizard(r.wizard.file, r.wizard.dest);
  };

  return (
    <>
      <ImportDoorDialog
        open={open}
        files={files}
        choices={choices}
        onChoices={setChoices}
        busy={busy}
        current={deps.current}
        onAdd={add}
        onRemove={(id) => setFiles((f) => f.filter((r) => r.id !== id))}
        onClose={() => setOpen(false)}
        onRun={() => void run()}
      />
      {dragging && !open && <DropOverlay />}
    </>
  );
}
