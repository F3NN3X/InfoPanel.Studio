import { useEffect, useState } from "react";

/** How long the kiosk stays blank before it says it is waiting for the server. */
export const KIOSK_WAIT_MS = 3000;

/** The kiosk's screen before the server's config has arrived: blank at first, then a message if it takes too long. */
export function KioskConnecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), KIOSK_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="grid h-screen place-items-center text-sm text-muted-foreground">
      Waiting for InfoPanel Studio. Check that it is running.
    </div>
  );
}
