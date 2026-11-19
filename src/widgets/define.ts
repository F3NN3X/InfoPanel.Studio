// The shape of a widget folder's widget.ts (`src/widgets/<kebab-id>/`). Built-ins and (later) widget packages share it;
// `folder-module.ts` turns one into the DashboardModule the registry groups make with templateModule.
import type { ComponentType } from "react";
import type { ApiSources } from "@/lib/catalog";
import type { IslandSourceDef } from "@/lib/island/sources";
import type { CompactShape, ModuleSetting, ModuleSettings } from "@/modules/types";
import type { ShellProps, WidgetMeta } from "./core/types";
import type { TemplateOptions } from "./module";
import type { InspectorMeta } from "./registry/inspector-meta";

/** The props templateModule hands every widget component. */
export type WidgetProps<P extends object> = ShellProps & { look?: ModuleSettings } & P;

/** How the widget draws: its component's chunk and the props its stored settings make. */
export interface WidgetRender<P extends object> {
  /** A dynamic import of the folder's component. The registry wraps it in lazyWidget, so it is its own chunk. */
  load: () => Promise<{ default: ComponentType<WidgetProps<P>> }>;
  /** Resolved settings (and the zone's saved values) to props. */
  toProps: TemplateOptions<P>["toProps"];
  /** Prefixes read but not owned (`DashboardModule.reads`). */
  reads?: string[];
  /** Overrides `meta.name` as the module title. */
  title?: string;
  /** The settings block before the widget's own; default the standard block. */
  base?: ModuleSetting[];
}

/** A slot whose data stays central for built-ins: settings migrations (`src/lib/settings-migrate*.ts`), demo and QA data. */
export type Central = "central";

/** Reserved for packages: a widget's own settings version and its steps. Built-ins say "central". */
export interface WidgetMigration {
  from: number;
  up: (saved: ModuleSettings) => ModuleSettings;
}

/**
 * A named bundle of a view, option values and a size (`presets.ts`, a studio-only chunk). Add writes the view and the settings
 * (the default preset writes nothing: it is what a fresh widget is) and opens the zone at `size`; picking one in the inspector
 * writes the view and the settings. Exactly one preset per widget has `default: true`.
 */
export interface WidgetPreset {
  id: string;
  name: string;
  /** The `meta.views` id it sets; absent for a widget without views. */
  view?: string;
  settings: ModuleSettings;
  /**
   * The size Add opens it at, in cells (never below the widget's, or the view's, minimum); or `"rail"`, a slot of the page
   * rail (decision 8, `src/widgets/page-rail/`), which is not a grid size: Add and the grid inspector leave such a preset out.
   */
  size: [number, number] | "rail";
  /** The view's own minimum when it differs from the widget's. */
  minSize?: [number, number];
  /** The Add row's line and its search words; absent = the widget's. */
  blurb?: string;
  tags?: string;
  default?: true;
}

/** What a package ships for previews and QA (built-ins keep `src/widgets/__fixtures__` and widget-qa). */
export interface WidgetSample {
  sensors: Record<string, string | number>;
  settings?: ModuleSettings;
}

/** controls.tsx's default export: shown in the Content tab next to the schema rows. */
export interface WidgetControlsProps {
  values: ModuleSettings;
  onPatch: (patch: ModuleSettings) => void;
  sources: ApiSources | null;
}

export interface WidgetDefinition<P extends object = object> {
  /** The catalog entry, views and view key included, from the folder's meta.ts. */
  meta: WidgetMeta;
  /**
   * Header, small-zone shape, Units & Thresholds rows (what `INSPECTOR_META` holds for the group widgets); `byView` sets
   * some of them per view, for a view that draws a merged-away widget as it did (its data gate is `meta.views[].prefixes`).
   */
  inspector: InspectorMeta;
  /** The widget's own settings, after the standard block. */
  settings: ModuleSetting[];
  /** The keys of `settings` a page rail slot of this widget offers in its inspector (a 72 px slot); absent = none. */
  railSettings?: string[];
  render: WidgetRender<P>;
  /** "Send to island": for built-ins, a def from the central island files. */
  island?: IslandSourceDef;
  /** Absent = "central", the built-ins' default. Packages: their own steps and version, stated (`PackageWidgetDefinition`). */
  migrations?: Central | { version: number; steps: readonly WidgetMigration[] };
  /**
   * Absent = "central" (fixtures, widget-qa demo settings), the built-ins' default, or `{ none: why }`. Packages: a
   * loader, stated (`PackageWidgetDefinition`).
   */
  sample?: Central | { none: string } | (() => Promise<{ default: WidgetSample }>);
  /** Packages only. A built-in ships presets.ts and controls.tsx as files, which the generator wires into a studio-only module. */
  presets?: () => Promise<{ default: readonly WidgetPreset[] }>;
  controls?: () => Promise<{ default: ComponentType<WidgetControlsProps> }>;
}

/* The small-zone shapes of `inspector.compact`, shared so each definition names one rather than spelling it out. */
/** A summary card and a dense view of its own (`compact` and `studio` descriptors). */
export const BOTH: CompactShape = { card: true, dense: true };
/** A summary card; the dense view falls back to it (no `studio` descriptor). */
export const CARD: CompactShape = { card: true, dense: "fallback" };
/** A dense view only (no `compact` descriptor). */
export const DENSE: CompactShape = { card: false, dense: true };
/** Neither: small zones keep the full layout. */
export const NONE: CompactShape = { card: false, dense: false };

/** A widget package's definition: it always states its migrations and its sample, where a built-in leaves them central. */
export type PackageWidgetDefinition<P extends object = object> = WidgetDefinition<P> & Required<Pick<WidgetDefinition<P>, "migrations" | "sample">>;

/** The preset sizes a grid zone can take: a rail preset is for a rail slot only. */
export const gridPresets = <T extends Pick<WidgetPreset, "size">>(list: readonly T[]): (T & { size: [number, number] })[] =>
  list.filter((p): p is T & { size: [number, number] } => p.size !== "rail");

/** Identity at run time: the type is the point. */
export const defineWidget = <P extends object>(def: WidgetDefinition<P>): WidgetDefinition<P> => def;
