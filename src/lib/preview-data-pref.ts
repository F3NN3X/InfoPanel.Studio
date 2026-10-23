// The Design preview data setting (src/lib/preview-data.ts): its values, and whether they freeze the canvas. Kept apart
// from the snapshot so the Settings window can show the setting without the sensor store.

export type PreviewData = "live" | "frozen" | "frozenWhenUnfocused";
export const PREVIEW_DATA_CHOICES: readonly PreviewData[] = ["live", "frozen", "frozenWhenUnfocused"];

/** localStorage key (a studio preference: not in the config, so kiosks never see it). */
export const PREVIEW_DATA_KEY = "studio.previewData";

/** The setting's choices, in Settings › Studio and Settings › General › Window. */
export const PREVIEW_DATA_OPTIONS: { value: PreviewData; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "frozen", label: "Frozen" },
  { value: "frozenWhenUnfocused", label: "Frozen when unfocused" },
];
export const PREVIEW_DATA_HINT =
  "Frozen shows a snapshot of the sensor values on the Design canvas with effects still, and uses less CPU. Frozen when unfocused: live while you work, frozen a minute after the studio loses focus. Kiosks, Kiosk view and the Data view stay live.";

export function parsePreviewData(raw: string | null): PreviewData {
  return PREVIEW_DATA_CHOICES.includes(raw as PreviewData) ? (raw as PreviewData) : "live";
}

/** A session-only choice that wins over the setting until the page reloads ("Go live for this session"). */
export type SessionOverride = "live" | "frozen" | null;

/** Whether the canvas is frozen: the session override, else the setting (`frozenWhenUnfocused` follows focus). */
export function isFrozen(mode: PreviewData, session: SessionOverride, unfocusedLong: boolean): boolean {
  if (session) return session === "frozen";
  return mode === "frozen" || (mode === "frozenWhenUnfocused" && unfocusedLong);
}
