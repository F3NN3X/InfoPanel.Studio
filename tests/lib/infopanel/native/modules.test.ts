import { describe, expect, it } from "vitest";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import type { ConvertContext, Rect } from "../../../../src/lib/infopanel/native/items.ts";
import { CONVERTERS } from "../../../../src/lib/infopanel/native/modules/index.ts";
import { MODULE_TIERS } from "../../../../src/lib/infopanel/native/tiers.ts";
import type { DisplayItem, GroupItem } from "../../../../src/lib/infopanel/schema.ts";
import type { DataApiValue } from "../../../../src/lib/infopanel/sensors.ts";

const look = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF101010" };
const box: Rect = { x: 100, y: 50, w: 400, h: 200 };

/** A plugin reading as the Data API reports it: key `plugins.a.b.c`, ref `plugin:/a/b/c`. */
const plugin = (path: string, v: Partial<DataApiValue> = { text: "x" }): [string, DataApiValue] => [`plugins.${path.replaceAll("/", ".")}`, { ...v, ref: `plugin:/${path}` }];
const sensors = (entries: [string, DataApiValue][]): Record<string, DataApiValue> => Object.fromEntries(entries);
const ctx = (s: Record<string, DataApiValue>): ConvertContext => ({ look, palette: defaultPalette(look), sensors: s, notes: [] });
const kinds = (items: DisplayItem[]) => items.map((i) => i.kind);
const ids = (items: DisplayItem[]) => items.map((i) => ("PluginSensorId" in i ? i.PluginSensorId : ""));

describe("Weather", () => {
  const s = sensors(["temp", "weather_desc", "humidity", "weather_icon_url", "forecast"].map((e) => plugin(`yr-weather-plugin/brevik-norway/${e}`)));

  it("reads the temperature, conditions and icon from the yr plugin, with the forecast table", () => {
    const items = CONVERTERS.Weather(box, ctx(s), { showForecast: true });
    expect(kinds(items)).toEqual(["HttpImage", "Sensor", "Sensor", "Sensor", "TableSensor"]);
    expect(ids(items)).toContain("/yr-weather-plugin/brevik-norway/temp");
    expect(items.every((i) => i.X >= box.x && i.Y >= box.y)).toBe(true);
  });

  it("drops the forecast and the stats when the widget hides them, and does nothing without the plugin", () => {
    expect(kinds(CONVERTERS.Weather(box, ctx(s), { showForecast: false, showStats: false }))).toEqual(["HttpImage", "Sensor", "Sensor"]);
    expect(CONVERTERS.Weather(box, ctx({}), {})).toEqual([]);
  });
});

describe("Now Playing", () => {
  const entries = ["current-track", "artist", "track-progress", "elapsed-time", "remaining-time", "cover-art"];

  it("makes the cover, track, artist, progress bar and times from the media plugin", () => {
    const items = CONVERTERS.NowPlaying(box, ctx(sensors(entries.map((e) => plugin(`media-plugin/media/${e}`)))), {});
    expect(kinds(items)).toEqual(["HttpImage", "Sensor", "Sensor", "Bar", "Sensor", "Sensor"]);
  });

  it("falls to the Spotify plugin when that is the one running", () => {
    const items = CONVERTERS.NowPlaying(box, ctx(sensors([plugin("spotify-plugin/spotify/current-track")])), {});
    expect(ids(items)).toEqual(["/spotify-plugin/spotify/current-track"]);
  });
});

describe("Steam", () => {
  const P = "InfoPanel.SteamAPI/SteamAPI-";
  const s = sensors([
    ...["player-name", "online-status", "steam-level", "profile_image_url"].map((e) => plugin(`${P}Profile/${e}`)),
    plugin(`${P}Achievements/achievements-unlocked`, { value: 12 }),
    plugin(`${P}Achievements/achievements-total`, { value: 40 }),
    plugin(`${P}Achievements/latest-achievement`),
    plugin(`${P}Social/friends-activity`),
    plugin(`${P}Library/recent-games`),
    plugin(`${P}News/library-news`),
  ]);

  it("profile: avatar, name, status and level", () => {
    expect(kinds(CONVERTERS.SteamProfile(box, ctx(s), {}))).toEqual(["HttpImage", "Sensor", "Sensor", "Sensor"]);
  });

  it("achievements: a bar that runs to the total", () => {
    const items = CONVERTERS.Achievements(box, ctx(s), {});
    expect(items.find((i) => i.kind === "Bar")).toMatchObject({ MaxValue: 40 });
  });

  it("friends, library and news are plugin tables", () => {
    for (const id of ["SteamFriends", "SteamLibrary", "SteamNews"]) expect(kinds(CONVERTERS[id](box, ctx(s), {}))).toEqual(["TableSensor"]);
  });

  it("game: nothing without a current game", () => {
    expect(CONVERTERS.SteamGame(box, ctx(s), {})).toEqual([]);
  });
});

describe("Clock", () => {
  const s = sensors(["second", "minute", "12-hour"].map((e) => plugin(`clock-plugin/clock/${e}`)));

  it("digital: a Clock over a Calendar, with a 12-hour format when asked", () => {
    const items = CONVERTERS.Clock(box, ctx({}), { format: "12h", showSeconds: false });
    expect(items).toMatchObject([{ kind: "Clock", Format: "hh:mm tt" }, { kind: "Calendar" }]);
  });

  it("analog: a dial and a needle Gauge per hand, bound to the clock plugin", () => {
    const items = CONVERTERS.Clock(box, ctx(s), { face: "analog" });
    expect(kinds(items)).toEqual(["Shape", "Gauge", "Gauge", "Gauge"]);
    expect(ids(items).slice(1)).toEqual(["/clock-plugin/clock/12-hour", "/clock-plugin/clock/minute", "/clock-plugin/clock/second"]);
    expect(items[1]).toMatchObject({ MaxValue: 12 });
    expect(CONVERTERS.Clock(box, ctx(s), { face: "analog", showSeconds: false })).toHaveLength(3);
    expect(CONVERTERS.Clock(box, ctx({}), { face: "analog" })).toEqual([]);
  });
});

describe("Drive Space", () => {
  const drive = (n: number): [string, DataApiValue][] => [
    [`used${n}`, { value: 40, unit: "%", name: `Disk ${n} Used Space`, ref: `libre:/nvme/${n}/load/${50 + n}` }],
    [`free${n}`, { value: 900, unit: "GB", name: `Disk ${n} Free Space`, ref: `libre:/nvme/${n}/data/${3 + n}` }],
  ];

  it("is the Drives element sized to the box, one tile per drive", () => {
    const [group] = CONVERTERS.DriveSpace(box, ctx(sensors([...drive(1), ...drive(2)])), {}) as GroupItem[];
    expect(group.kind).toBe("Group");
    expect(group.X).toBe(box.x);
    expect(group.DisplayItems.length).toBeGreaterThan(0);
    expect(CONVERTERS.DriveSpace(box, ctx({}), {})).toEqual([]);
  });
});

describe("the tier table and the converters agree", () => {
  it("every converter belongs to a module marked built", () => {
    for (const id of Object.keys(CONVERTERS)) expect(MODULE_TIERS[id]?.built, id).toBe(true);
  });
});
