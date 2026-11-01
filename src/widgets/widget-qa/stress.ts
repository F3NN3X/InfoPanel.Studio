import type { SensorMap } from "@/modules/types";

/** Text a person reads (it has a space or is long), not a token a widget parses ("up", JSON, a URL or path). */
const isProse = (t: string) => (t.includes(" ") || t.length >= 12) && !/^[[{]|^(https?:)?\/|\.(png|jpe?g|svg|gif|webp)$/i.test(t);

/** Repeats prose until it is at least 48 characters: longer than any widget lays out at its default size. */
const lengthen = (t: string) => {
  let out = t;
  while (out.length < 48) out = `${out} · ${t}`;
  return out;
};

/** The clock plugin's readings are positions (hour 20, minute 49), not amounts: ten times larger is no time at all. */
const isCalendar = (key: string) => key.includes("clock-plugin.");

/**
 * The fixture sensors pushed to their extremes for `data=stress`: percentages at 100, every other reading ten times
 * larger (one more digit), prose and display names lengthened. Layout breaks show up with data like this long before
 * they show with typical data.
 */
export function stressSensors(sensors: SensorMap): SensorMap {
  return Object.fromEntries(
    Object.entries(sensors).map(([key, s]) => {
      const next = { ...s };
      if (typeof s.value === "number" && !isCalendar(key)) {
        next.value = s.unit === "%" ? 100 : Math.round(s.value * 1000) / 100;
        if (typeof s.max === "number") next.max = Math.max(s.max, next.value);
      }
      if (typeof s.text === "string" && isProse(s.text)) next.text = lengthen(s.text);
      if (typeof s.name === "string") next.name = `${s.name} (extended label)`;
      return [key, next];
    })
  );
}
