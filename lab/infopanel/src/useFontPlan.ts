/**
 * The profile's font plan (L4), shared by the Fonts panel and the canvas:
 * InfoPanel's answer per request, the font library (packs, uploads,
 * downloads), and which face each request draws with.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FontLoader, type FontRequest, type ResolvedFont } from "./font-loader.ts";
import { downloadFamily, searchName, type FontCandidate } from "./font-sources.ts";
import { facesFromFile, missingFamilies, planFonts, requestKey, type FontRow, type SuppliedFace, type Use } from "./font-supply.ts";
import { walkItems } from "./parse.ts";
import type { TextStyle } from "./render/scene.ts";
import type { FontCss } from "./render/Text.tsx";
import type { DisplayItem } from "./schema.ts";
import { readFaces } from "./sfnt.ts";

const TEXT_KINDS = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);

export interface FontPlan {
  /** undefined while loading; null when there is no font source at all. */
  loader: FontLoader | null | undefined;
  rows: FontRow[];
  missing: ReturnType<typeof missingFamilies>;
  library: SuppliedFace[];
  /** Files that were not fonts. */
  rejected: string[];
  css: FontCss;
  addFiles(files: FileList | File[]): Promise<void>;
  download(candidate: FontCandidate): Promise<void>;
  choose(key: string, use: Use): void;
  /** Drops an uploaded or downloaded file from the library (packs stay). */
  removeFile(file: string): void;
}

const cssStyle = (italic: boolean) => (italic ? "italic" : "normal");

export function useFontPlan(items: DisplayItem[]): FontPlan {
  const [loader, setLoader] = useState<FontLoader | null | undefined>(undefined);
  const [packs, setPacks] = useState<SuppliedFace[]>([]);
  const [added, setAdded] = useState<SuppliedFace[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [resolved, setResolved] = useState<ReadonlyMap<string, ResolvedFont>>(new Map());
  const [choices, setChoices] = useState<ReadonlyMap<string, Use>>(new Map());
  const [aliases, setAliases] = useState<ReadonlyMap<string, string | null>>(new Map());

  useEffect(() => {
    FontLoader.fetch().then(setLoader, () => setLoader(null));
    fetch("/fonts/index.json")
      .then((r) => (r.ok ? r.json() : { faces: [] }))
      .then((i: { faces: (SuppliedFace & { source: string })[] }) =>
        setPacks(i.faces.filter((f) => f.source === "pack" && f.url).map((f) => ({ ...f, origin: "pack" as const, file: f.url }))),
      )
      .catch(() => setPacks([]));
  }, []);

  // Requests change with the set of fonts, not with every edit.
  const requestList = new Map<string, { request: FontRequest; count: number }>();
  for (const { item } of walkItems(items)) {
    if (!TEXT_KINDS.has(item.kind) || !("Font" in item)) continue;
    const request = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
    const k = requestKey(request);
    requestList.set(k, { request, count: (requestList.get(k)?.count ?? 0) + 1 });
  }
  const sig = JSON.stringify([...requestList].map(([k, v]) => [k, v.count]));
  const requests = useMemo(() => requestList, [sig]);

  useEffect(() => {
    if (!loader) return;
    let stop = false;
    Promise.all([...requests].map(async ([k, { request }]) => [k, await loader.resolve(request)] as const)).then(
      (pairs) => !stop && setResolved(new Map(pairs)),
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, [loader, requests]);

  const library = useMemo(() => [...added, ...packs], [added, packs]);

  const isMissing = useCallback(
    (request: FontRequest, r: ResolvedFont | undefined) => {
      // A legacy or variant name InfoPanel resolved to its family ("Spotify Mix Extrabold" →
      // "Spotify Mix") is not missing, although the Data API calls it a fallback.
      const wanted = searchName(request.font).toLowerCase();
      const sameFamily = !!wanted && !!r?.typeface.family.toLowerCase().startsWith(wanted);
      if (r?.fallback !== undefined) return r.fallback && !sameFamily;
      // Without the Data API: the reference's installed families.
      const installed = new Set(loader?.fonts.families.map((f) => f.name.toLowerCase()) ?? []);
      return !installed.has(request.font.toLowerCase()) && !sameFamily;
    },
    [loader],
  );

  const rows = useMemo(() => planFonts(requests, resolved, library, choices, isMissing), [requests, resolved, library, choices, isMissing]);

  // Register the supplied faces the plan draws with.
  useEffect(() => {
    for (const row of rows) {
      const f = row.use === "supplied" ? row.supplied : null;
      const id = f && `${f.url}#${f.index}`;
      if (!f || !id || aliases.has(id)) continue;
      setAliases((m) => new Map(m).set(id, null));
      (async () => {
        if (f.index !== 0) throw new Error("only the first face of a collection loads in a browser");
        const bytes = await (await fetch(f.url)).arrayBuffer();
        const alias = `ip-supplied-${id.replace(/\W/g, "-")}`;
        const face = new FontFace(alias, bytes, { weight: f.variation ? "1 1000" : String(f.weight), style: cssStyle(f.italic) });
        document.fonts.add(await face.load());
        return alias;
      })().then(
        (alias) => setAliases((m) => new Map(m).set(id, alias)),
        () => setAliases((m) => new Map(m).set(id, "")),
      );
    }
  }, [rows, aliases]);

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const css: FontCss = (style: TextStyle) => {
    const row = byKey.get(requestKey(style.font));
    const f = row?.use === "supplied" ? row.supplied : null;
    const alias = f ? aliases.get(`${f.url}#${f.index}`) : null;
    if (f && alias) return { fontFamily: `"${alias}"`, fontWeight: f.weight, fontStyle: cssStyle(f.italic) };
    if (row?.resolved) return row.resolved.css;
    return { fontFamily: `"${style.font.font}"`, fontWeight: style.font.bold ? 700 : 400, fontStyle: cssStyle(style.font.italic) };
  };

  const addFiles = async (files: FileList | File[]) => {
    const faces: SuppliedFace[] = [];
    const bad: string[] = [];
    for (const file of [...files]) {
      const r = await facesFromFile(file.name, new Uint8Array(await file.arrayBuffer()), (d) => URL.createObjectURL(new Blob([d.slice()])));
      faces.push(...r.faces);
      bad.push(...r.rejected);
    }
    setAdded((a) => [...faces, ...a]);
    setRejected(bad);
  };

  const download = async (c: FontCandidate) => {
    const files = await downloadFamily(c);
    const faces = files
      .filter((f) => f.kind === "font")
      .flatMap((f) => {
        const url = URL.createObjectURL(new Blob([f.data.slice()]));
        return readFaces(f.data).map((face): SuppliedFace => ({ ...face, origin: "download", file: f.name, url, license: c.license, size: f.data.length }));
      });
    setAdded((a) => [...faces, ...a]);
  };

  return {
    loader,
    rows,
    missing: missingFamilies(rows),
    library,
    rejected,
    css,
    addFiles,
    download,
    choose: (key, use) => setChoices((m) => new Map(m).set(key, use)),
    removeFile: (file) =>
      setAdded((a) => {
        for (const url of new Set(a.filter((f) => f.file === file).map((f) => f.url))) URL.revokeObjectURL(url);
        return a.filter((f) => f.file !== file);
      }),
  };
}
