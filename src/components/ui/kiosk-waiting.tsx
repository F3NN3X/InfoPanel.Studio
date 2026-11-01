import { useEffect, useState } from "react";
import { useSensorsTimestamp } from "@/hooks/useSensors";
import { KIOSK_WAIT_MS } from "./kiosk-connecting";

/**
 * The kiosk's line for a page with nothing to draw because no sensor data has arrived: after a short wait, and only
 * while the zone grid before it is empty (a page that is blank by design, or one already showing a widget, stays as is).
 */
export function KioskWaitingForData() {
  const received = useSensorsTimestamp() > 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), KIOSK_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  // the status region stays mounted so the line is announced when its text appears (a region added with its text often isn't)
  const show = slow && !received;
  return (
    <p
      role="status"
      className="pointer-events-none fixed inset-0 hidden items-center justify-center p-6 text-center text-sm text-muted-foreground [.grid:empty+&]:flex"
    >
      {show ? "Waiting for data. Check that InfoPanel and its plugins are running." : null}
    </p>
  );
}
