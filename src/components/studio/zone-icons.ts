import { Blocks, Box, Frame, SquareDashed, type LucideIcon } from "lucide-react";
import { BLANK_MODULE, CANVAS_ID, CARDS_ID, PANEL_ID } from "@/lib/layout";

/** A zone's icon in Layers and the library: the panel and "Other sensors" icon, the blank and canvas icons, else a plain box. */
export function moduleIcon(module: string): LucideIcon {
  if (module === BLANK_MODULE) return SquareDashed;
  if (module === CANVAS_ID) return Frame;
  if (module === PANEL_ID || module === CARDS_ID) return Blocks;
  return Box;
}
