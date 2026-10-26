// StatusBar's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StatusBar",
  name: "Status Bar",
  category: "System",
  icon: "panel_top",
  prefixes: [],
  defaultSize: [12, 1],
  minSize: [3, 1],
  blurb: "Top bar with slots for any readout",
  tags: "status bar top strip notch island taskbar",
  description: "A one-row bar with a left, a centre and a right slot, each holding any of the date, time, weather, load, temperature, network, volume, battery and more. Leaves room for the Dynamic Island.",
  views: [
    { id: "edge", name: "Edge", blurb: "Flush bar with rounded bottom corners" },
    { id: "pill", name: "Pill", blurb: "A floating capsule", tags: "capsule rounded" },
    { id: "islands", name: "Islands", blurb: "Each slot in its own pill", tags: "waybar separate" },
    { id: "meters", name: "Meters", blurb: "A wide pill: double rings with thin-bar rows", tags: "cpu gpu fps rings bars load temperature", defaultSize: [12, 1], applies: { left: "cpuDual", center: "gpuDual", right: "fps,frameTime", separators: false } },
    { id: "orbit", name: "Orbit", blurb: "A pill with a load ring at each end", tags: "cpu gpu fps rings load temperature power", defaultSize: [12, 1], applies: { left: "cpuRing", center: "fps", right: "gpuRing", separators: false } },
    { id: "ticker", name: "Ticker", blurb: "One long line: CPU, GPU, FPS and the time", tags: "cpu gpu fps text load temperature clock", defaultSize: [12, 1], applies: { left: "", center: "cpuLine,gpuLine,fpsLine,time", right: "", separators: true } },
  ],
};
