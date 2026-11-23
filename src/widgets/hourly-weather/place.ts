// Hourly Weather's reading of the server's weather by place (`weather.place.<id>.`, `ips-server weather.rs`): the place a
// `places` setting holds, and the hours the server sent for it. Pure.
import { get, num } from "../core/data";
import type { Data } from "../core/types";
import { placePrefix } from "../recipe/weather";
import type { Place } from "../recipe/types";

/** The first place of a `places` setting (JSON text of `{ name, lat, lon }` items), or undefined when none is a place. */
export function firstPlace(stored: unknown): Place | undefined {
  let list: unknown;
  try {
    list = typeof stored === "string" ? JSON.parse(stored) : stored;
  } catch {
    return undefined;
  }
  if (!Array.isArray(list)) return undefined;
  const p = list.find((x): x is Place => !!x && typeof x === "object" && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180);
  return p && { name: typeof p.name === "string" ? p.name : "", lat: p.lat, lon: p.lon };
}

/** One forecast hour; the temperature in °C as the server sends it. */
export interface Hour {
  /** Local time at the place, `HH:00`. */
  time: string;
  temp: number;
  /** The words for the weather code ("Light rain"), for the icon and the tooltip. */
  condition: string;
  /** Chance of rain, 0-100; NaN when the provider sent none. */
  rain: number;
  night: boolean;
}

/** The hours the server holds for `place`, at most `count`, up to the first one missing a temperature. */
export function hoursOf(data: Data | undefined, place: Place, count: number): Hour[] {
  const p = placePrefix(place);
  const out: Hour[] = [];
  for (let n = 0; n < count; n++) {
    const temp = num(get(data, `${p}hourly.${n}.temp`));
    if (!Number.isFinite(temp)) break;
    out.push({
      time: get(data, `${p}hourly.${n}.time`),
      temp,
      condition: get(data, `${p}hourly.${n}.condition`),
      rain: num(get(data, `${p}hourly.${n}.precip`)),
      night: get(data, `${p}hourly.${n}.is_day`) === "0",
    });
  }
  return out;
}
