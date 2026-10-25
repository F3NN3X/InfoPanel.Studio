/** Drive Space: the Drives element (a tile per drive, bound to the drive-info plugin, icons kept), sized to the widget's box. */
import { applyElement, elementOf } from "../../elements/apply.ts";
import { newComposite } from "../../elements/create.ts";
import { detectDrives } from "../../elements/drives.ts";
import type { DisplayItem } from "../../schema.ts";
import type { Converter } from "./kit.ts";

export const driveSpace: Converter = (box, ctx) => {
  const drives = detectDrives(ctx.sensors);
  if (drives.length === 0) return [];
  const group = newComposite("drives", ctx.look, ctx.palette, drives, Math.round(box.x), Math.round(box.y));
  const sized = { ...group, element: { ...elementOf(group)!, width: Math.round(box.w), height: Math.round(box.h) } } as unknown as DisplayItem;
  return [applyElement(sized)];
};
