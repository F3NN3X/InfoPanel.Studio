/** The Steam widgets, from the InfoPanel.SteamAPI plugin's containers (Profile, Session, Achievements, Social, Library, News). */
import type { DataApiValue } from "../../sensors.ts";
import { across, bar, column, table, value, webImage, type Converter } from "./kit.ts";

const P = "plugins.InfoPanel.SteamAPI.SteamAPI-";
const has = (s: Readonly<Record<string, DataApiValue>>, key: string) => s[key] !== undefined;

export const steamProfile: Converter = (box, ctx) => {
  const [avatar, text] = across(box, [1, 2.4]);
  const side = Math.min(avatar.w, avatar.h);
  const rows = column(text, [2, 1, 1], 4);
  const k = (e: string) => `${P}Profile.${e}`;
  if (!has(ctx.sensors, k("player-name"))) return [];
  return [
    ...(has(ctx.sensors, k("profile_image_url")) ? [webImage(ctx, { ...avatar, w: side, h: side }, "Avatar", k("profile_image_url"))] : []),
    value(ctx, rows[0], "Player", k("player-name"), { bold: true, size: rows[0].h * 0.6 }),
    ...(has(ctx.sensors, k("online-status")) ? [value(ctx, rows[1], "Status", k("online-status"), { sub: true, size: rows[1].h * 0.7 })] : []),
    ...(has(ctx.sensors, k("steam-level")) ? [value(ctx, rows[2], "Level", k("steam-level"), { sub: true, unit: true, size: rows[2].h * 0.7 })] : []),
  ];
};

export const steamGame: Converter = (box, ctx) => {
  const game = `${P}Session.current-game`;
  if (!has(ctx.sensors, game)) return [];
  const banner = `${P}Profile.current_game_banner_url`;
  const art = has(ctx.sensors, banner);
  const rows = column(box, art ? [3, 1, 1] : [1, 1], 4);
  const i = art ? 1 : 0;
  const time = `${P}Session.current-game-playtime`;
  return [
    ...(art ? [webImage(ctx, rows[0], "Banner", banner)] : []),
    value(ctx, rows[i], "Game", game, { bold: true, size: rows[i].h * 0.7 }),
    ...(has(ctx.sensors, time) ? [value(ctx, rows[i + 1], "Playtime", time, { sub: true, size: rows[i + 1].h * 0.6 })] : []),
  ];
};

export const achievements: Converter = (box, ctx) => {
  const k = (e: string) => `${P}Achievements.${e}`;
  if (!has(ctx.sensors, k("achievements-unlocked"))) return [];
  const [icon, text] = across(box, [1, 2.4]);
  const side = Math.min(icon.w, icon.h);
  const rows = column(text, [1.4, 0.6, 1], 4);
  return [
    ...(has(ctx.sensors, k("latest-achievement-icon")) ? [webImage(ctx, { ...icon, w: side, h: side }, "Latest icon", k("latest-achievement-icon"))] : []),
    value(ctx, rows[0], "Unlocked", k("achievements-unlocked"), { bold: true, unit: true, size: rows[0].h * 0.6 }),
    ...(has(ctx.sensors, k("achievements-total")) ? [bar(ctx, rows[1], "Progress", k("achievements-unlocked"), ctx.sensors[k("achievements-total")]?.value || 100)] : []),
    ...(has(ctx.sensors, k("latest-achievement")) ? [value(ctx, rows[2], "Latest", k("latest-achievement"), { sub: true, size: rows[2].h * 0.7 })] : []),
  ];
};

const tableOf = (key: string, name: string): Converter => (box, ctx) => (has(ctx.sensors, key) ? [table(ctx, box, name, key, 6)] : []);

export const steamFriends = tableOf(`${P}Social.friends-activity`, "Friends");
export const steamLibrary = tableOf(`${P}Library.recent-games`, "Recent games");
export const steamNews = tableOf(`${P}News.library-news`, "News");
