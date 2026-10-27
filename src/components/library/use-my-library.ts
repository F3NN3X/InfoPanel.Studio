/**
 * My library's state on the Library page (spec §3): the server's items plus the config's own
 * saved panels, Styles and Themes and the built-ins (palettes, Styles, skins, panels, and the template
 * looks, screen templates and InfoPanel templates once their catalogs load), the upload queue
 * behind the tray, and the item actions that change the library (copies, variants, merges).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/assets";
import type { DashboardConfig } from "@/lib/layout";
import { createLibraryItem, deleteLibraryItem, getLibraryItem, listLibrary, updateLibraryItem, type LibraryCopy, type LibraryItem } from "@/lib/library";
import { builtinItems, configItems, type BuiltinSources } from "@/lib/my-library/config-items";
import { isConfigItem } from "@/lib/my-library/model";
import { addFileToLibrary } from "./add-file";
import { uploadName } from "./adopt-uploads";
import { removeBlocked, removeItem, type RemoveResult } from "./remove-item";

/** One file in the upload tray. */
export interface UploadRow {
  id: number;
  name: string;
  size: number;
  state: "queued" | "reading" | "uploading" | "done" | "duplicate" | "error";
  message?: string;
  itemId?: string;
}

export interface MyLibrary {
  items: LibraryItem[];
  loading: boolean;
  error: string | null;
  refresh(): void;
  uploads: UploadRow[];
  clearUploads(): void;
  /** Add files: images, videos, SVG and fonts become items. `uploaded`: files already in the asset store, by asset id. */
  addFiles(files: readonly File[], uploaded?: ReadonlyMap<File, string>): void;
  /** Add files already in the asset store (loose uploads) as items, keeping each stored file; the counts of what happened. */
  importAssets(assets: readonly Asset[]): Promise<{ added: number; duplicates: number; failed: number }>;
  /** A copy was placed (the item's copy count goes up by one). */
  addCopy(item: LibraryItem, copy: LibraryCopy): void;
  duplicate(item: LibraryItem): Promise<LibraryItem | null>;
  rename(item: LibraryItem, name: string): void;
  /**
   * Remove the item and the files nothing else uses (`inUse`: the studio's config, scanned for hashes). An image,
   * video or SVG whose file is in use stays (`refused`).
   */
  remove(item: LibraryItem, inUse?: () => string): Promise<RemoveResult>;
  update(item: LibraryItem, patch: Partial<Pick<LibraryItem, "name" | "meta" | "files" | "data">>): Promise<void>;
  /** Merge a duplicate group into its first item: the copies move over, the rest go. */
  merge(group: readonly LibraryItem[]): Promise<void>;
}

const WORKERS = 2;

