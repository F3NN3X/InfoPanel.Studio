// GpuMonitor's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "GpuMonitor",
  name: "GPU Monitor",
  category: "Hardware",
  icon: "developer_board",
  prefixes: ["libre.nvidia_", "libre.amd_radeon", "libre.intel_arc"],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Load, temps, power, VRAM and clocks",
  tags: "graphics nvidia amd vram temp",
  description: "Load, temps, power, VRAM, clocks, fans, PCIe and D3D engines.",
};
