import {
  Activity,
  ArrowLeftRight,
  Bell,
  Blocks,
  Brush,
  Code,
  Database,
  Frame,
  Heading,
  History,
  Image,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  type LucideIcon,
  Maximize2,
  MousePointerClick,
  Move,
  Palette,
  Pill,
  Ruler,
  Scaling,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  SwatchBook,
  TriangleAlert,
  Type,
} from "lucide-react";
import type { InspectorSection } from "../inspector-model";

/**
 * Each inspector section's icon (its accordion header) and one-word label
 * (the phone sheet's tool tiles). Sections are matched by their id without
 * a split tab's suffix (`@data`);
 * a widget's own categories fall back to a generic icon and their title's
 * first word.
 */
const BY_ID: Record<string, { icon: LucideIcon; short: string }> = {
  header: { icon: Heading, short: "Header" },
  fit: { icon: Maximize2, short: "Fit" },
  skin: { icon: Brush, short: "Skin" },
  colors: { icon: Palette, short: "Colors" },
  palette: { icon: SwatchBook, short: "Widget" },
  surface: { icon: Layers, short: "Surface" },
  type: { icon: Type, short: "Type" },
  spacing: { icon: Scaling, short: "Spacing" },
  border: { icon: Sparkles, short: "Border" },
  css: { icon: Code, short: "CSS" },
  format: { icon: Ruler, short: "Format" },
  thresholds: { icon: TriangleAlert, short: "Alerts" },
  motion: { icon: Activity, short: "Motion" },
  island: { icon: Pill, short: "Island" },
  bound: { icon: Database, short: "Data" },
  "panel-data": { icon: Database, short: "Data" },
  pick: { icon: MousePointerClick, short: "Widget" },
  frame: { icon: Frame, short: "Frame" },
  panel: { icon: LayoutTemplate, short: "Panel" },
  layout: { icon: LayoutGrid, short: "Layout" },
  background: { icon: Image, short: "Backdrop" },
  widgets: { icon: Blocks, short: "Widgets" },
  json: { icon: Code, short: "JSON" },
  "item-kind": { icon: SquareDashed, short: "Kind" },
  "item-content": { icon: Heading, short: "Content" },
  "item-place": { icon: Move, short: "Place" },
  "item-bind": { icon: Database, short: "Binding" },
  "item-history": { icon: History, short: "History" },
  "item-fill": { icon: ArrowLeftRight, short: "Fill" },
  alerts: { icon: Bell, short: "Alerts" },
};

/** A section's id without a split tab's suffix. */
const baseId = (id: string) => id.replace(/@.*$/, "");

export function sectionIcon(section: Pick<InspectorSection, "id">): LucideIcon {
  return BY_ID[baseId(section.id)]?.icon ?? SlidersHorizontal;
}

/** The icon of a section by its id (a page's look cards). */
export const sectionIconById = (id: string): LucideIcon => sectionIcon({ id });

/** One word for a tool tile ("Skin & graphics" → "Skin"). */
export function sectionShort(section: Pick<InspectorSection, "id" | "title">): string {
  return BY_ID[baseId(section.id)]?.short ?? (section.title.split(/[\s&·,/]+/).find(Boolean) ?? section.title);
}
