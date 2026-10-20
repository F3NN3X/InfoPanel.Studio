import { describe, expect, it } from "vitest";
import { type IslandUpdate } from "@/lib/island/sources";
import type { ModuleSettings } from "@/modules/types";
import type { Data } from "../core/types";
import { achievementsIsland, fpsIsland, gameOf } from "./gaming";
import { drivesOf, driveSpaceIsland, networkAdaptersIsland } from "./hardware";
import { NOTIFICATION_LATEST, notificationsIsland, weatherIsland } from "./info";

type Def = { derive(prev: Data | null, next: Data, settings: ModuleSettings): IslandUpdate };
const derive = (def: Def, prev: Data | null, next: Data, settings: ModuleSettings = {}) => def.derive(prev, next, settings);

const RTSS = "plugins.InfoPanel.RTSS.rtss.";
const game = (fps: string, title = "​ARC Raiders​"): Data => ({ [`${RTSS}fps`]: fps, [`${RTSS}windowtitle`]: title });

describe("FPS Monitor on the island", () => {
  it("shows the game and its FPS as the activity, with zero-width characters stripped", () => {
    expect(gameOf(game("142 FPS"))).toEqual({ name: "ARC Raiders", fps: 142 });
    expect(derive(fpsIsland, null, game("142 FPS")).activity).toEqual({ id: "game", title: "ARC Raiders", subtitle: "142 FPS" });
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

});

const NET = "plugins.network-info-plugin.";
const adapter = (status: string, ip = "1.2.3.4"): Data => ({ [`${NET}{A}.name`]: "Ethernet", [`${NET}{A}.status`]: status, [`${NET}public-ip.ipv4`]: ip });

describe("Network on the island", () => {
  it("raises an adapter dropping and coming back", () => {
    expect(derive(networkAdaptersIsland, adapter("Up"), adapter("Down")).notices).toEqual([{ id: "link:{A}", severity: "warning", title: "Ethernet disconnected", ttl: 6000 }]);
    expect(derive(networkAdaptersIsland, adapter("Down"), adapter("Up")).notices?.[0]).toMatchObject({ severity: "info", title: "Ethernet connected" });
    expect(derive(networkAdaptersIsland, null, adapter("Down")).notices).toBeUndefined();
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

  it("raises a new notification from a listed app, case-insensitively, with the message unless hidden", () => {
    expect(derive(notificationsIsland, toast("1"), toast("2"), { islandApps: "discord, Teams" }).notices).toEqual([
      { id: "toast:2", group: "Discord", severity: "info", title: "Discord: Ann", body: "hi", ttl: 6000 },
    ]);
    expect(derive(notificationsIsland, toast("1"), toast("2"), { islandApps: "Discord", islandBody: false }).notices?.[0].body).toBeUndefined();
    expect(derive(notificationsIsland, toast("1"), toast("2", "Steam"), { islandApps: "Discord" }).notices).toBeUndefined();
    expect(derive(notificationsIsland, toast("2"), toast("2"), { islandApps: "Discord" }).notices).toBeUndefined();
  });
});
