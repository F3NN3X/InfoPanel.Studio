import type { MonitorProfile } from "@/lib/layout";

/** The largest size in the profile's aspect ratio that fits the box (at least 1px each way). */
export function fitPage(
  profile: Pick<MonitorProfile, "width" | "height">,
  boxW: number,
  boxH: number
): { width: number; height: number } {
  const ratio = profile.width > 0 && profile.height > 0 ? profile.width / profile.height : 16 / 9;
  const width = Math.min(boxW, boxH * ratio);
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / ratio)) };
}
