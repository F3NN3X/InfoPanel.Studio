/** Each studio element's icon (Add palette, Layers, inspector). Light on purpose: a screen page's Layers loads it. */
import { Activity, AlignJustify, ChartNoAxesCombined, CircleDashed, Cpu, Disc3, Ellipsis, HardDrive, Layers, Minus, RectangleHorizontal, Rows3, Smile, Sparkles, Type, type LucideIcon } from "lucide-react";
import type { ElementType } from "@/lib/infopanel/elements/spec";

export const ELEMENT_ICONS: Record<ElementType, LucideIcon> = {
  ring: CircleDashed,
  ledbar: Ellipsis,
  card: RectangleHorizontal,
  glow: Sparkles,
  divider: Minus,
  icon: Smile,
  cores: Cpu,
  sparkline: Activity,
  row: AlignJustify,
  rows: Rows3,
  stack: ChartNoAxesCombined,
  dual: Layers,
  doublering: Disc3,
  drives: HardDrive,
  shadowtext: Type,
};
