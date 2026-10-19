/** My library's gauges as entries: the list leaves a large spec out, so those are fetched once each. */
import { useEffect, useMemo, useRef, useState } from "react";
import { getLibraryItem, type LibraryItem } from "@/lib/library";
import { libraryGauges, type GaugeEntry } from "@/lib/gauge-studio/model";

const versionOf = (i: LibraryItem) => `${i.id}@${i.updatedAt}`;

export interface LibraryGauges {
  entries: GaugeEntry[];
  /** The library item behind an entry key (its copies placed). */
  itemOf: (key: string) => LibraryItem | undefined;
}

export function useLibraryGauges(items: readonly LibraryItem[]): LibraryGauges {
  const [loaded, setLoaded] = useState<Record<string, LibraryItem>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    for (const item of items) {
      const version = versionOf(item);
      if (item.kind !== "gauge" || item.data !== undefined || !item.dataSize || asked.current.has(version)) continue;
      asked.current.add(version);
      getLibraryItem(item.id).then(
        (full) => setLoaded((l) => ({ ...l, [version]: full })),
        () => {},
      );
    }
  }, [items]);

  const full = useMemo(() => items.map((i) => loaded[versionOf(i)] ?? i), [items, loaded]);
  return useMemo(() => {
    const entries = libraryGauges(full);
    const byKey = new Map(entries.map((e) => [e.key, full.find((i) => e.source.kind === "library" && i.id === e.source.itemId)!]));
    return { entries, itemOf: (key) => byKey.get(key) };
  }, [full]);
}
