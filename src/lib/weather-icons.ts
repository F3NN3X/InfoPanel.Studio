export type WeatherKind = "clear" | "mostly-clear" | "partly-cloudy" | "cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "heavy-rain" | "sleet" | "snow" | "hail" | "thunder" | "wind";

export interface WeatherCondition {
  kind: WeatherKind;
  night: boolean;
}

// OpenWeatherMap icon codes ("01d" .. "50n"): the two digits are the condition.
const OWM: Record<string, WeatherKind> = { "01": "clear", "02": "mostly-clear", "03": "partly-cloudy", "04": "overcast", "09": "rain", "10": "rain", "11": "thunder", "13": "snow", "50": "fog" };

// Condition words, most specific first; Yr symbol codes ("lightrainshowers_day") and the plugins' descriptions both read through these.
const RULES: [RegExp, WeatherKind][] = [
  [/thunder|storm/, "thunder"],
  [/hail/, "hail"],
  [/sleet/, "sleet"],
  [/snow/, "snow"],
  [/(heavy|violent|torrential|extreme).*(rain|shower)|(rain|shower).*(heavy|violent|torrential)/, "heavy-rain"],
  [/drizzle/, "drizzle"],
  [/rain|shower|shauer|regn/, "rain"],
  [/fog|mist|haze/, "fog"],
  [/wind|gale|breezy/, "wind"],
  [/overcast/, "overcast"],
  [/mostly clear|mainly clear|mostly sunny|mainly sunny/, "mostly-clear"],
  [/partly|fair|few clouds|scattered/, "partly-cloudy"],
  [/cloud/, "cloudy"],
  [/clear|sun/, "clear"],
];

const kindOf = (s: string): WeatherKind | undefined => RULES.find(([re]) => re.test(s))?.[1];

/**
 * The condition and day/night from a provider icon code (Yr symbol codes, OpenWeatherMap "10n"), else the description.
 * `night` seeds the result for a caller that knows it is night; a code or text saying night turns it on.
 */
export function weatherKind(code: string | undefined, text: string | undefined, night = false): WeatherCondition {
  const c = String(code ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const t = String(text ?? "").toLowerCase();
  const owm = c.match(/^(\d{2})([dn])$/);
  const kind = (owm ? OWM[owm[1]] : kindOf(c)) ?? kindOf(t) ?? "partly-cloudy";
  return { kind, night: night || owm?.[2] === "n" || /night/.test(c) || /night/.test(t) };
}

/** Today's app icon (a Material Symbols name) for a condition. */
export function appIconName({ kind, night }: WeatherCondition): string {
  switch (kind) {
    case "thunder":
      return "thunderstorm";
    case "snow":
    case "sleet":
      return "weather_snowy";
    case "rain":
    case "heavy-rain":
    case "drizzle":
    case "hail":
      return "rainy";
    case "fog":
      return "foggy";
    case "partly-cloudy":
      return night ? "partly_cloudy_night" : "partly_cloudy_day";
    case "cloudy":
    case "overcast":
    case "wind":
      return "cloud";
    case "clear":
    case "mostly-clear":
      return night ? "clear_night" : "clear_day";
  }
}

/** The Meteocons file name (without ".svg") for a condition; the vendored set is listed in tools/vendor-meteocons.mjs. */
export function meteoconName({ kind, night }: WeatherCondition): string {
  const t = night ? "night" : "day";
  switch (kind) {
    case "clear":
    case "mostly-clear":
      return `clear-${t}`;
    case "partly-cloudy":
      return `partly-cloudy-${t}`;
    case "cloudy":
      return "cloudy";
    case "overcast":
      return `overcast-${t}`;
    case "fog":
      return `fog-${t}`;
    case "heavy-rain":
      return `extreme-${t}-rain`;
    case "thunder":
      return `thunderstorms-${t}`;
    case "wind":
      return "wind";
    default:
      return `partly-cloudy-${t}-${kind}`;
  }
}
