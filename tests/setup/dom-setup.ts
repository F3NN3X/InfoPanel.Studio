/**
 * Setup for the test files that opt into a DOM with `// @vitest-environment happy-dom`. Outside one
 * (the `renderToString` tests run in Node) it does nothing. Inside, it stubs what happy-dom lacks or
 * what the app reads from the browser, and unmounts rendered trees after each test.
 */
import { afterEach, beforeEach, vi } from "vitest";

type Listener = (e: MediaQueryListEvent) => void;

const DEFAULT_WIDTH = 1280;
let width = DEFAULT_WIDTH;
const queries = new Set<{ query: string; matches: boolean; listeners: Set<Listener> }>();

/** Whether `query` holds at `px` wide: `(max-width: Npx)` and `(min-width: Npx)`; anything else is false. */
function matchesAt(query: string, px: number): boolean {
  const parts = [...query.matchAll(/\((max|min)-width:\s*([\d.]+)px\)/g)];
  if (parts.length === 0) return false;
  return parts.every(([, kind, n]) => (kind === "max" ? px <= Number(n) : px >= Number(n)));
}

/**
 * Sets the viewport width `matchMedia` answers for (1280 by default) and fires `change` on every query
 * that flipped, inside the caller's `act`. Reset to 1280 before each test.
 */
export function setViewport(px: number): void {
  width = px;
  window.innerWidth = px;
  for (const q of queries) {
    const matches = matchesAt(q.query, px);
    if (matches === q.matches) continue;
    q.matches = matches;
    for (const l of q.listeners) l({ matches, media: q.query } as MediaQueryListEvent);
  }
}

function matchMedia(query: string): MediaQueryList {
  const entry = { query, matches: matchesAt(query, width), listeners: new Set<Listener>() };
  queries.add(entry);
  return {
    media: query,
    get matches() {
      return entry.matches;
    },
    onchange: null,
    addEventListener: (_type: string, l: Listener) => void entry.listeners.add(l),
    removeEventListener: (_type: string, l: Listener) => void entry.listeners.delete(l),
    addListener: (l: Listener) => void entry.listeners.add(l),
    removeListener: (l: Listener) => void entry.listeners.delete(l),
    dispatchEvent: () => false,
  } as MediaQueryList;
}

/** What a stubbed `ResizeObserver` reports for every element it observes (a roomy 800 x 600 by default). */
export const OBSERVED_SIZE = { width: 800, height: 600 };

class StubResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = { ...OBSERVED_SIZE, x: 0, y: 0, top: 0, left: 0, right: OBSERVED_SIZE.width, bottom: OBSERVED_SIZE.height } as DOMRectReadOnly;
    this.callback([{ target, contentRect } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

class StubIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords = () => [];
}

if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  beforeEach(() => {
    width = DEFAULT_WIDTH;
    queries.clear();
    window.innerWidth = DEFAULT_WIDTH;
    window.matchMedia = matchMedia;
    vi.stubGlobal("matchMedia", matchMedia);
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    // Empty, not a real URL: the SVG template previews point an <iframe> at it, and happy-dom logs a load it cannot do.
    URL.createObjectURL = () => "";
    URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
}
