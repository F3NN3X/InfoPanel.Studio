// The builder's undo and redo: each edit is a whole new recipe (builder-model.ts), so a step is the value before it. Pure.

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

/** How many steps back undo keeps. */
export const HISTORY_LIMIT = 100;

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** An edit: the present becomes a step back, and what was undone is gone. The same value is no step. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

/** An edit folded into the last step (a paste after a cut: one move, one undo step); what was undone is gone. */
export function amend<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: h.past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
