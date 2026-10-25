/**
 * A profile of converted native widgets: a panel of every widget kind through `panelToItems`, a decomposed CPU monitor
 * (tagged values over a picture), and each dedicated converter (Weather, Now Playing, Steam, analog and digital Clock,
 * Drive Space), against a Data API of refs as InfoPanel reports them. Gauges and pictures are baked with stand-in PNGs
 * and the profile exported. Used by the export test and, as one more input, by import-check
 * (lab/infopanel/scripts/import-check.mts), so InfoPanel's own reader sees what the conversion writes.
 */
import { add, assetFile, type Doc } from "../../../../src/lib/infopanel/assets/assets.ts";
import { storeItems } from "../../../../src/lib/infopanel/canvas-edit.ts";
import { itemAt } from "../../../../src/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "../../../../src/lib/infopanel/elements/bake.ts";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import { infopanelFile, staleGauges } from "../../../../src/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "../../../../src/lib/infopanel/gauges/frames.ts";
import { newStored, readStored } from "../../../../src/lib/infopanel/import/stored.ts";
import { taggedItem } from "../../../../src/lib/infopanel/native/decompose.ts";
import type { ConvertContext, Rect } from "../../../../src/lib/infopanel/native/items.ts";
import { make } from "../../../../src/lib/infopanel/native/items.ts";
import { CONVERTERS } from "../../../../src/lib/infopanel/native/modules/index.ts";
import { panelToItems } from "../../../../src/lib/infopanel/native/to-infopanel.ts";
import type { DisplayItem, Profile } from "../../../../src/lib/infopanel/schema.ts";
import type { DataApiValue } from "../../../../src/lib/infopanel/sensors.ts";
import type { PanelDef, Widget } from "../../../../src/lib/panel-model.ts";
import { png } from "./element-cases.ts";

export const NATIVE_CASE = "Native-6a";

const plugin = (path: string, v: Partial<DataApiValue> = { text: "x" }): [string, DataApiValue] => [`plugins.${path.replaceAll("/", ".")}`, { ...v, ref: `plugin:/${path}` }];
const drive = (n: number): [string, DataApiValue][] => [
  [`used${n}`, { value: 40, unit: "%", name: `Disk ${n} Used Space`, ref: `libre:/nvme/${n}/load/${50 + n}` }],
  [`free${n}`, { value: 900, unit: "GB", name: `Disk ${n} Free Space`, ref: `libre:/nvme/${n}/data/${3 + n}` }],
];

