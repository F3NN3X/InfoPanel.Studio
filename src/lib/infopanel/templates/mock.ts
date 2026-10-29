/**
 * A made-up machine for the gallery's thumbnails: one Data API sensor per template role, with the
 * refs a recent InfoPanel reports, plus twelve per-core loads, all with plausible values. The
 * thumbnails go through the same role resolver as a real Create.
 */
import type { DataApiValue } from "../sensors.ts";

const libre = (id: string, name: string, unit: string, value: number): DataApiValue => ({ value, unit, name, ref: `libre:${id}`, source: "infopanel" });

const rtss = (id: string, name: string, unit: string, value: number): DataApiValue => ({ value, unit, name, ref: `plugin:/InfoPanel.RTSS/rtss/${id}`, source: "infopanel" });

/** A drive's used %, free GB and temperature, as LibreHardwareMonitor reports a drive. */
const drive = (n: number, name: string, used: number, free: number, temp: number): Record<string, DataApiValue> => ({
  [`mock.drive.${n}.used`]: libre(`/nvme/${n}/load/0`, `${name} Used Space`, "%", used),
  [`mock.drive.${n}.free`]: libre(`/nvme/${n}/data/1`, `${name} Free Space`, "GB", free),
  [`mock.drive.${n}.temp`]: libre(`/nvme/${n}/temperature/0`, `${name} Composite Temperature`, "°C", temp),
});

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
  "mock.fps": rtss("fps", "RTSS · Frames Per Second", "FPS", 98),
  "mock.fps.low1": rtss("1% low fps", "RTSS · 1% Low FPS", "FPS", 84),
  "mock.fps.low01": rtss("0.1% low fps", "RTSS · 0.1% Low FPS", "FPS", 71),
  "mock.frametime": rtss("current frame time", "RTSS · Current Frame Time", "ms", 10.2),
  "mock.vram.used": libre("/gpu-nvidia/0/smalldata/1", "Mock GPU Memory Used", "", 9420),
  "mock.vram.total": libre("/gpu-nvidia/0/smalldata/2", "Mock GPU Memory Total", "", 16384),
  "mock.vram.temp": libre("/gpu-nvidia/0/temperature/3", "Mock GPU Memory Junction", "°C", 68),
  "mock.gpu.memclock": libre("/gpu-nvidia/0/clock/4", "Mock GPU Memory", "MHz", 1750),
  "mock.gpu.hotspot": libre("/gpu-nvidia/0/temperature/2", "Mock GPU Hot Spot", "°C", 74),
  "mock.gpu.fan": libre("/gpu-nvidia/0/fan/1", "Mock GPU Fan 1", "RPM", 1320),
  "mock.gpu.volt": libre("/gpu-nvidia/0/voltage/0", "Mock GPU Core Voltage", "V", 0.85),
  "mock.ram.total": { value: 32, unit: "GB", name: "Physical Memory Total" },
  "mock.ram.free": libre("/ram/data/1", "Total Memory Memory Available", "GB", 12.4),
  "mock.disk.free": libre("/nvme/0/data/3", "Mock SSD Free Space", "GB", 912),
  "mock.cpu.maxcore": libre("/amdcpu/0/load/1", "Mock CPU Core Max", "%", 88),
  "mock.cpu.ccd1": libre("/amdcpu/0/temperature/3", "Mock CPU CCD1 (Tdie)", "°C", 57),
  "mock.cpu.ccd2": libre("/amdcpu/0/temperature/4", "Mock CPU CCD2 (Tdie)", "°C", 60),
  "mock.board.vrm": libre("/lpc/nct6798d/0/temperature/2", "Mock Board VRM MOS", "°C", 52),
  "mock.cpu.fan": libre("/lpc/nct6798d/0/fan/1", "Mock Board CPU Optional", "RPM", 1180),
  "mock.psu.12v": { value: 12.1, unit: "V", name: "+12V" },
  "mock.ups.power": { value: 212, unit: "W", name: "UPS Power", ref: "plugin:/ups-plugin/ups/power" },
  "mock.ram.speed": { value: 6000, unit: "MHz", name: "Memory Clock", ref: "plugin:/hwinfo-plugin/memory/clock" },
  "mock.drive.0.used": libre("/nvme/0/load/1", "Mock SSD Used Space", "%", 48),
  ...drive(1,"Mock Archive SSD", 61, 1620, 38),
  ...drive(2, "Mock Scratch SSD", 27, 410, 44),
  ...Object.fromEntries(CORE_LOADS.map((v, i) => [`mock.core.${i + 1}`, libre(`/amdcpu/0/load/${i + 2}`, `Mock CPU Core #${i + 1}`, "%", v)])),
};
