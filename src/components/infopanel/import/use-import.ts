/**
 * The Import dialog's state (§4): the opened source, the background asset upload, the Data API
 * catalog and font answers, the remap choices and the report. Nothing reaches the config until
 * `build` hands the stored form to the caller's commit.
 */
import { useEffect, useMemo, useState } from "react";
import { uploadBytes } from "@/lib/assets";
import { getApiBase } from "@/lib/data-api";
import { useSensorCatalog } from "@/lib/catalog";
import { FontLoader, type ResolvedFont } from "@/lib/infopanel/font-loader";
import { searchName } from "@/lib/infopanel/font-sources";
import { planFonts, type FontRow } from "@/lib/infopanel/font-supply";
import { modeCounts } from "@/lib/infopanel/native/modes";
import { buildReport, dataApiInfo, type ImportReport } from "@/lib/infopanel/import/report";
import {
  buildCanvas,
  fontRequests,
  importContext,
  uploadPlan,
  type OpenedSource,
} from "@/lib/infopanel/import/session";
import type { DataApiInfo, DefaultMode, StoredCanvas } from "@/lib/infopanel/import/stored";
import { groupBindings, indexCatalog, remapRows, resolveAll } from "@/lib/infopanel/remap/remap";
import { buildCatalog, type DataApiValue } from "@/lib/infopanel/sensors";

export interface UploadState {
  done: number;
  total: number;
  /** Asset store ids by hash. */
  ids: Map<string, string>;
  /** Files the store refused, with why. */
  failed: { name: string; reason: string }[];
  finished: boolean;
}

const FONT_MIME: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", ttc: "font/collection", woff: "font/woff", woff2: "font/woff2" };

/** Everything to upload: the asset files, and a reopened canvas's supplied fonts. */
function uploads(source: OpenedSource): { name: string; hash: string; bytes: Uint8Array; mime: string }[] {
  const files = uploadPlan(source.assets).map(({ file, mime }) => ({ name: file.name, hash: file.hash, bytes: file.bytes, mime }));
  for (const f of source.restore?.fonts ?? []) {
    const s = f.supplied;
    const bytes = s && source.restore?.fontFiles.get(s.hash);
    const mime = s && FONT_MIME[/\.([a-z0-9]+)$/i.exec(s.file)?.[1].toLowerCase() ?? ""];
    if (s && bytes && mime && !files.some((x) => x.hash === s.hash)) files.push({ name: s.file, hash: s.hash, bytes, mime });
  }
  return files;
}

/** Uploads every file in the background, two at a time (the server's limit); progress by bytes. */
function useUpload(source: OpenedSource | null): UploadState {
  const [state, setState] = useState<UploadState>({ done: 0, total: 0, ids: new Map(), failed: [], finished: true });
  useEffect(() => {
    if (!source) return;
    let stop = false;
    const queue = uploads(source);
    const total = queue.reduce((n, f) => n + f.bytes.length, 0);
    setState({ done: 0, total, ids: new Map(), failed: [], finished: queue.length === 0 });
    let next = 0;
    const worker = async () => {
      while (!stop && next < queue.length) {
        const f = queue[next++];
        let result: { id?: string; reason?: string };
        try {
          result = { id: (await uploadBytes(f.bytes, f.mime)).id };
        } catch (e) {
          result = { reason: e instanceof Error ? e.message : String(e) };
        }
        if (stop) return;
        setState((s) => ({
          ...s,
          done: s.done + f.bytes.length,
          ids: result.id ? new Map(s.ids).set(f.hash, result.id) : s.ids,
          failed: result.reason ? [...s.failed, { name: f.name, reason: result.reason }] : s.failed,
        }));
      }
    };
    void Promise.all([worker(), worker()]).then(() => !stop && setState((s) => ({ ...s, finished: true })));
    return () => {
      stop = true;
    };
  }, [source]);
  return state;
}

