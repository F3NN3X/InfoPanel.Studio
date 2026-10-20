"use client";

import { usePerformance } from "./use-performance";

/**
 * True when motion should be reduced: the OS setting, unless the URL, the
 * profile or General › Motion overrides it ("reduce" / "full" beat the OS).
 */
export const useReducedMotion = (): boolean => usePerformance().reduceMotion;
