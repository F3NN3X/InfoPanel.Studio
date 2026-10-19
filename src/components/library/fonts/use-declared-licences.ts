/**
 * What the font files behind the requests declare about their own licence (the Fonts table's
 * Licence column): the Data API's face file, or the supplied file from the asset store. Read
 * once per file, shown as declared, never a verdict.
 */
import { useEffect, useMemo, useState } from "react";
import { readStoreFile } from "@/lib/infopanel/canvas";
import { declaredLicence, type Declared } from "@/lib/infopanel/font-licence";
import type { RequestEntry } from "@/lib/infopanel/font-requests";
import { readFaces } from "@/lib/infopanel/sfnt";
import type { FontAnswers } from "./use-font-answers";

type Source = { id: string; read: () => Promise<Uint8Array | null> };

/** Where a request's font file can be read: the supplied one, else the face InfoPanel's Data API serves. */
function sourceOf(entry: RequestEntry, answers: FontAnswers): Source | null {
  const s = entry.supplied;
  if (entry.use === "supplied" && s) {
    const ext = /\.([a-z0-9]+)$/i.exec(s.file)?.[1].toLowerCase();
    return { id: `store:${s.hash}`, read: () => readStoreFile(s.hash, ext, "other") };
  }
  const r = answers.resolved.get(entry.key);
  const url = r?.source === "data-api" ? r.file : null;
  if (!url) return null;
  return {
    id: url,
    read: async () => {
      const res = await fetch(url);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
  };
}

/** The declared licence per request key; null for a file that declares nothing, absent until read. */
export function useDeclaredLicences(entries: readonly RequestEntry[], answers: FontAnswers): ReadonlyMap<string, Declared | null> {
  const [byFile, setByFile] = useState<ReadonlyMap<string, Declared | null>>(new Map());
  const sources = useMemo(
    () => new Map(entries.flatMap((e) => {
      const src = sourceOf(e, answers);
      return src ? [[e.key, src] as const] : [];
    })),
    [entries, answers],
  );
  useEffect(() => {
    let stop = false;
    const todo = new Map([...sources.values()].filter((s) => !byFile.has(s.id)).map((s) => [s.id, s] as const));
    for (const src of todo.values()) {
      void src
        .read()
        .then((bytes) => (bytes ? declaredLicence(readFaces(bytes)[0] ?? {}) : null))
        .catch(() => null)
        .then((declared) => !stop && setByFile((prev) => new Map(prev).set(src.id, declared)));
    }
    return () => {
      stop = true;
    };
  }, [sources]);
  return useMemo(() => new Map([...sources].flatMap(([key, s]) => (byFile.has(s.id) ? [[key, byFile.get(s.id) ?? null] as const] : []))), [sources, byFile]);
}
