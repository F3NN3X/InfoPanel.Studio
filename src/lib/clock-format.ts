import { formatDate } from "@/lib/infopanel/dotnet-format";

/**
 * The clock widget's text for a .NET `Format` (InfoPanel's Clock and Calendar `Format`): `DateTime.ToString`
 * of now, or of today at midnight for a date. null: no format, or one .NET rejects, so the widget's own
 * time and date show instead.
 */
export function customClockText(now: Date, part: "time" | "date", format: string | undefined): string | null {
  if (!format) return null;
  const at = part === "date" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : now;
  try {
    return formatDate(at, format);
  } catch {
    return null;
  }
}
