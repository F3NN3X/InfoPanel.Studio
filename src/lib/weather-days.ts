const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The weekday of a forecast date ("Tue 13 Oct" -> "Tue"). */
export const weekdayLabel = (date: string): string => String(date ?? "").trim().split(/\s+/)[0] ?? "";

/** Whether a forecast date ("Tue 13 Oct") is `now`'s day; a date that doesn't parse is not. */
export function isToday(date: string, now: Date): boolean {
  const m = String(date ?? "").trim().match(/^\w+\s+(\d{1,2})\s+(\w{3})/);
  return !!m && Number(m[1]) === now.getDate() && m[2].toLowerCase() === MONTHS[now.getMonth()];
}