/** InfoPanel's font answers for the requests (the report's missing fonts) and the Data API font endpoint. */
function useFontRows(source: OpenedSource | null): { rows: FontRow[]; fontApi: string | null } {
  const [out, setOut] = useState<{ rows: FontRow[]; fontApi: string | null }>({ rows: [], fontApi: null });
  useEffect(() => {
    if (!source) return;
    let stop = false;
    const requests = fontRequests(source.parsed.items);
    (async () => {
      const loader = await FontLoader.fetch(null, getApiBase()).catch(() => null);
      const resolved = new Map<string, ResolvedFont>();
      if (loader) {
        await Promise.all(
          [...requests].map(async ([k, { request }]) => {
            const r = await loader.resolve(request).catch(() => null);
            if (r) resolved.set(k, r);
          }),
        );
      }
      const installed = new Set(loader?.fonts.families.map((f) => f.name.toLowerCase()) ?? []);
      const rows = planFonts(requests, resolved, [], new Map(), (request, r) => {
        const wanted = searchName(request.font).toLowerCase();
        const sameFamily = !!wanted && !!r?.typeface.family.toLowerCase().startsWith(wanted);
        if (r?.fallback !== undefined) return r.fallback && !sameFamily;
        // Neither the Data API nor the reference list answered: nothing to call missing.
        return loader ? !installed.has(request.font.toLowerCase()) && !sameFamily : false;
      });
      if (!stop) setOut({ rows, fontApi: loader?.api ?? null });
    })();
    return () => {
      stop = true;
    };
  }, [source]);
  return out;
}

export interface ImportState {
  source: OpenedSource;
  upload: UploadState;
  mode: DefaultMode;
  setMode: (mode: DefaultMode) => void;
  counts: { items: number; native: number };
  overrides: Map<string, string>;
  setOverrides: (next: Map<string, string>) => void;
  groups: ReturnType<typeof groupBindings>;
  index: ReturnType<typeof indexCatalog>;
  resolved: ReturnType<typeof resolveAll>;
  /** Groups with no key and no "Leave unbound": they block the Sensors step. */
  unresolved: number;
  /** The Data API answered `/api/sensors`. */
  online: boolean;
  dataApi: DataApiInfo | null;
  report: ImportReport;
  build: (name: string, screenshot?: string) => StoredCanvas;
}

/** The import's working state for an opened source (null until one is open). */
export function useImport(source: OpenedSource | null): ImportState | null {
  const upload = useUpload(source);
  const fonts = useFontRows(source);
  const catalog = useSensorCatalog();
  const online = catalog.status === "ready";
  const sensors = catalog.sensors as Record<string, DataApiValue>;
  const keysSig = Object.keys(sensors).join("\n");
  const index = useMemo(() => indexCatalog(buildCatalog(sensors)), [keysSig]);
  const [mode, setMode] = useState<DefaultMode>("native");
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [seen, setSeen] = useState<OpenedSource | null>(null);
  if (source && seen !== source) {
    // A new source resets the choices; a reopened canvas brings back its mode and remap.
    setSeen(source);
    setMode(source.restore?.defaultMode ?? "native");
    setOverrides(new Map(source.restore?.overrides ?? []));
  }
  const groups = useMemo(() => (source ? groupBindings(source.parsed.items) : []), [source]);
  const resolved = useMemo(() => resolveAll(groups, index, overrides), [groups, index, overrides]);
  const dataApi = useMemo(() => (online ? dataApiInfo(getApiBase(), sensors, fonts.fontApi) : null), [online, keysSig, fonts.fontApi]);
  const ctx = useMemo(() => (source ? importContext(source.parsed.profile, source.assets, resolved) : null), [source, resolved]);
  const counts = useMemo(() => (source && ctx ? modeCounts(source.parsed.items, ctx) : { items: 0, native: 0 }), [source, ctx]);
  const report = useMemo(
    () =>
      source && ctx
        ? buildReport({
            doc: { items: source.parsed.items, assets: source.assets },
            issues: source.parsed.issues,
            groups,
            resolved,
            overrides,
            fontRows: fonts.rows,
            convertCtx: ctx,
            dataApi,
          })
        : null,
    [source, ctx, groups, resolved, overrides, fonts.rows, dataApi],
  );
  if (!source || !report) return null;
  const unresolved = remapRows(groups, index, resolved, overrides).filter((r) => r.state === "unresolved").length;
  return {
    source,
    upload,
    mode,
    setMode,
    counts,
    overrides,
    setOverrides,
    groups,
    index,
    resolved,
    unresolved,
    online,
    dataApi,
    report,
    build: (name, screenshot) => buildCanvas({ source, name, mode, resolved, overrides, dataApi, uploaded: upload.ids, screenshot }),
  };
}
