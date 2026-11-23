import { useCallback, useEffect, useState } from "react";

/** A pack the user imported, with the warnings the validator gives it each time it loads (Q44: nothing is stored). */
export interface ImportedPack {
  id: string;
  name: string;
  size: number;
  warnings: string[];
}

/** The imported packs the server lists, each checked again without its style sheet (cheap), and whether packs are off on this server. The code loads with the first call. */
export function useImportedPacks(): { packs: ImportedPack[]; off: boolean; refresh: () => Promise<void> } {
  const [packs, setPacks] = useState<ImportedPack[]>([]);
  const [off, setOff] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [store, imp] = await Promise.all([import("@/looks/user-packs"), import("@/looks/user-pack-import")]);
      await store.registerUserPacks();
      const list = await store.listUserPacks();
      setOff(await store.userPacksOff());
      setPacks(
        await Promise.all(
          list.map(async (p) => {
            try {
              return { ...p, warnings: store.userPackIssues(await store.readUserPack(p.id), "route").filter((i) => i.severity === "warn").map(imp.describeIssue) };
            } catch {
              return { ...p, warnings: [] };
            }
          })
        )
      );
    } catch {
      setPacks([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { packs, off, refresh };
}
