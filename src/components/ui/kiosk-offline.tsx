import { useEffect, useState } from "react";
import { useSensorsConnected, useSensorsTimestamp } from "@/hooks/useSensors";
import { DISCONNECT_DEBOUNCE_MS } from "@/lib/island/system";

/**
 * The kiosk's corner cue that the Data API dropped: the values on screen are the last ones received. It follows the
 * island's rule (a drop under `DISCONNECT_DEBOUNCE_MS` shows nothing) and gives way to the island, which has its own notice.
 */
export function KioskOfflinePill({ island }: { island: boolean }) {
  const connected = useSensorsConnected();
  // with no data yet there are no last values to name: the waiting line speaks then
  const received = useSensorsTimestamp() > 0;
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (connected) return setDown(false);
    const timer = setTimeout(() => setDown(true), DISCONNECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [connected]);
  // the status region stays mounted so the text is announced when it appears
  return (
    <div role="status" className="pointer-events-none fixed bottom-3 right-3 z-[55]">
      {down && !connected && received && !island && (
        <span className="rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow">
          Data API disconnected. Showing the last values
        </span>
      )}
    </div>
  );
}
