import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { FrozenSensorsContext } from "@/hooks/use-preview-data";
import type { PreviewSnapshot } from "@/lib/preview-data";
import { sensorStore } from "@/lib/sensor-store";
import { touches } from "@/lib/sensor-stream";
import type { SensorMap } from "@/modules/types";

export interface SensorValue {
  value?: number;
  text?: string;
  unit: string;
  min?: number;
  max?: number;
  avg?: number;
  /** Human-readable display name (e.g. "CPU Package Temp") */
  name?: string;
  source?: string;
}

interface View {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): SensorMap;
}

/** The live store: retains the namespaces while subscribed and re-renders on a change under `list`. */
function liveView(list: string[] | null): View {
  let snapshot = sensorStore.getValues();
  return {
    subscribe(onChange) {
      const release = list && list.length === 0 ? () => {} : sensorStore.retain(list);
      const unsubscribe = sensorStore.subscribe((changed) => {
        if (!touches(changed, list)) return;
        snapshot = sensorStore.getValues();
        onChange();
      });
      // Catch up on anything that arrived before this subscription.
      snapshot = sensorStore.getValues();
      return () => {
        unsubscribe();
        release();
      };
    },
    getSnapshot: () => snapshot,
  };
}

/** The frozen Design canvas: the snapshot's values, no stream; a key the snapshot lacks is read once. */
function frozenView(frozen: PreviewSnapshot, list: string[] | null): View {
  return {
    subscribe(onChange) {
      if (list) frozen.ensure(list);
      return frozen.subscribe(onChange);
    },
    getSnapshot: () => frozen.getState().values,
  };
}

/**
 * The live sensor map, re-rendering only when a key under one of
 * `prefixes` changes (`null` = any key, and every stream). Mounting it keeps
 * those namespaces' streams open. The map holds every streamed key, so
 * callers read it exactly as before. On a frozen Design canvas (`PreviewDataProvider`) it is the snapshot instead,
 * and opens nothing.
 */
export function useSensors(prefixes: readonly string[] | null): SensorMap {
  const signature = prefixes === null ? "*" : prefixes.join("\n");
  const frozen = useContext(FrozenSensorsContext);
  const view = useMemo(() => {
    const list = prefixes === null ? null : signature === "" ? [] : signature.split("\n");
    return frozen ? frozenView(frozen, list) : liveView(list);
    // `signature` captures `prefixes` by value.
  }, [signature, frozen]);
  // The server snapshot is the same map (a static render, e.g. a test, reads the current values).
  return useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
}

/** Timestamp of the last sensor message (0 before the first). */
export function useSensorsTimestamp(): number {
  return useSyncExternalStore(sensorStore.subscribeTick, sensorStore.getTimestamp);
}

/** Whether every open sensor stream is connected. */
export function useSensorsConnected(): boolean {
  return useSyncExternalStore(sensorStore.subscribeStatus, sensorStore.isConnected);
}

/**
 * Keeps a fast (100 ms) stream open for `prefix` while mounted (`null` = none): the audio widgets'
 * levels and spectrum. The values reach `useSensors` readers through the same map. None on a frozen Design canvas.
 */
export function useFastSensors(prefix: string | null): void {
  const frozen = useContext(FrozenSensorsContext) !== null;
  useEffect(() => (prefix && !frozen ? sensorStore.retainFast(prefix) : undefined), [prefix, frozen]);
}
