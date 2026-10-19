/**
 * InfoPanel's answer for each font request the page asks for (the Data API's font endpoints, as
 * the canvas zone and the Import report use them): one batch per set of requests, not per edit.
 */
import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/data-api";
import { FontLoader, type FontRequest, type ResolvedFont } from "@/lib/infopanel/font-loader";

export interface FontAnswers {
  /** The loader answered or failed: nothing more is coming. */
  ready: boolean;
  /** Null when neither the Data API nor a reference file could be reached. */
  loader: FontLoader | null;
  resolved: ReadonlyMap<string, ResolvedFont>;
}

const PENDING: FontAnswers = { ready: false, loader: null, resolved: new Map() };

/** `requests`: the distinct requests by key. */
export function useFontAnswers(requests: ReadonlyMap<string, FontRequest>): FontAnswers {
  const [answers, setAnswers] = useState<FontAnswers>(PENDING);
  const sig = [...requests.keys()].sort().join("\n");
  const wanted = useMemo(() => requests, [sig]);
  useEffect(() => {
    let stop = false;
    (async () => {
      const loader = await FontLoader.fetch(null, getApiBase()).catch(() => null);
      const resolved = new Map<string, ResolvedFont>();
      if (loader) {
        await Promise.all(
          [...wanted].map(async ([key, request]) => {
            const r = await loader.resolve(request).catch(() => null);
            if (r) resolved.set(key, r);
          }),
        );
      }
      if (!stop) setAnswers({ ready: true, loader, resolved });
    })();
    return () => {
      stop = true;
    };
  }, [wanted]);
  return answers;
}
