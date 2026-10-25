/**
 * A made-up machine for the gallery's thumbnails: one Data API sensor per template role, with the
 * refs a recent InfoPanel reports, plus twelve per-core loads, all with plausible values. The
 * thumbnails go through the same role resolver as a real Create.
 */
import type { DataApiValue } from "../sensors.ts";

const libre = (id: string, name: string, unit: string, value: number): DataApiValue => ({ value, unit, name, ref: `libre:${id}`, source: "infopanel" });

const CORE_LOADS = [62, 48, 71, 35, 54, 80, 41, 66, 29, 58, 73, 44];

export const MOCK_SENSORS: Readonly<Record<string, DataApiValue>> = {
  "mock.cpu.load": libre("/amdcpu/0/load/0", "Mock CPU Total", "%", 46),
  "mock.cpu.temp": libre("/amdcpu/0/temperature/2", "Mock CPU Core (Tctl/Tdie)", "°C", 58),
  "mock.cpu.clock": libre("/amdcpu/0/clock/1", "Mock CPU Cores (Average)", "MHz", 4820),
  "mock.cpu.power": libre("/amdcpu/0/power/0", "Mock CPU Package", "W", 96),
  "mock.gpu.load": libre("/gpu-nvidia/0/load/0", "Mock GPU Core", "%", 72),
  "mock.gpu.temp": libre("/gpu-nvidia/0/temperature/0", "Mock GPU Core", "°C", 64),
  "mock.gpu.clock": libre("/gpu-nvidia/0/clock/0", "Mock GPU Core", "MHz", 2610),
  "mock.gpu.power": libre("/gpu-nvidia/0/power/0", "Mock GPU Package", "W", 284),
  "mock.ram.load": libre("/ram/load/0", "Total Memory Memory", "%", 61),
  "mock.ram.used": libre("/ram/data/0", "Total Memory Memory Used", "GB", 19.6),
  "mock.disk.load": libre("/nvme/0/load/53", "Mock SSD Total Activity", "%", 12),
  "mock.disk.temp": libre("/nvme/0/temperature/0", "Mock SSD Composite Temperature", "°C", 43),
  "mock.net.down": libre("/nic/%7B0%7D/throughput/8", "Ethernet Download Speed", "KB/s", 18240),
  "mock.net.up": libre("/nic/%7B0%7D/throughput/7", "Ethernet Upload Speed", "KB/s", 2310),
  "mock.uptime": { text: "3:07:42:10", unit: "", name: "Uptime · Formatted", ref: "plugin:/system-info-plugin/uptime/formatted" },
  "mock.clock.second": { value: 37, unit: "", name: "Clock · Second", ref: "plugin:/clock-plugin/clock/second", source: "infopanel" },
  "mock.clock.minute": { value: 24, unit: "", name: "Clock · Minute", ref: "plugin:/clock-plugin/clock/minute", source: "infopanel" },
  ...Object.fromEntries(CORE_LOADS.map((v, i) => [`mock.core.${i + 1}`, libre(`/amdcpu/0/load/${i + 2}`, `Mock CPU Core #${i + 1}`, "%", v)])),
};