/** The hardware readings the role-based widgets find (CPU, GPU, memory, network, FPS, cores), with the refs LibreHardwareMonitor gives. */
function hardware(): [string, DataApiValue][] {
  const r = (key: string, name: string, ref: string, value = 20, unit = "%"): [string, DataApiValue] => [key, { value, unit, name, ref }];
  return [
    r("libre.cpu_temp", "Core (Tctl/Tdie)", "libre:/amdcpu/0/temperature/2", 55, "°C"),
    r("libre.cpu_power", "Package", "libre:/amdcpu/0/power/0", 90, "W"),
    r("libre.cpu_core1", "CPU Core #1", "libre:/amdcpu/0/load/1"),
    r("libre.cpu_core2", "CPU Core #2", "libre:/amdcpu/0/load/2"),
    r("libre.gpu_load", "GPU Core", "libre:/gpu-nvidia/0/load/0", 40),
    r("libre.gpu_temp", "GPU Core", "libre:/gpu-nvidia/0/temperature/0", 60, "°C"),
    r("libre.gpu_power", "GPU Package", "libre:/gpu-nvidia/0/power/0", 200, "W"),
    r("libre.gpu_fan", "GPU Fan 1", "libre:/gpu-nvidia/0/fan/1", 1500, "RPM"),
    r("libre.disk_load", "Total Activity", "libre:/nvme/0/load/30", 5),
    ["system.cpu.load", { value: 9, unit: "%", name: "CPU Load" }],
    ["system.ram.load", { value: 68, unit: "%", name: "RAM Load" }],
    ["system.ram.free", { value: 31, unit: "%", name: "RAM Free" }],
    ...["name", "ipv4-0"].map((e) => plugin(`network-info-plugin/{ABC}/${e}`)),
    ...["battery-level", "device-name"].map((e) => plugin(`bluetooth-battery-plugin/headset/${e}`)),
    plugin("InfoPanel.VBZ/departures/next", { text: "5 min" }),
    plugin("InfoPanel.StreamDeck/deck/key-1", { text: "x" }),
    plugin("InfoPanel.TextFile/file/line-1", { text: "x" }),
    plugin("InfoPanel.SteamAPI/SteamAPI-Session/current-game"),
    plugin("InfoPanel.SteamAPI/SteamAPI-Session/current-game-playtime"),
    plugin("InfoPanel.SteamAPI/SteamAPI-Profile/current_game_banner_url"),
    plugin("InfoPanel.SteamAPI/SteamAPI-Social/friends-activity"),
    plugin("InfoPanel.SteamAPI/SteamAPI-News/library-news"),
    r("libre.ram_load", "Memory", "libre:/ram/load/0", 60),
    r("libre.net_down", "Download Speed", "libre:/nic/{GUID}/throughput/8", 2048, "KB/s"),
    r("libre.net_up", "Upload Speed", "libre:/nic/{GUID}/throughput/7", 512, "KB/s"),
    ...["fps", "1% low fps", "current frame time"].map((n, i) => r(`rtss.${i}`, n, `plugin:/InfoPanel.RTSS/rtss/${n}`, 90, "")),
    ...[["processes", "top-cpu-usage"], ["processes", "top-memory-usage"]].map(([c, e]) => plugin(`system-info-plugin/${c}/${e}`)),
    plugin("system-info-plugin/uptime/formatted"),
    plugin("windows-plugin/windows/latest"),
    plugin("windows-plugin/windows/count", { value: 2 }),
    ...["left-channel", "right-channel", "peak-hold", "audio-level"].map((e) => plugin(`audio-level-meter/dev1/${e}`, { value: 30 })),
    ...["volume", "mute"].map((e) => plugin(`volume-plugin/dev1/${e}`, { value: 1 })),
  ];
}

/** The readings the conversions read, with the refs the Data API reports. */
export const NATIVE_SENSORS: Record<string, DataApiValue> = Object.fromEntries([
  ["libre.cpu", { value: 12, unit: "%", name: "CPU Total", ref: "libre:/amdcpu/0/load/0" }],
  ...["temp", "weather_desc", "humidity", "weather_icon_url", "forecast"].map((e) => plugin(`yr-weather-plugin/brevik-norway/${e}`)),
  ...["current-track", "artist", "track-progress", "elapsed-time", "remaining-time", "cover-art"].map((e) => plugin(`media-plugin/media/${e}`)),
  ...["player-name", "online-status", "steam-level", "profile_image_url"].map((e) => plugin(`InfoPanel.SteamAPI/SteamAPI-Profile/${e}`)),
  plugin("InfoPanel.SteamAPI/SteamAPI-Achievements/achievements-unlocked", { value: 12 }),
  plugin("InfoPanel.SteamAPI/SteamAPI-Achievements/achievements-total", { value: 40 }),
  plugin("InfoPanel.SteamAPI/SteamAPI-Library/recent-games"),
  ...["second", "minute", "12-hour"].map((e) => plugin(`clock-plugin/clock/${e}`)),
  ...drive(1),
  ...drive(2),
  ...hardware(),
]);

const box: Rect = { x: 0, y: 0, w: 360, h: 140 };
const widget = (kind: Widget["kind"], rest: Partial<Widget> = {}): Widget => ({ id: kind, kind, visible: true, ...rest });

