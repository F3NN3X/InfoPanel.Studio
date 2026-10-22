import { createContext, useContext } from "react";
import type { IslandConfig } from "@/lib/island/config";

/** The page the widgets sit on: its Dynamic Island (unset = none shown) and its design size. */
export interface PageIsland {
  island?: IslandConfig;
  page: { width: number; height: number };
}

const NONE: PageIsland = { page: { width: 0, height: 0 } };

const PageIslandContext = createContext<PageIsland>(NONE);

/** Gives the widgets below the page's island and size (the kiosk page and the studio canvas); outside it there is no island. */
export const PageIslandProvider = PageIslandContext.Provider;

export const usePageIsland = (): PageIsland => useContext(PageIslandContext);
