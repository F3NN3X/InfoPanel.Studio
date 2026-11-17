import { createContext } from "react";
import type { KeySlot } from "@/lib/keys";

/**
 * The keys of the placement a widget is drawn for (`Placement.keys`, pinned layer P7): the Keys widget reads them here,
 * since a widget's props come from its settings, which are scalars. Unset: none stored (the widget draws its sample).
 */
export const PlacementKeysContext = createContext<readonly KeySlot[] | undefined>(undefined);
