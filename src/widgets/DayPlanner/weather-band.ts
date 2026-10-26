// The Day Planner's weather band. The server holds no hourly forecast: it has the current temperature and rain
// and one hi / lo / rain row per day, so the hours are modelled from those (a daily swing peaking mid-afternoon).
// Pure.

export interface ForecastDay {
  /** Day of the month, and the month (0-11), from the row's "Mon 26 Oct". */
  day: number;
  month: number;
  hi: number;
  lo: number;
  /** The day's rain, mm. */
  rain: number;
}

export interface BandPoint {
  at: number;
  /** °C. */
  temp: number;
  /** 0-1, from mm per hour. */
  rain: number;
}

export interface BandInput {
  /** Current temperature, °C, and rain, mm/h; NaN when unknown. */
  temp: number;
  rain: number;
  days: readonly ForecastDay[];
}

const HOUR = 3_600_000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** The hour of day the temperature peaks. */
const PEAK = 15;
/** mm per hour that draws as full rain. */
const FULL_RAIN = 2;

/** One forecast row's date and range ("Mon 26 Oct", "14 °C / 8 °C", "9.1mm"); null when it does not parse. */
export function forecastDay(dateText: string, range: string, mm: string): ForecastDay | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(dateText);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const [hi, lo] = range.split("/").map((x) => parseFloat(x));
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { day: Number(m[1]), month, hi, lo, rain: parseFloat(mm) || 0 };
}

const hourOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60;
};
const swing = (t: number) => Math.cos(((hourOf(t) - PEAK) / 24) * 2 * Math.PI);

/**
 * One point per hour of the window. A day with a forecast row swings between its lo and hi; a day without one
 * (today, which the plugin does not list) swings by the first row's range around the level that meets the current
 * temperature. Rain is the day's total spread over its hours; today's follows the current rate and fades out.
 * Null when there is nothing to draw.
 */
export function weatherBand(win: { start: number; end: number }, now: number, input: BandInput): BandPoint[] | null {
  const known = Number.isFinite(input.temp);
  if (!known && input.days.length === 0) return null;
  const amp = input.days.length ? (input.days[0].hi - input.days[0].lo) / 2 : 3;
  const mid = known ? input.temp - amp * swing(now) : (input.days[0].hi + input.days[0].lo) / 2;
  const points: BandPoint[] = [];
  for (let t = Math.ceil(win.start / HOUR) * HOUR; t <= win.end; t += HOUR) {
    const d = new Date(t);
    const row = input.days.find((x) => x.day === d.getDate() && x.month === d.getMonth());
    const temp = row ? (row.hi + row.lo) / 2 + ((row.hi - row.lo) / 2) * swing(t) : mid + amp * swing(t);
    const perHour = row ? row.rain / 24 : Number.isFinite(input.rain) ? input.rain * Math.max(0, 1 - Math.max(0, t - now) / (3 * HOUR)) : 0;
    points.push({ at: t, temp, rain: Math.min(1, Math.max(0, perHour / FULL_RAIN)) });
  }
  return points.length >= 2 ? points : null;
}
