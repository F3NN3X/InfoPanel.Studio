"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MotionOverride } from "@/hooks/use-performance";
import { storedPreviewData, usePreviewDataSetting } from "@/hooks/use-preview-data-setting";
import {
  getSessionOverride,
  isFrozen,
  type PreviewData,
  type PreviewSnapshot,
  previewSnapshot,
  type SnapshotState,
  setSessionOverride,
  subscribeSessionOverride,
} from "@/lib/preview-data";
import { isStudioUnfocusedLong, subscribeStudioUnfocusedLong } from "@/lib/studio-focus";

export { usePreviewDataSetting };

/** The snapshot the sensor hooks read instead of the live store (null: live). Set only around the Design canvas. */
export const FrozenSensorsContext = createContext<PreviewSnapshot | null>(null);

export interface PreviewDataState {
  mode: PreviewData;
  frozen: boolean;
  snapshot: SnapshotState;
  /** A new snapshot now. */
  refresh: () => void;
  /** Session only: live (or frozen) until the page reloads, whatever the setting. */
  setSession: (next: "live" | "frozen" | null) => void;
  session: "live" | "frozen" | null;
}

/** Whether the Design canvas is frozen now, and its snapshot. */
export function usePreviewData(): PreviewDataState {
  const [mode] = usePreviewDataSetting();
  const session = useSyncExternalStore(subscribeSessionOverride, getSessionOverride, getSessionOverride);
  const unfocused = useSyncExternalStore(subscribeStudioUnfocusedLong, isStudioUnfocusedLong, isStudioUnfocusedLong);
  const snapshot = useSyncExternalStore(previewSnapshot.subscribe, previewSnapshot.getState, previewSnapshot.getState);
  return {
    mode,
    frozen: isFrozen(mode, session, unfocused),
    snapshot,
    refresh: () => void previewSnapshot.take(),
    setSession: setSessionOverride,
    session,
  };
}

/**
 * Around the Design canvas: while frozen, its widgets read a snapshot (no streams of their own) with continuous
 * effects at one still frame (reduced motion); each freeze takes a new snapshot.
 */
export function PreviewDataProvider({ children }: { children: ReactNode }) {
  const { frozen } = usePreviewData();
  const mounted = useRef(false);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    // The page holds one snapshot, shared by every provider. One mounting onto a snapshot already taken (the
    // offscreen thumbnails' one, when Design opens) uses it: a new one would move the canvas right after it froze.
    if (frozen && (!first || previewSnapshot.getState().takenAt === null)) void previewSnapshot.take();
  }, [frozen]);
  return (
    <FrozenSensorsContext.Provider value={frozen ? previewSnapshot : null}>
      <MotionOverride reduce={frozen}>{children}</MotionOverride>
    </FrozenSensorsContext.Provider>
  );
}

/**
 * The shortcut and palette's "Freeze / go live": a session override to the other state; back to the setting when
 * that is where it lands.
 */
export function togglePreviewFrozen(): void {
  const mode = storedPreviewData();
  const frozen = isFrozen(mode, getSessionOverride(), isStudioUnfocusedLong());
  const next = frozen ? "live" : "frozen";
  setSessionOverride(isFrozen(mode, null, isStudioUnfocusedLong()) === (next === "frozen") ? null : next);
}

/** Whether a component sits on a frozen canvas. */
export const useFrozenSnapshot = (): PreviewSnapshot | null => useContext(FrozenSensorsContext);
