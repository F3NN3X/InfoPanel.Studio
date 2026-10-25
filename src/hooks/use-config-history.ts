import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DashboardConfig } from "@/lib/layout";
import { stampEdited } from "@/lib/screens/edited";
import {
  beginTransaction,
  cancelTransaction,
  commitTransaction,
  emptyHistory,
  mapHistory,
  recordChange,
  redoChange,
  resetHistory,
  undoChange,
  type History,
} from "./config-history";

/** The edit time a change stamps is no change of its own. */
const withoutStamp = (key: string, value: unknown) => (key === "updatedAt" ? undefined : value);

/** Deep equality for the config, which is plain JSON (a drag back to its start is no step). */
const sameValue = (a: DashboardConfig, b: DashboardConfig) => a === b || JSON.stringify(a, withoutStamp) === JSON.stringify(b, withoutStamp);

/** A config setter that records an undo step; `key` coalesces repeats. */
export type HistorySetter = (action: SetStateAction<DashboardConfig>, key?: string) => void;

/** Applies a change that is no studio edit to the config and every undo snapshot; returns the new config. */
export type AdoptChange = (change: (config: DashboardConfig) => DashboardConfig) => DashboardConfig;

/**
 * Undo/redo over the dashboard config. Wraps the owner's setter: every
 * change made through `set` is recorded (changes with the same `key`
 * within 500ms are one step), and undo/redo write snapshots back through
 * the same setter — so persistence and the server push see them like any
 * other edit. A config replaced from outside (the server copy arriving)
 * starts a fresh history.
 */
export function useConfigHistory(
  config: DashboardConfig,
  setConfig: Dispatch<SetStateAction<DashboardConfig>>
) {
  // The newest config, also between a set and the re-render it causes, so
  // several changes in one event chain correctly.
  const latest = useRef(config);
  const history = useRef<History<DashboardConfig>>(emptyHistory());
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });

  const apply = useCallback(
    (next: DashboardConfig, nextHistory: History<DashboardConfig>) => {
      latest.current = next;
      history.current = nextHistory;
      setCounts({ undo: nextHistory.past.length, redo: nextHistory.future.length });
      setConfig(next);
    },
    [setConfig]
  );

  useLayoutEffect(() => {
    if (config === latest.current) return;
    latest.current = config;
    history.current = resetHistory(history.current, config);
    setCounts({ undo: 0, redo: 0 });
  }, [config]);

  const set: HistorySetter = useCallback(
    (action, key) => {
      const prev = latest.current;
      const made = typeof action === "function" ? action(prev) : action;
      if (made === prev) return;
      // Each edited screen carries its edit time (the Screens page's "Last edited").
      const next = stampEdited(prev, made, new Date());
      apply(next, recordChange(history.current, prev, key, Date.now()));
    },
    [apply]
  );

  const begin = useCallback(() => {
    history.current = beginTransaction(history.current, latest.current);
  }, []);

  const commit = useCallback(() => {
    if (!history.current.txn) return;
    history.current = commitTransaction(history.current, latest.current, Date.now(), sameValue);
    setCounts({ undo: history.current.past.length, redo: history.current.future.length });
  }, []);

  /** Apply a change that is no edit of the studio's (a Settings change) to the config and every snapshot; the history stays. */
  const adopt: AdoptChange = useCallback(
    (change) => {
      const next = change(latest.current);
      latest.current = next;
      history.current = mapHistory(history.current, change);
      setConfig(next);
      return next;
    },
    [setConfig]
  );

  const cancel = useCallback(() => {
    const step = cancelTransaction(history.current);
    if (step) apply(step.value, step.history);
  }, [apply]);

  /** Whether a drag transaction is open (the shortcuts stand down meanwhile). */
  const dragging = useCallback(() => history.current.txn !== null, []);

  const undo = useCallback(() => {
    if (history.current.txn) return;
    const step = undoChange(history.current, latest.current);
    if (step) apply(step.value, step.history);
  }, [apply]);

  const redo = useCallback(() => {
    if (history.current.txn) return;
    const step = redoChange(history.current, latest.current);
    if (step) apply(step.value, step.history);
  }, [apply]);

  return { set, adopt, begin, commit, cancel, undo, redo, dragging, canUndo: counts.undo > 0, canRedo: counts.redo > 0 };
}
