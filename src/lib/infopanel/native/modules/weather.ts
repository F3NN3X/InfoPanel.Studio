/** Weather: the yr plugin's temperature, conditions and icon (an image URL), with its forecast table when the widget shows one. */
import { across, column, container, table, value, webImage, type Converter } from "./kit.ts";

const YR = /^plugins\.yr-weather-plugin\.[^.]+\./;

export const weather: Converter = (box, ctx, s) => {
  const c = container(ctx.sensors, YR, "temp");
  if (!c) return [];
  const forecast = s.showForecast !== false && ctx.sensors[c + "forecast"] ? ctx.sensors[c + "forecast"] : undefined;
  const [top, bottom] = forecast ? column(box, [1, 1], 8) : [box, undefined];
  const [icon, text] = across(top, [1, 2.2]);
  const side = Math.min(icon.w, icon.h);
  const rows = column(text, s.showStats === false ? [2, 1] : [2, 1, 1], 4);
  return [
    ...(ctx.sensors[c + "weather_icon_url"] ? [webImage(ctx, { ...icon, w: side, h: side }, "Weather icon", c + "weather_icon_url")] : []),
    value(ctx, rows[0], "Temperature", c + "temp", { bold: true, unit: true }),
    ...(ctx.sensors[c + "weather_desc"] ? [value(ctx, rows[1], "Conditions", c + "weather_desc", { sub: true, size: rows[1].h * 0.7 })] : []),
    ...(s.showStats !== false && ctx.sensors[c + "humidity"] ? [value(ctx, rows[2], "Humidity", c + "humidity", { sub: true, unit: true, size: rows[2].h * 0.7 })] : []),
    ...(bottom ? [table(ctx, bottom, "Forecast", c + "forecast", 5)] : []),
  ];
};
