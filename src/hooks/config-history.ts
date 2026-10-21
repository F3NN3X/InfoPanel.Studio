/*
 * Undo/redo stacks of whole snapshots. Pure: every function returns a new
 * history; the hook (use-config-history) holds it and applies the values.
 */

/** Steps kept on the undo stack; the oldest fall off. */
export const HISTORY_LIMIT = 100;

/** Changes with the same key closer together than this are one step. */
export const COALESCE_MS = 500;

export interface History<T> {
  /** Earlier snapshots, oldest first. */
  past: T[];
  /** Undone snapshots, the next redo last. */
  future: T[];
  /** Key and time of the last recorded change (for coalescing). */
  lastKey: string | null;
  lastAt: number;
  /**
   * The snapshot a transaction (one drag) started from; while set, changes
   * are not recorded and `commitTransaction` records them as one step.
   */
  txn: { start: T } | null;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0, txn: null };
}

/**
 * Record a change away from `prev`. A change tagged with the same key as
 * the previous one, within COALESCE_MS of it, joins that step (a slider
 * drag or zone drag is one undo). Any new change clears the redo stack.
 */
export function recordChange<T>(
  history: History<T>,
  prev: T,
  key: string | undefined,
  at: number
): History<T> {
  // Inside a transaction the changes only move the config; the commit records them.
  if (history.txn) return history;
  const coalesce =
    key !== undefined &&
    key === history.lastKey &&
    at - history.lastAt < COALESCE_MS &&
    history.past.length > 0;
  return {
    past: coalesce ? history.past : [...history.past, prev].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key ?? null,
    lastAt: at,
    txn: null,
  };
}

/**
 * Start a transaction from `start` (the config at pointer-down): every
 * change until `commitTransaction` / `cancelTransaction` is one undo step,
 * however long the pauses between them.
 */
export function beginTransaction<T>(history: History<T>, start: T): History<T> {
  return history.txn ? history : { ...history, txn: { start } };
}

/**
 * End a transaction: its changes (`current` differs from the start, by
 * `same`: identity unless the caller compares by value) become one step.
 */
export function commitTransaction<T>(
  history: History<T>,
  current: T,
  at: number,
  same: (a: T, b: T) => boolean = Object.is
): History<T> {
  if (!history.txn) return history;
  const { start } = history.txn;
  const open = { ...history, txn: null };
  return same(current, start) ? open : recordChange(open, start, undefined, at);
}

/** Abort a transaction: the snapshot to restore, and the history as it was before it. */
export function cancelTransaction<T>(
  history: History<T>
): { history: History<T>; value: T } | null {
  if (!history.txn) return null;
  return { value: history.txn.start, history: { ...history, txn: null } };
}

/**
 * A fresh history for a value replaced from outside (the server copy
 * arriving). A transaction in flight stays open from the new value, so the
 * drag still commits as one step and Esc still restores something.
 */
export function resetHistory<T>(history: History<T>, value: T): History<T> {
  return history.txn ? { ...emptyHistory<T>(), txn: { start: value } } : emptyHistory<T>();
}

/**
 * The same history with `change` applied to every snapshot (past, future and a transaction's start), for a change
 * that belongs to no step (a Settings change): undo and redo then cross it without reverting it, and nothing is lost.
 */
export function mapHistory<T>(history: History<T>, change: (value: T) => T): History<T> {
  return {
    ...history,
    past: history.past.map(change),
    future: history.future.map(change),
    txn: history.txn ? { start: change(history.txn.start) } : null,
  };
}

/** Step back: the snapshot to show, and `current` moves to the redo stack. */
export function undoChange<T>(
  history: History<T>,
  current: T
): { history: History<T>; value: T } | null {
  if (history.past.length === 0) return null;
  return {
    value: history.past[history.past.length - 1],
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
      lastKey: null,
      lastAt: 0,
      txn: null,
    },
  };
}

/** Step forward again: the inverse of `undoChange`. */
export function redoChange<T>(
  history: History<T>,
  current: T
): { history: History<T>; value: T } | null {
  if (history.future.length === 0) return null;
  return {
    value: history.future[history.future.length - 1],
    history: {
      past: [...history.past, current].slice(-HISTORY_LIMIT),
      future: history.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
      txn: null,
    },
  };
}