export function useMyLibrary(config: Pick<DashboardConfig, "panelPresets" | "stylePresets" | "appearancePresets">): MyLibrary {
  const [server, setServer] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const nextId = useRef(0);
  const queue = useRef<{ row: number; file: File; id?: string }[]>([]);
  const running = useRef(0);
  const known = useRef<LibraryItem[]>([]);
  known.current = server;
  const [sources, setSources] = useState<BuiltinSources>({});
  useEffect(() => {
    let live = true;
    // The screen and InfoPanel templates are large catalogs: their looks and the templates themselves come on demand.
    void Promise.all([import("@/lib/screen-templates/template-presets"), import("@/lib/screen-templates/catalog"), import("@/lib/infopanel/templates/catalog")]).then(
      ([looks, catalog, profiles]) => live && setSources({ looks: looks.TEMPLATE_PRESETS, templates: catalog.SCREEN_TEMPLATES, profileTemplates: profiles.TEMPLATES }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(() => {
    listLibrary().then(
      (list) => {
        setServer(list);
        setError(null);
        setLoading(false);
      },
      (e: Error) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);
  useEffect(refresh, [refresh]);

  const patchRow = (id: number, patch: Partial<UploadRow>) => setUploads((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const upsert = (item: LibraryItem) => setServer((list) => [item, ...list.filter((i) => i.id !== item.id)]);

  const work = async (row: number, file: File, id?: string) => {
    const r = await addFileToLibrary(file, known.current, id, (state) => patchRow(row, { state }));
    if (r.state === "error") return patchRow(row, { state: "error", message: r.message });
    if (r.state === "duplicate") return patchRow(row, { state: "duplicate", message: "Already in your library, kept the existing copy", itemId: r.item.id });
    known.current = [r.item, ...known.current];
    upsert(r.item);
    patchRow(row, { state: "done", itemId: r.item.id });
  };

  const pump = () => {
    while (running.current < WORKERS && queue.current.length > 0) {
      const next = queue.current.shift()!;
      running.current++;
      work(next.row, next.file, next.id)
        .catch((e: Error) => patchRow(next.row, { state: "error", message: e.message }))
        .finally(() => {
          running.current--;
          pump();
        });
    }
  };

  const addFiles = (files: readonly File[], uploaded?: ReadonlyMap<File, string>) => {
    const rows: UploadRow[] = [];
    for (const file of files) {
      const id = nextId.current++;
      rows.push({ id, name: file.name, size: file.size, state: "queued" });
      queue.current.push({ row: id, file, id: uploaded?.get(file) });
    }
    if (rows.length) setUploads((r) => [...r, ...rows]);
    pump();
  };

  const update = async (item: LibraryItem, patch: Partial<Pick<LibraryItem, "name" | "meta" | "files" | "data">>) => {
    if (isConfigItem(item)) return;
    upsert(await updateLibraryItem(item.id, patch));
  };

  const builtins = useMemo(() => builtinItems(sources), [sources]);
  const items = useMemo(() => [...server, ...configItems(config), ...builtins], [server, config.panelPresets, config.stylePresets, config.appearancePresets, builtins]);

  return {
    items,
    loading,
    error,
    refresh,
    uploads,
    clearUploads: () => setUploads((rows) => rows.filter((r) => r.state === "queued" || r.state === "reading" || r.state === "uploading")),
    addFiles,
    importAssets: async (assets) => {
      const counts = { added: 0, duplicates: 0, failed: 0 };
      for (const asset of assets) {
        try {
          const blob = await (await fetch(asset.url)).blob();
          // The asset store keeps no original name; the stored file is kept as it is (its id is passed on).
          const r = await addFileToLibrary(new File([blob], uploadName(asset), { type: asset.type }), known.current, asset.id);
          if (r.state === "done") {
            known.current = [r.item, ...known.current];
            upsert(r.item);
            counts.added++;
          } else if (r.state === "duplicate") counts.duplicates++;
          else counts.failed++;
        } catch {
          counts.failed++;
        }
      }
      return counts;
    },
    addCopy: (item, copy) => {
      if (isConfigItem(item)) return;
      const copies = [...item.copies, { ...copy, at: new Date().toISOString() }];
      setServer((list) => list.map((i) => (i.id === item.id ? { ...i, copies } : i)));
      void updateLibraryItem(item.id, { copies }).catch(() => refresh());
    },
    duplicate: async (item) => {
      const data = item.data ?? (item.dataSize ? (await getLibraryItem(item.id)).data : undefined);
      const copy = await createLibraryItem({
        kind: item.kind,
        name: `${item.name} variant`,
        files: item.files,
        meta: item.meta,
        ...(data !== undefined ? { data } : {}),
      });
      upsert(copy);
      return copy;
    },
    rename: (item, name) => void update(item, { name }),
    remove: async (item, inUse = () => "") => {
      if (isConfigItem(item)) return { deleted: 0, kept: 0 };
      const refused = await removeBlocked(item, inUse, known.current.filter((i) => i.id !== item.id));
      if (refused) return { deleted: 0, kept: 0, refused };
      setServer((list) => list.filter((i) => i.id !== item.id));
      try {
        return await removeItem(item, inUse);
      } catch (e) {
        refresh();
        throw e;
      }
    },
    update,
    merge: async ([keep, ...rest]) => {
      if (!keep || isConfigItem(keep)) return;
      const copies = [...keep.copies, ...rest.flatMap((i) => i.copies)];
      upsert(await updateLibraryItem(keep.id, { copies }));
      await Promise.all(rest.map((i) => deleteLibraryItem(i.id)));
      setServer((list) => list.filter((i) => !rest.some((r) => r.id === i.id)));
    },
  };
}
