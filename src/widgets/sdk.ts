// The widget SDK (Phase 6b): what a code widget's bundle is built against. Narrow on purpose: its own prop types, not the app's
// internal ones (`TemplateOptions`, the registry's), so the published .d.ts stays small and an internal change does not break a
// published widget. tools/widgets/sdk-types.mjs reads this file and writes public/widget-sdk/infopanel-widget-sdk.d.ts, the file the
// Widgets page links to (Gate 0 answer 6: a downloadable .d.ts now, an npm package later).
//
// The contract (FORMAT.md §18): `widget.js` is an ES module whose default export is a function `(sdk: WidgetSdk) =>
// CodeWidgetDefinition`, normally `(sdk) => sdk.defineWidget({ ... })`. The app calls it with its own React and primitives (a bundle
// carries no React of its own) and checks what it returns (src/widgets/code/validate.ts) before it registers anything.
import type { CSSProperties, ReactNode } from "react";

/** One reading, as the widget sees it: a number or a text, and its unit. */
export interface SdkReading {
  value?: number;
  text?: string;
  unit: string;
  /** The reading's display name, when the source gives one. */
  name?: string;
}

/** An option people can change in the studio's Content tab, stored with each placement. */
export type SdkSetting =
  | { type: "boolean"; key: string; label: string; default: boolean }
  | { type: "number"; key: string; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: "text"; key: string; label: string; default: string }
  | { type: "select"; key: string; label: string; default: string; options: { value: string; label: string }[] };

/** What the widget's component is given on every draw. */
export interface CodeWidgetProps {
  /** The readings under the widget's `reads` prefixes, by key. */
  sensors: Record<string, SdkReading>;
  /** The placement's option values (each `settings` key, its stored value or its default). */
  settings: Record<string, string | number | boolean>;
}

/** What `defineWidget` takes: one code widget. The app draws its card (title, theme, pack) around `render`. */
export interface CodeWidgetDefinition {
  /** The name shown in Add and on the card, 1 to 48 characters. */
  name: string;
  /** One line for the Widgets page and Add, 120 at most. */
  description?: string;
  /** A Material Symbols name for the card's header (default `dashboard`). */
  icon?: string;
  /** Sensor key prefixes the widget reads (`cpu.`, `gpu.0.`); at most 16. `[]`: it reads none. */
  reads: string[];
  /** The size Add opens it at, and the smallest it may be, in cells (1 to 12 each). */
  defaultSize: [number, number];
  minSize?: [number, number];
  /** The options people can change; at most 16. */
  settings?: SdkSetting[];
  /**
   * Offers the widget for a page rail's widget slot (72 px wide, 64 to 76 high; pinned layer P6), with these option values
   * there (each a `settings` key and a value of its type). Unset: the widget is not offered in the rail. Older builds ignore it.
   */
  rail?: { settings?: Record<string, string | number | boolean> };
  /** The widget's body. A component: hooks from `sdk.React` work in it. */
  render: (props: CodeWidgetProps) => ReactNode;
}

/** Identity at run time: the type is the point. */
export const defineWidget = (def: CodeWidgetDefinition): CodeWidgetDefinition => def;

/** A ring gauge: `value` of `max`, coloured by the theme's tone. */
export interface SdkRingProps {
  value?: number;
  max?: number;
  t?: "ok" | "warn" | "crit";
  children?: ReactNode;
}

/** A large number in the theme's numeral style. */
export interface SdkNumProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A horizontal bar: `value` of `max`. */
export interface SdkBarProps {
  value?: number;
  max?: number;
  t?: "ok" | "warn" | "crit";
}

/** An icon by its Material Symbols name. */
export interface SdkIconProps {
  name?: string;
  className?: string;
}

/** The empty card's body, with a word on why. */
export interface SdkEmptyProps {
  icon?: string;
  label: string;
  hint?: string;
}

/** The React a widget uses: the app's own, so hooks and the theme work. */
export interface SdkReact {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: ReactNode[]) => ReactNode;
  Fragment: unknown;
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useMemo: <T>(make: () => T, deps: readonly unknown[]) => T;
  useRef: <T>(initial: T) => { current: T };
}

/** What the app hands a bundle's default export. */
export interface WidgetSdk {
  /** The SDK's version; a bundle may refuse to run on one it does not know. */
  version: 1;
  defineWidget: typeof defineWidget;
  React: SdkReact;
  Ring: (p: SdkRingProps) => ReactNode;
  Num: (p: SdkNumProps) => ReactNode;
  Bar: (p: SdkBarProps) => ReactNode;
  Icon: (p: SdkIconProps) => ReactNode;
  Empty: (p: SdkEmptyProps) => ReactNode;
  /** A reading as text with its unit (`fmt`): "42 %", "1.5 GHz", "—" for none. */
  format: (reading: SdkReading | undefined, decimals?: number) => string;
}

/** A bundle's default export. */
export type WidgetBundle = (sdk: WidgetSdk) => CodeWidgetDefinition;