/** Every converted widget, each in its own band down the canvas. */
export function nativeItems(profile: Profile): DisplayItem[] {
  const ctx: ConvertContext = { look: profile, palette: defaultPalette(profile), sensors: NATIVE_SENSORS, notes: [] };
  // A dense screen: every converter in its own cell of a grid four wide.
  const COLS = 4;
  const at = (i: number): Rect => ({ ...box, x: 10 + (i % COLS) * (box.w + 10), y: 10 + Math.floor(i / COLS) * (box.h + 10) });
  const rows = Math.ceil((Object.keys(CONVERTERS).length + 2) / COLS);
  const panel: PanelDef = {
    id: "p",
    title: "Panel",
    titleVisible: true,
    visible: true,
    background: "none",
    widgets: [
      widget("stat", { label: "CPU", sensor: "libre.cpu", unit: "%", decimals: 0 }),
      widget("bar", { sensor: "libre.cpu" }),
      widget("gauge", { sensor: "libre.cpu" }),
      widget("sparkline", { sensor: "libre.cpu" }),
      widget("table", { sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Library.recent-games" }),
      widget("text", { text: "Hello" }),
      widget("clock", { clock: "both" }),
      widget("shape", { shape: "circle" }),
    ],
  };
  const converted = Object.entries(CONVERTERS).flatMap(([id, convert], i) => {
    const out = convert(at(i + 1), ctx, id === "Clock" ? { face: "analog" } : {});
    return id === "Clock" ? [...out, ...convert({ ...at(i + 1), y: at(i + 1).y + 40 }, ctx, { face: "digital" })] : out;
  });
  // A decomposed zone: tagged values over a picture of the rest (a stand-in file named for it).
  const decomposed = [
    make("Image", ctx, at(0), "CPU background", { Type: "FILE", FilePath: "cpu_background.png", RelativePath: true }),
    taggedItem({ key: "libre.cpu", kind: "value", box: { x: 20, y: 20, w: 120, h: 50 }, fontSize: 36, color: "rgb(255, 255, 255)", bold: true, unit: "%", decimals: 0 }, at(0), ctx),
    taggedItem({ key: "libre.cpu", kind: "bar", box: { x: 20, y: 90, w: 300, h: 10 }, fontSize: 12, color: "rgb(255, 255, 255)", bold: false, max: 100 }, at(0), ctx),
  ];
  return [...decomposed, panelToItems(panel, { x: 10, y: 10 + rows * (box.h + 10), w: 360, h: 600 }, new Map(), ctx), ...converted];
}

/** The profile, its baked doc and the exported .infopanel bytes. */
export async function nativeExport(profile: Profile): Promise<{ name: string; profile: Profile; doc: Doc; bytes: Uint8Array; items: DisplayItem[] }> {
  const named = { ...profile, Name: NATIVE_CASE, Width: 1500, Height: 5000 };
  const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: NATIVE_CASE, width: named.Width, height: named.Height }), named, nativeItems(named))));
  const read = readStored(stored);
  const background = await assetFile("cpu_background.png", png(360, 140, 4242), "added");
  let doc: Doc = add({ items: read.items, assets: new Map() }, [background]).doc;
  let n = 0;
  for (const path of staleElements(doc.items)) {
    const el = staticOf(itemAt(doc.items, path))!;
    doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(el.width, el.height, n++), "added"), elementSignature(el.spec, el.width, el.height));
  }
  for (const path of staleGauges(doc.items)) {
    const spec = vectorOf(itemAt(doc.items, path))!;
    const files = await Promise.all([0, 1, 2].map((i) => assetFile(`g${path}_${i}.png`, png(spec.width, spec.height, n++ + i), "added")));
    doc = setFrameFiles(doc, path, files, bakeSignature(spec, 3));
  }
  return { name: NATIVE_CASE, profile: read.profile, doc, items: read.items, bytes: infopanelFile(read.profile, doc).bytes };
}
