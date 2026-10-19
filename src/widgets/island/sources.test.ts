import { describe, expect, it } from "vitest";
import { islandFeeds, type IslandUpdate } from "@/lib/island/sources";
import type { Placement } from "@/lib/layout";
import { zoneResolver } from "@/lib/style-resolve";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import type { Data } from "../core/types";
import { volumeMixerIsland } from "./audio";
import { achievementsIsland, fpsIsland, gameOf, steamNewsIsland } from "./gaming";
import { drivesOf, driveSpaceIsland, networkAdaptersIsland, networkThroughputIsland } from "./hardware";
import { latestNotification, NOTIFICATION_LATEST, notificationsIsland, weatherIsland } from "./info";

type Def = { derive(prev: Data | null, next: Data, settings: ModuleSettings): IslandUpdate };
const derive = (def: Def, prev: Data | null, next: Data, settings: ModuleSettings = {}) => def.derive(prev, next, settings);

const RTSS = "plugins.InfoPanel.RTSS.rtss.";
const game = (fps: string, title = "​ARC Raiders​"): Data => ({ [`${RTSS}fps`]: fps, [`${RTSS}windowtitle`]: title });

describe("FPS Monitor on the island", () => {
  it("shows the game and its FPS as the activity, with zero-width characters stripped", () => {
    expect(gameOf(game("142 FPS"))).toEqual({ name: "ARC Raiders", fps: 142 });
    expect(derive(fpsIsland, null, game("142 FPS")).activity).toEqual({ id: "game", title: "ARC Raiders", subtitle: "142 FPS" });
  });

  it("has no activity when nothing is captured", () => {
    expect(gameOf(game("0"))).toBeNull();
    expect(gameOf(game("60", "No games"))).toBeNull();
    expect(derive(fpsIsland, null, game("0")).activity).toBeNull();
  });

  it("takes a pass before the FPS keys came as no baseline", () => {
    expect(derive(fpsIsland, { other: "1" }, game("100"), { islandStart: true }).notices).toBeUndefined();
  });

  it("falls back to Steam's current game for the name", () => {
    expect(gameOf({ [`${RTSS}fps`]: "90", "plugins.InfoPanel.SteamAPI.SteamAPI-Session.current-game": "Doom" })?.name).toBe("Doom");
  });

  it("raises a start notice and a low-FPS warning only when switched on", () => {
    expect(derive(fpsIsland, game("0"), game("100")).notices).toEqual([]);
    expect(derive(fpsIsland, game("0"), game("100"), { islandStart: true }).notices).toEqual([{ id: "start", severity: "info", title: "ARC Raiders", body: "Game started", ttl: 3000 }]);
    // Two readings in a row under the floor.
    expect(derive(fpsIsland, game("50"), game("40"), { islandFloor: 60 }).notices?.[0]).toMatchObject({ id: "low", severity: "warning", title: "40 FPS" });
    expect(derive(fpsIsland, game("90"), game("40"), { islandFloor: 60 }).notices).toEqual([]);
    expect(derive(fpsIsland, game("50"), game("40"), { islandFloor: 0 }).notices).toEqual([]);
  });
});

const ACH = "plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.";
describe("Achievements on the island", () => {
  it("raises a new latest achievement with its icon, not the baseline or a repeat", () => {
    const a = (name: string): Data => ({ [`${ACH}latest-achievement`]: name, [`${ACH}latest-achievement-icon`]: "https://cdn.example/icon.jpg" });
    expect(derive(achievementsIsland, null, a("First")).notices).toBeUndefined();
    expect(derive(achievementsIsland, a("First"), a("First")).notices).toBeUndefined();
    // An earlier pass without the key (another stream came first) is no baseline.
    expect(derive(achievementsIsland, { other: "1" }, a("First")).notices).toBeUndefined();
    expect(derive(achievementsIsland, a("First"), a("Second")).notices?.[0]).toMatchObject({ title: "Achievement unlocked", body: "Second" });
  });
});

