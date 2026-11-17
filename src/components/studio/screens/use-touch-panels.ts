import { useEffect, useState } from "react";
import { isTauri, touchScreens, touchView } from "@/lib/desktop";
import type { Touchscreen, TouchView } from "@/settings/types";

/** The panels' state is re-read this often while Screens is open: a device's status changes by itself. */
const POLL_MS = 3000;

/** What the display cards read of touch: the panels in touch.json, their devices' state and the touchscreens. */
export interface TouchPanels {
  /** Touch runs only in the desktop app; a browser studio says so on its cards. */
  desktop: boolean;
  view: TouchView | null;
  screens: Touchscreen[] | null;
}

/** The touch panels' state from the desktop app, polled while mounted; nothing in a browser. */
export function useTouchPanels(): TouchPanels {
  const desktop = isTauri();
  const [view, setView] = useState<TouchView | null>(null);
  const [screens, setScreens] = useState<Touchscreen[] | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const read = async () => {
      const v = await touchView();
      // The USB devices are listed only while touch is on: with it off every card says Off anyway.
      const s = v?.enabled ? await touchScreens() : undefined;
      if (!alive) return;
      setView(v ?? null);
      setScreens(s ?? null);
    };
    void read();
    const timer = window.setInterval(() => void read(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [desktop]);
  return { desktop, view, screens };
}
