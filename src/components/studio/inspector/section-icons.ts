import {
  Activity,
  ArrowLeftRight,
  Bell,
  Blocks,
  Brush,
  Clock,
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
  Monitor,
  MousePointerClick,
  Move,
  Palette,
  PanelTop,
  Pill,
  Plug,
  Repeat,
  Ruler,
  Scaling,
  Settings2,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  SwatchBook,
  TriangleAlert,
  Type,
  UserRound,
  Wand2,
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
  profile: { icon: Monitor, short: "Profile" },
  "profile-inherit": { icon: UserRound, short: "Inherit" },
  "profile-selection": { icon: MousePointerClick, short: "Pick" },
  "profile-rotate": { icon: Repeat, short: "Rotate" },
  "profile-island": { icon: PanelTop, short: "Island" },
  "ap-scope": { icon: Shapes, short: "Scope" },
  "ap-presets": { icon: Wand2, short: "Skins" },
  "ap-theme": { icon: Palette, short: "Theme" },
  "ap-bg": { icon: Image, short: "Backdrop" },
  "g-type": { icon: Type, short: "Font" },
  "g-clock": { icon: Clock, short: "Clock" },
  "g-display": { icon: Monitor, short: "Display" },
  "g-studio": { icon: Settings2, short: "Studio" },
  "g-conn": { icon: Plug, short: "API" },
  alerts: { icon: Bell, short: "Alerts" },
};

/** A section's id without a split tab's suffix. */
const baseId = (id: string) => id.replace(/@.*$/, "");

export function sectionIcon(section: Pick<InspectorSection, "id">): LucideIcon {
  return BY_ID[baseId(section.id)]?.icon ?? SlidersHorizontal;
}

/** One word for a tool tile ("Skin & graphics" → "Skin"). */
export function sectionShort(section: Pick<InspectorSection, "id" | "title">): string {
  return BY_ID[baseId(section.id)]?.short ?? (section.title.split(/[\s&·,/]+/).find(Boolean) ?? section.title);
}