const NEWS = "plugins.InfoPanel.SteamAPI.SteamAPI-News.library-news";
describe("Steam News on the island", () => {
  it("raises the first new post only", () => {
    const before: Data = { [NEWS]: "Doom, Patch 1, Oct 10" };
    const after: Data = { [NEWS]: "Doom, Patch 2, with commas, Oct 12\nDoom, Patch 1, Oct 10\nPortal, Update, Oct 12" };
    expect(derive(steamNewsIsland, before, after).notices).toEqual([
      { id: "news:Doom|Patch 2, with commas", group: "news", severity: "info", title: "Doom", body: "Patch 2, with commas", ttl: 6000, cooldownMs: 86_400_000 },
    ]);
    expect(derive(steamNewsIsland, null, after).notices).toBeUndefined();
    expect(derive(steamNewsIsland, {}, after).notices).toBeUndefined();
  });
});

const drive = (id: string, used: number, total = 1000): Data => ({
  [`plugins.drive-info-plugin.${id}.name`]: `${id.toUpperCase()}:`,
  [`plugins.drive-info-plugin.${id}.total_size`]: String(total),
  [`plugins.drive-info-plugin.${id}.used_space`]: String(used),
  [`plugins.drive-info-plugin.${id}.available_space`]: String(total - used),
});

describe("Drive Space on the island", () => {
  it("reads each drive's used share", () => {
    expect(drivesOf(drive("c", 500)).get("c")).toEqual({ name: "C:", pct: 50, free: 500 });
  });

  it("raises a drive crossing the thresholds upwards only", () => {
    expect(derive(driveSpaceIsland, drive("c", 700), drive("c", 850)).notices?.[0]).toMatchObject({ id: "drive:c", severity: "warning", title: "Drive C: 85% full" });
    expect(derive(driveSpaceIsland, drive("c", 850), drive("c", 950)).notices?.[0]).toMatchObject({ severity: "critical" });
    expect(derive(driveSpaceIsland, drive("c", 850), drive("c", 860)).notices).toEqual([]);
    expect(derive(driveSpaceIsland, drive("c", 950), drive("c", 700)).notices).toEqual([]);
  });

  it("uses the widget's thresholds and pinned drive", () => {
    const both = (c: number, d: number) => ({ ...drive("c", c), ...drive("d", d) });
    expect(derive(driveSpaceIsland, both(500, 500), both(650, 650), { "warn.full": 60 }).notices).toHaveLength(2);
    expect(derive(driveSpaceIsland, both(500, 500), both(650, 650), { "warn.full": 60, device: "D:" }).notices?.map((n) => n.id)).toEqual(["drive:d"]);
  });

  it("reads the levels the widget resolves under its theme, never a palette colour named warn", () => {
    const zone = { id: "z", module: "DriveSpace", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { island: true, warn: "#ff0000" } } as Placement;
    const profile = { widgetTheme: { values: { "warn.full": 60 } }, pages: [{ placements: [zone] }] };
    const [feed] = islandFeeds([zone], modules, zoneResolver({}, profile, (z) => modules.find((m) => m.id === z.module)?.settings));
    expect(feed.settings["warn.full"]).toBe(60);
    expect(derive(driveSpaceIsland, drive("c", 500), drive("c", 650), feed.settings).notices).toHaveLength(1);
  });
});

const NET = "plugins.network-info-plugin.";
const adapter = (status: string, ip = "1.2.3.4"): Data => ({ [`${NET}{A}.name`]: "Ethernet", [`${NET}{A}.status`]: status, [`${NET}public-ip.ipv4`]: ip });

describe("Network on the island", () => {
  it("raises an adapter dropping and coming back", () => {
    expect(derive(networkAdaptersIsland, adapter("Up"), adapter("Down")).notices).toEqual([{ id: "link:{A}", severity: "warning", title: "Ethernet disconnected", ttl: 6000 }]);
    expect(derive(networkAdaptersIsland, adapter("Down"), adapter("Up")).notices?.[0]).toMatchObject({ severity: "info", title: "Ethernet connected" });
    expect(derive(networkAdaptersIsland, null, adapter("Down")).notices).toBeUndefined();
  });

  it("raises a public IP change only when switched on", () => {
    expect(derive(networkAdaptersIsland, adapter("Up"), adapter("Up", "5.6.7.8")).notices).toEqual([]);
    expect(derive(networkAdaptersIsland, adapter("Up"), adapter("Up", "5.6.7.8"), { islandPublicIp: true }).notices).toEqual([
      { id: "public-ip", severity: "info", title: "Public IP changed", body: "5.6.7.8", ttl: 5000 },
    ]);
  });

  it("shows the download as the activity above the threshold", () => {
    const rate = (bytes: number): Data => ({ "libre.ethernet_download_speed": String(bytes), "libre.ethernet_upload_speed": "0" });
    expect(derive(networkThroughputIsland, null, rate(2e6)).activity).toBeNull();
    expect(derive(networkThroughputIsland, null, rate(92e6)).activity).toEqual({ id: "download", title: "↓ 92.0 MB/s", subtitle: "Ethernet" });
    expect(derive(networkThroughputIsland, null, rate(2e6), { islandMinRate: 1 }).activity).not.toBeNull();
  });
});

