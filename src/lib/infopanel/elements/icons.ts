/**
 * The Icon element's icon set, loaded on first use: the markup is its own chunk, so a kiosk or a
 * studio that shows no Icon element never fetches it. Until it has loaded, an icon draws empty.
 */
let markup: Readonly<Record<string, string>> | null = null;
let loading: Promise<void> | null = null;

/** Loads the set once; every caller waits for the same load. */
export function loadIcons(): Promise<void> {
  loading ??= import("./icons.generated.ts").then((m) => {
    markup = m.ELEMENT_ICON_MARKUP;
  });
  return loading;
}

export const iconsLoaded = (): boolean => markup !== null;

/** The icon names, sorted; empty until the set has loaded. */
export const iconNames = (): string[] => (markup ? Object.keys(markup).sort() : []);

/** An icon's inner markup in a 24 × 24 box; "" for an unknown name, or before the set has loaded. */
export const iconMarkupOf = (name: string): string => (markup && Object.hasOwn(markup, name) ? markup[name] : "");
