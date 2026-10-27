/** Each InfoPanel item kind's icon (Edit v3 SPEC §16), as Layers, Add and the inspector show it. */
import {
  Calendar,
  ChartBar,
  ChartLine,
  ChartPie,
  Clock,
  Folder,
  Gauge,
  Globe,
  Hash,
  Image,
  ImagePlay,
  Shapes,
  Table,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { DisplayItem } from "@/lib/infopanel/schema";

const ICONS: Partial<Record<DisplayItem["kind"], LucideIcon>> = {
  Group: Folder,
  Text: Type,
  Sensor: Hash,
  Clock: Clock,
  Calendar: Calendar,
  TableSensor: Table,
  Bar: ChartBar,
  Graph: ChartLine,
  Donut: ChartPie,
  Gauge: Gauge,
  Image: Image,
  HttpImage: Globe,
  SensorImage: ImagePlay,
  Shape: Shapes,
};

export const kindIcon = (kind: DisplayItem["kind"]): LucideIcon => ICONS[kind] ?? Shapes;