const VOL = "plugins.volume-plugin.default.";
const vol = (volume: string, mute = "False", device = "Speakers"): Data => ({ [`${VOL}volume`]: volume, [`${VOL}mute`]: mute, [`${VOL}device_friendly_name`]: device });

describe("Volume Mixer on the island", () => {
  it("shows a refreshing level bar when the volume moves or mutes", () => {
    expect(derive(volumeMixerIsland, vol("40"), vol("45")).notices).toEqual([
      { id: "volume", severity: "info", title: "Volume 45%", body: "Speakers", progress: 0.45, ttl: 1500, refresh: true },
    ]);
    expect(derive(volumeMixerIsland, vol("45"), vol("45", "True")).notices?.[0]).toMatchObject({ title: "Muted", progress: 0 });
    expect(derive(volumeMixerIsland, vol("45"), vol("45")).notices).toEqual([]);
    expect(derive(volumeMixerIsland, null, vol("45")).notices).toBeUndefined();
  });

  it("raises the output switching, unless turned off", () => {
    expect(derive(volumeMixerIsland, vol("45"), vol("45", "False", "Headphones")).notices).toEqual([{ id: "device", severity: "info", title: "Headphones", body: "Output device", ttl: 3000 }]);
    expect(derive(volumeMixerIsland, vol("45"), vol("45", "False", "Headphones"), { islandDevice: false }).notices).toEqual([]);
  });
});

const YR = "plugins.yr-weather-plugin.oslo.";
const weather = (rain: string, snow = "0"): Data => ({ [`${YR}temp`]: "4", [`${YR}rain`]: rain, [`${YR}snow`]: snow, [`${YR}name`]: "Oslo" });

describe("Weather on the island", () => {
  it("raises rain or snow starting, not continuing", () => {
    expect(derive(weatherIsland, weather("0"), weather("0.6")).notices?.[0]).toMatchObject({ id: "rain", title: "Rain starting", body: "0.6 mm/h · Oslo" });
    expect(derive(weatherIsland, weather("0", "0"), weather("0", "1.2")).notices?.[0]).toMatchObject({ id: "snow", title: "Snow starting" });
    expect(derive(weatherIsland, weather("0.6"), weather("1.2")).notices).toBeUndefined();
  });
});

const toast = (id: string, app = "Discord", title = "Ann", body = "hi"): Data => ({ [NOTIFICATION_LATEST]: JSON.stringify({ id, app, title, body, time: 1 }) });

describe("Notifications on the island", () => {
  it("reads the plugin's latest notification", () => {
    expect(latestNotification(toast("7"))).toEqual({ id: "7", app: "Discord", title: "Ann", body: "hi" });
    expect(latestNotification({ [NOTIFICATION_LATEST]: "nope" })).toBeNull();
  });

  it("raises nothing before it has seen a notification", () => {
    expect(derive(notificationsIsland, { other: "1" }, toast("2"), { islandApps: "Discord" }).notices).toBeUndefined();
  });

  it("lets nothing through until an app is listed", () => {
    expect(derive(notificationsIsland, toast("1"), toast("2")).notices).toBeUndefined();
  });

  it("raises a new notification from a listed app, case-insensitively, with the message unless hidden", () => {
    expect(derive(notificationsIsland, toast("1"), toast("2"), { islandApps: "discord, Teams" }).notices).toEqual([
      { id: "toast:2", group: "Discord", severity: "info", title: "Discord: Ann", body: "hi", ttl: 6000 },
    ]);
    expect(derive(notificationsIsland, toast("1"), toast("2"), { islandApps: "Discord", islandBody: false }).notices?.[0].body).toBeUndefined();
    expect(derive(notificationsIsland, toast("1"), toast("2", "Steam"), { islandApps: "Discord" }).notices).toBeUndefined();
    expect(derive(notificationsIsland, toast("2"), toast("2"), { islandApps: "Discord" }).notices).toBeUndefined();
  });
});
