// A widget kind's component in its own chunk: the registry keeps the light catalog entry (`meta/`) and settings, and
// the component loads the first time a zone draws it, or earlier from the shown profile (`preload.ts`).
import { useEffect, useState, type ComponentType } from "react";

/** The component, standing in for the widget's own until its chunk is in; `preload` fetches the chunk. */
export type LazyWidget<C> = C & { preload: () => Promise<void> };

// biome-ignore lint/suspicious/noExplicitAny: any widget component; the stand-in keeps its exact props.
export function lazyWidget<C extends ComponentType<any>>(load: () => Promise<{ default: C }>): LazyWidget<C> {
  let Loaded: ComponentType<object> | undefined;
  let pending: Promise<void> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (m) => {
        Loaded = m.default as ComponentType<object>;
      },
      // A failed fetch (the server restarting mid-load) is tried again by the next zone that draws it.
      (e: unknown) => {
        pending = undefined;
        throw e;
      }
    ));
  // Not Suspense: React holds a revealed boundary back for up to 300 ms, and the zone would wait that long after its
  // chunk is in. Until then the zone draws nothing, as it does before its first reading.
  const Lazy = (props: object) => {
    const [, setReady] = useState(Loaded !== undefined);
    const [failed, setFailed] = useState<{ error: unknown }>();
    useEffect(() => {
      if (Loaded) return;
      let live = true;
      preload().then(
        () => live && setReady(true),
        (error: unknown) => live && setFailed({ error })
      );
      return () => {
        live = false;
      };
    }, []);
    // The zone's error boundary shows it; a change to the zone clears it and asks again.
    if (failed) throw failed.error;
    return Loaded ? <Loaded {...props} /> : null;
  };
  return Object.assign(Lazy, { preload }) as unknown as LazyWidget<C>;
}

/** The `preload` of a component made by `lazyWidget`, if it is one. */
export const preloadOf = (c: unknown): (() => Promise<void>) | undefined =>
  typeof c === "function" && "preload" in c && typeof c.preload === "function" ? (c.preload as () => Promise<void>) : undefined;

/** Loads every lazy widget of `mods`: Vitest renders them with renderToString, which runs no effects. */
export const loadAll = (mods: readonly { preload?: () => Promise<void> }[]): Promise<unknown> => Promise.all(mods.map((m) => m.preload?.()));
