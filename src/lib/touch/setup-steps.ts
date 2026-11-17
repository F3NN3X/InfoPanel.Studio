// The guided touch setup's steps (Settings › Touch, opened from a display card or "Set up a panel…"), and which one a
// reopened setup resumes at: the first that isn't done. Each step's "done" is read from the app's own state, so closing
// the dialog loses nothing but the size check, which only the person can confirm.

export const SETUP_STEPS = ["enable", "driver", "pair", "size", "show", "test"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_TITLE: Record<SetupStep, string> = {
  enable: "Turn on touch panels",
  driver: "Pick the touchscreen",
  pair: "Pair it with its screen",
  size: "Size and rotation",
  show: "Show its kiosk in InfoPanel",
  test: "Try a tap",
};

export interface SetupFacts {
  enabled: boolean;
  /** The touchscreens plugged in; null until listed. */
  screens: readonly { ready: boolean }[] | null;
  /** The panel being set up has its USB port pinned (pairing did it). */
  paired: boolean;
  /** The size and rotation were confirmed in this setup. */
  sizeConfirmed: boolean;
  /** A kiosk shows this panel's page now. */
  kioskOnline: boolean;
  /** A tap from this panel arrived. */
  tapped: boolean;
}

/** Whether `step` is done. A kiosk already showing the panel means its size was right, so a resumed setup skips it. */
export function stepDone(step: SetupStep, f: SetupFacts): boolean {
  switch (step) {
    case "enable":
      return f.enabled;
    case "driver":
      return f.screens?.some((s) => s.ready) ?? false;
    case "pair":
      return f.paired;
    case "size":
      return f.sizeConfirmed || (f.paired && f.kioskOnline);
    case "show":
      return f.kioskOnline;
    case "test":
      return f.tapped;
  }
}

/** The step a setup opens at: the first not done, or null when every step is. */
export function firstUnfinished(f: SetupFacts): SetupStep | null {
  return SETUP_STEPS.find((s) => !stepDone(s, f)) ?? null;
}
