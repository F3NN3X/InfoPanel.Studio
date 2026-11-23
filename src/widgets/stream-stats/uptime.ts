import { useRef } from "react";
import { useNow } from "../time-hooks";

/**
 * The seconds on air, ticking each second between the server's readings (they come every 2 s, which would make the timer
 * jump): the last reading plus the time since it arrived.
 */
export function useUptime(streaming: boolean, reading: number): number {
  const seen = useRef({ reading: -1, at: 0 });
  if (seen.current.reading !== reading) seen.current = { reading, at: Date.now() };
  const now = useNow(1000, streaming);
  return streaming ? reading + Math.max(0, Math.floor((now - seen.current.at) / 1000)) : 0;
}
