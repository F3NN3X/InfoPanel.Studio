/** The hand-written converters, by registry module id. A module without one is decomposed from its tagged values (`decompose.ts`). */
import { clock } from "./clock.ts";
import { driveSpace } from "./drive-space.ts";
import type { Converter } from "./kit.ts";
import { nowPlaying } from "./now-playing.ts";
import { achievements, steamFriends, steamGame, steamLibrary, steamNews, steamProfile } from "./steam.ts";
import { weather } from "./weather.ts";

export const CONVERTERS: Readonly<Record<string, Converter>> = {
  Weather: weather,
  NowPlaying: nowPlaying,
  SteamProfile: steamProfile,
  SteamGame: steamGame,
  Achievements: achievements,
  SteamFriends: steamFriends,
  SteamLibrary: steamLibrary,
  SteamNews: steamNews,
  Clock: clock,
  DriveSpace: driveSpace,
};

export type { Converter } from "./kit.ts";
