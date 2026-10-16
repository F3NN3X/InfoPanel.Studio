/** Starting points for a new vector gauge (L7, L9, L10). */
import { DEFAULT_GAUGE, type VectorGauge } from "./vector.ts";

/**
 * The starter template: a dial whose arc and needle follow `--value`, with a glow that pulses on its own
 * (CSS animation), to show what a template can do.
 */
export const SAMPLE_TEMPLATE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  "<style>" +
  "svg{--value:0.5}" +
  ".arc{fill:none;stroke:#3B82F6;stroke-width:14;stroke-linecap:round;stroke-dasharray:377px 1000px;stroke-dashoffset:calc((1 - var(--value)) * 377px);transition:stroke-dashoffset .4s}" +
  ".needle{transform-origin:100px 100px;transform:rotate(calc(var(--value) * 270deg - 135deg));transition:transform .4s}" +
  ".glow{animation:pulse 2s ease-in-out infinite}" +
  "@keyframes pulse{50%{opacity:.25}}" +
  "</style>" +
  '<circle class="glow" cx="100" cy="100" r="92" fill="none" stroke="#38BDF8" stroke-width="2" opacity=".8"/>' +
  '<path d="M43.4 156.6A80 80 0 1 1 156.6 156.6" fill="none" stroke="#1E293B" stroke-width="14" stroke-linecap="round"/>' +
  '<path class="arc" d="M43.4 156.6A80 80 0 1 1 156.6 156.6"/>' +
  '<g class="needle"><path d="M97 100L100 34L103 100Z" fill="#F1F5F9"/></g>' +
  '<circle cx="100" cy="100" r="8" fill="#F1F5F9"/>' +
  "</svg>";

const zones = { ...DEFAULT_GAUGE.fill, mode: "zones" as const };

export const STARTERS: { name: string; gauge: VectorGauge }[] = [
  { name: "Ring", gauge: { ...DEFAULT_GAUGE, start: 0, sweep: 360 } },
  { name: "Dial with needle", gauge: { ...DEFAULT_GAUGE, rounded: false, needle: { color: "#F1F5F9", length: 0.85, width: 6 }, ticks: { count: 11, length: 8, width: 2, color: "#94A3B8" }, fill: { ...DEFAULT_GAUGE.fill, mode: "gradient" } } },
  { name: "Segmented tachometer", gauge: { ...DEFAULT_GAUGE, rounded: false, segments: 24, gap: 2, fill: zones } },
  { name: "Bar", gauge: { ...DEFAULT_GAUGE, shape: "bar", width: 300, height: 24, thickness: 16 } },
  { name: "SVG template (animated)", gauge: { ...DEFAULT_GAUGE, shape: "svg", template: SAMPLE_TEMPLATE } },
  { name: "Vertical segments", gauge: { ...DEFAULT_GAUGE, shape: "bar", orientation: "vertical", width: 24, height: 120, thickness: 20, rounded: false, segments: 12, gap: 3, fill: zones } },
  // L10: theme colours, thresholds, scale, text, ticks with labels, needle styles, background, effects.
  {
    name: "Theme ring with value",
    gauge: {
      ...DEFAULT_GAUGE, start: 0, sweep: 360, thickness: 14, track: "track",
      fill: { ...DEFAULT_GAUGE.fill, mode: "thresholds", color: "accent", warn: 70, crit: 90 },
      scale: { min: 0, max: 100, unit: "%", decimals: 0 },
      text: { size: 40, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}{unit}" },
    },
  },
  {
    name: "Speedometer",
    gauge: {
      ...DEFAULT_GAUGE, width: 240, height: 240, thickness: 10, rounded: false, track: "#1E293B",
      fill: { ...DEFAULT_GAUGE.fill, mode: "gradient" },
      needle: { color: "#F8FAFC", length: 0.95, width: 8, style: "blade" },
      ticks: { count: 9, length: 10, width: 2, color: "#CBD5E1", minor: { count: 4, length: 5, width: 1, color: "#64748B" }, labels: { size: 13, color: "#CBD5E1", font: "" } },
      scale: { min: 0, max: 240, unit: " km/h", decimals: 0 },
      text: { size: 20, color: "#F8FAFC", font: "", weight: 600, y: 0.64, format: "{value}{unit}" },
      background: { color: "#0B1120", border: { color: "#334155", width: 3 }, radius: 0 },
    },
  },
  {
    name: "Glow tachometer",
    gauge: {
      ...DEFAULT_GAUGE, start: -120, sweep: 240, rounded: false, segments: 30, gap: 2, thickness: 18, track: "#111827",
      fill: zones, glow: 6,
      needle: { color: "#F1F5F9", length: 0.8, width: 4, style: "arrow" },
      scale: { min: 0, max: 8000, unit: " rpm", decimals: 0 },
      text: { size: 20, color: "#E5E7EB", font: "", weight: 700, y: 0.72, format: "{value}{unit}" },
    },
  },
  {
    name: "Threshold bar with labels",
    gauge: {
      ...DEFAULT_GAUGE, shape: "bar", width: 300, height: 48, thickness: 16, track: "track",
      fill: { ...DEFAULT_GAUGE.fill, mode: "thresholds", color: "accent", warn: 70, crit: 90 },
      ticks: { count: 5, length: 5, width: 1, color: "muted", labels: { size: 11, color: "muted", font: "" } },
      scale: { min: 0, max: 100, unit: "°C", decimals: 0 },
      shadow: { blur: 6, dx: 0, dy: 2, color: "#000000", opacity: 0.5 },
    },
  },
];
