/**
 * The queue behind the gallery's live thumbnails (pure): which thumbnails are wanted, which are being drawn (at most
 * `limit` at once, since each is a whole screen of widgets) and the pictures done. A card asks when it is on screen and
 * lets go when it leaves; a thumbnail nobody wants any more is not started. Pictures are kept for the session, so the
 * dialog opens full the second time. One that failed is not asked for again.
 */
export interface ThumbQueue<S> {
  /** The picture of a key, once taken. */
  get: (key: string) => string | undefined;
  /** Ask for a key's picture; the result lets go of the ask. */
  want: (key: string, spec: S) => () => void;
  /** The keys being drawn now, with what draws them. */
  active: () => readonly (readonly [string, S])[];
  done: (key: string, picture: string) => void;
  fail: (key: string) => void;
  subscribe: (listener: () => void) => () => void;
  /** Changes whenever anything above does (for `useSyncExternalStore`). */
  version: () => number;
}

export function createThumbQueue<S>(limit: number): ThumbQueue<S> {
  const pictures = new Map<string, string>();
  const failed = new Set<string>();
  const wanted = new Map<string, number>();
  const specs = new Map<string, S>();
  const waiting: string[] = [];
  const drawing = new Set<string>();
  const listeners = new Set<() => void>();
  let version = 0;

  const changed = () => {
    version++;
    listeners.forEach((l) => l());
  };
  const pump = () => {
    while (drawing.size < limit && waiting.length > 0) drawing.add(waiting.shift()!);
  };

  return {
    get: (key) => pictures.get(key),
    want(key, spec) {
      wanted.set(key, (wanted.get(key) ?? 0) + 1);
      specs.set(key, spec);
      if (!pictures.has(key) && !failed.has(key) && !drawing.has(key) && !waiting.includes(key)) {
        waiting.push(key);
        pump();
        changed();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (wanted.get(key) ?? 1) - 1;
        if (left > 0) {
          wanted.set(key, left);
          return;
        }
        wanted.delete(key);
        const at = waiting.indexOf(key);
        if (at >= 0) waiting.splice(at, 1);
      };
    },
    active: () => [...drawing].map((key) => [key, specs.get(key)!] as const),
    done(key, picture) {
      pictures.set(key, picture);
      drawing.delete(key);
      pump();
      changed();
    },
    fail(key) {
      failed.add(key);
      drawing.delete(key);
      pump();
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
  };
}
